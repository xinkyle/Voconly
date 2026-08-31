use lazy_static::lazy_static;
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

lazy_static! {
    pub(crate) static ref APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);
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
        return;
    }

    SHOULD_STOP.store(false, Ordering::SeqCst);

    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = Some(app);
    }

    IS_LISTENING.store(true, Ordering::SeqCst);

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

/// 初始化插件
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("keyhook")
        .invoke_handler(tauri::generate_handler![
            start_listen,
            stop_listen,
            is_listening
        ])
        .build()
}