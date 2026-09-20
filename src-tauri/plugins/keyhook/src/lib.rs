use lazy_static::lazy_static;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Emitter;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

/// 键盘事件 payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEventPayload {
    /// 标准化按键名称，如 LeftCtrl、RightShift
    pub keycode: String,
    /// 平台特定的原始键码
    pub raw_code: u32,
    /// 按键状态：down 或 up
    pub event_type: String,
}

/// 快捷键拦截规则
/// 支持组合键：只有当指定修饰键被按下时才拦截目标键
#[derive(Clone, Debug)]
pub struct ShortcutBlockRule {
    /// 要拦截的键 -> 需要的修饰键集合
    /// 例如：Digit1 -> {LeftCtrl} 表示只有 LeftCtrl 按下时才拦截 Digit1
    /// 空集合表示单键快捷键，直接拦截
    blocks: HashMap<String, HashSet<String>>,
}

impl Default for ShortcutBlockRule {
    fn default() -> Self {
        Self {
            blocks: HashMap::new(),
        }
    }
}

lazy_static! {
    pub(crate) static ref APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);
    /// 快捷键拦截规则
    pub(crate) static ref SHORTCUT_BLOCK_RULE: Mutex<ShortcutBlockRule> = Mutex::new(ShortcutBlockRule::default());
}

pub(crate) static IS_LISTENING: AtomicBool = AtomicBool::new(false);
pub(crate) static SHOULD_STOP: AtomicBool = AtomicBool::new(false);

/// 发送键盘事件到前端
pub(crate) fn emit_key_event(app: &tauri::AppHandle, payload: KeyEventPayload) {
    if let Err(e) = app.emit("keyhook:key-event", &payload) {
        tracing::error!("Failed to emit key event: {}", e);
    }
}

/// 通知前端全局键盘监听的状态变化（tap 创建成功 / 失败），
/// 前端据此显示或清除权限引导提示
pub(crate) fn emit_listen_state(app: &tauri::AppHandle, started: bool) {
    let event = if started {
        "keyhook:listen-started"
    } else {
        "keyhook:listen-failed"
    };
    if let Err(e) = app.emit(event, ()) {
        tracing::error!("Failed to emit {}: {}", event, e);
    }
}

/// 开始监听键盘事件
#[tauri::command]
fn start_listen(app: tauri::AppHandle) {
    if IS_LISTENING.load(Ordering::SeqCst) {
        tracing::info!("[Keyhook] Already listening, skipping");
        return;
    }

    SHOULD_STOP.store(false, Ordering::SeqCst);

    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = Some(app);
    }

    // 注意：IS_LISTENING 由 start_hook_thread 内部设置
    // 不要在这里设置，避免与 start_hook_thread 内部的检查冲突

    #[cfg(target_os = "windows")]
    windows::start_hook_thread();

    #[cfg(target_os = "macos")]
    macos::start_hook_thread();
}

/// 停止监听键盘事件
#[tauri::command]
fn stop_listen() {
    if !IS_LISTENING.load(Ordering::SeqCst) {
        return;
    }

    SHOULD_STOP.store(true, Ordering::SeqCst);

    #[cfg(target_os = "windows")]
    windows::stop_hook_thread();

    #[cfg(target_os = "macos")]
    macos::stop_hook_thread();

    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = None;
    }
}

/// 检查是否正在监听
#[tauri::command]
fn is_listening() -> bool {
    IS_LISTENING.load(Ordering::SeqCst)
}

/// 规范化键名，将用户输入的键名转换为标准格式
fn normalize_key_name(key: &str) -> String {
    // 修饰键规范化
    let modifier_map = [
        ("ctrl", "Ctrl"),
        ("leftctrl", "LeftCtrl"),
        ("rightctrl", "RightCtrl"),
        ("alt", "Alt"),
        ("leftalt", "LeftAlt"),
        ("rightalt", "RightAlt"),
        ("shift", "Shift"),
        ("leftshift", "LeftShift"),
        ("rightshift", "RightShift"),
        ("win", "Windows"),
        ("leftwin", "LeftWindows"),
        ("rightwin", "RightWindows"),
    ];

    let lower_key = key.to_lowercase();
    for (alias, standard) in modifier_map {
        if lower_key == alias {
            return standard.to_string();
        }
    }

    // 符号键规范化
    let symbol_map = [
        (".", "Period"),
        ("/", "Slash"),
        (",", "Comma"),
        (";", "Semicolon"),
        ("=", "Equal"),
        ("-", "Minus"),
        ("`", "Backquote"),
        ("[", "BracketLeft"),
        ("]", "BracketRight"),
        ("\\", "Backslash"),
        ("'", "Quote"),
    ];

    for (symbol, standard) in symbol_map {
        if key == symbol {
            return standard.to_string();
        }
    }

    // 数字键规范化：0-9 -> Digit0-Digit9
    if key.len() == 1 && key.chars().next().unwrap().is_ascii_digit() {
        return format!("Digit{}", key);
    }

    // 字母键规范化：a-z/A-Z -> KeyA-KeyZ
    if key.len() == 1 && key.chars().next().unwrap().is_ascii_alphabetic() {
        return format!("Key{}", key.to_uppercase());
    }

    // 功能键、其他键保持原样
    key.to_string()
}

/// 设置快捷键拦截
/// shortcuts: 快捷键配置列表，格式为 "Key1+Modifier1+Modifier2"
/// 例如：["LeftCtrl+Digit1", "F1"]
#[tauri::command]
fn set_shortcut_block(shortcuts: Vec<String>) {
    if let Ok(mut guard) = SHORTCUT_BLOCK_RULE.lock() {
        guard.blocks.clear();

        for shortcut in shortcuts {
            tracing::info!("[Keyhook] Processing shortcut: {}", shortcut);

            let keys: Vec<String> = shortcut.split('+')
                .map(|s| normalize_key_name(s.trim()))
                .collect();

            if keys.is_empty() {
                continue;
            }

            if keys.len() == 1 {
                // 单键快捷键：直接拦截
                tracing::info!("[Keyhook] Single key: {} -> block directly", keys[0]);
                guard.blocks.insert(keys[0].clone(), HashSet::new());
            } else {
                // 组合键：最后一个键是目标键，其他是修饰键
                let target_key = keys.last().unwrap().clone();
                let modifiers: HashSet<String> = keys[..keys.len() - 1].iter().cloned().collect();
                tracing::info!("[Keyhook] Combo: {} + {:?} -> block {} when modifiers pressed", target_key, modifiers, target_key);
                guard.blocks.insert(target_key, modifiers);
            }
        }

        tracing::info!(
            "[Keyhook] Shortcut block updated: {} shortcuts registered",
            guard.blocks.len()
        );
    }
}

/// 清除拦截规则
#[tauri::command]
fn clear_block_rule() {
    if let Ok(mut guard) = SHORTCUT_BLOCK_RULE.lock() {
        guard.blocks.clear();
        tracing::debug!("Shortcut block rule cleared");
    }
}

/// 初始化插件
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("keyhook")
        .invoke_handler(tauri::generate_handler![
            start_listen,
            stop_listen,
            is_listening,
            set_shortcut_block,
            clear_block_rule
        ])
        .build()
}