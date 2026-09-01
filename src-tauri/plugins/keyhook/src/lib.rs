use lazy_static::lazy_static;
use std::collections::HashSet;
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

/// 拦截规则
#[derive(Clone, Debug)]
pub struct BlockRule {
    /// 要拦截的按键名称列表
    pub keycodes: HashSet<String>,
    /// 是否拦截 keydown 事件
    pub block_down: bool,
    /// 是否拦截 keyup 事件
    pub block_up: bool,
    /// 是否拦截修饰键的单独按下（用于快捷键拦截）
    pub block_modifier_alone: bool,
}

impl Default for BlockRule {
    fn default() -> Self {
        Self {
            keycodes: HashSet::new(),
            block_down: false,
            block_up: false,
            block_modifier_alone: false,
        }
    }
}

lazy_static! {
    pub(crate) static ref APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);
    /// 拦截规则
    pub(crate) static ref BLOCK_RULE: Mutex<BlockRule> = Mutex::new(BlockRule::default());
}

pub(crate) static IS_LISTENING: AtomicBool = AtomicBool::new(false);
pub(crate) static SHOULD_STOP: AtomicBool = AtomicBool::new(false);

/// 发送键盘事件到前端
pub(crate) fn emit_key_event(app: &tauri::AppHandle, payload: KeyEventPayload) {
    if let Err(e) = app.emit("keyhook:key-event", &payload) {
        tracing::error!("Failed to emit key event: {}", e);
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

/// 设置拦截规则
#[tauri::command]
fn set_block_rule(keycodes: Vec<String>, block_down: bool, block_up: bool) {
    if let Ok(mut guard) = BLOCK_RULE.lock() {
        guard.keycodes = keycodes.into_iter().collect();
        guard.block_down = block_down;
        guard.block_up = block_up;
        tracing::debug!(
            "Block rule updated: {:?} keys, down={}, up={}",
            guard.keycodes.len(),
            guard.block_down,
            guard.block_up
        );
    }
}

/// 设置快捷键拦截（拦截按键并阻止传递给其他应用）
#[tauri::command]
fn set_shortcut_block(keycodes: Vec<String>) {
    if let Ok(mut guard) = BLOCK_RULE.lock() {
        guard.keycodes = keycodes.into_iter().collect();
        // 拦截 keydown 和 keyup
        guard.block_down = true;
        guard.block_up = true;
        tracing::info!(
            "[Keyhook] Shortcut block set: {:?} keys",
            guard.keycodes
        );
    }
}

/// 清除拦截规则
#[tauri::command]
fn clear_block_rule() {
    if let Ok(mut guard) = BLOCK_RULE.lock() {
        guard.keycodes.clear();
        guard.block_down = false;
        guard.block_up = false;
        tracing::debug!("Block rule cleared");
    }
}

/// 初始化插件
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("keyhook")
        .invoke_handler(tauri::generate_handler![
            start_listen,
            stop_listen,
            is_listening,
            set_block_rule,
            set_shortcut_block,
            clear_block_rule
        ])
        .build()
}