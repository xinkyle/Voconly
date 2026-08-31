//#![windows_subsystem = "windows"]  // 隐藏 CMD 控制台窗口
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::panic;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    webview::WebviewWindowBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow,
};

use arboard::Clipboard;
use enigo::{Enigo, Key, Keyboard, Settings};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_log::{Builder, RotationStrategy, Target, TargetKind};

#[cfg(windows)]
use windows::Win32::UI::HiDpi::{
    SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowTextW};

use audio::AudioCapture;

// Re-declare modules in binary crate
mod audio;
mod backends;
mod catalog;
mod commands;
mod config;
mod crash_report;
mod debug_audio; // TEMPORARY: Debug audio module for testing
mod dictionary;
mod history;
mod llm;
mod llm_models;
mod log_settings;
mod model_manager;
mod paths;
mod performance;
mod presets;
mod updater;
mod utils; // Crash report module for enhanced crash tracking

use config::{config_exists, get_model_storage_path, load_config, save_config, AppConfig, AppServices};
use history::{
    add_history_record, clear_history, delete_history_record, get_archive_stats, get_full_stats,
    get_history_count, load_history, load_history_paged, rebuild_stats, save_history,
};
use paths::resolve_resource_path;
use utils::downloader::{
    cancel_model_download, check_model_exists_cmd, download_model_from_url, download_model_with_source,
    get_downloading_model_ids, get_model_storage_path_cmd,
};

/// Double-tap detection time window (ms)
const DOUBLE_TAP_WINDOW_MS: u64 = 300;

// Store registered shortcuts and debounce times
struct AppState {
    shortcuts: Mutex<Vec<String>>,
    tray: Mutex<Option<TrayIcon>>,
    float_panel_shown: Mutex<bool>,
    audio_capture: Mutex<Option<AudioCapture>>,
    /// Tracks pending shortcut triggers for double-tap detection
    /// scene_id -> (first_trigger_time, pending_thread_handle)
    shortcut_pending: Mutex<HashMap<String, Instant>>,
    // Mutex to serialize clipboard operations (Windows clipboard is single-access)
    clipboard_lock: Mutex<()>,
    // Streaming mode setting (persisted across AudioCapture lifecycle)
    streaming_mode: Mutex<bool>,
    // ESC cancel shortcut registered state (for canceling recording)
    esc_cancel_registered: Mutex<bool>,
    // 流式转录预览文字累积 (仅在预览窗口显示，停止时才输出)
    preview_text: Mutex<String>,
    // 预览窗口是否可见
    preview_window_visible: Mutex<bool>,
    // 独立的录音状态标志（区分 "已预加载VAD" 和 "正在录音"）
    is_recording: Mutex<bool>,
}

/// Shortcut trigger event payload with skip_llm flag
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutTriggerPayload {
    pub scene_id: String,
    pub skip_llm: bool,
}

/// Emit shortcut event to frontend
fn emit_shortcut_event(app: &AppHandle, scene_id: &str, skip_llm: bool) {
    let payload = ShortcutTriggerPayload {
        scene_id: scene_id.to_string(),
        skip_llm,
    };
    info!(
        "[EMIT] About to emit shortcut-triggered: scene_id={}, skip_llm={}",
        scene_id, skip_llm
    );
    if let Err(e) = app.emit("shortcut-triggered", &payload) {
        error!("[EMIT] Failed to emit shortcut event: {}", e);
    } else {
        info!(
            "[EMIT] Successfully emitted shortcut-triggered: scene_id={}, skip_llm={}",
            scene_id, skip_llm
        );
    }
}

#[tauri::command]
async fn register_shortcut(
    app: AppHandle,
    shortcut: String,
    scene_id: String,
) -> Result<(), String> {
    info!("Registering shortcut: {} for scene: {}", shortcut, scene_id);

    let shortcut: Shortcut = shortcut.parse().map_err(|e| {
        error!("Failed to parse shortcut: {}", e);
        format!("Invalid shortcut format: {}", e)
    })?;

    let app_handle = app.clone();
    let scene_id_clone = scene_id.clone();

    info!(
        "Parsed shortcut: {:?}, registering with global_shortcut plugin",
        shortcut
    );

    // Register the shortcut with callback
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let now = Instant::now();

                // Check for double-tap and handle debounce
                match app.try_state::<AppState>() {
                    Some(state) => {
                        // Check if currently recording using the dedicated flag
                        let is_recording = {
                            match state.is_recording.lock() {
                                Ok(guard) => *guard,
                                Err(_) => false,
                            }
                        };

                        if !is_recording {
                            // Not recording: start recording immediately, no need to wait for double-tap
                            info!("Shortcut pressed while idle, emitting immediately (scene: {})", scene_id_clone);
                            emit_shortcut_event(app, &scene_id_clone, false);
                            return;  // Skip double-tap detection for starting recording
                        }

                        // Currently recording: check for double-tap (to skip LLM)
                        info!("[SHORTCUT] Recording in progress, checking for double-tap (scene: {}, time: {:?})", scene_id_clone, now);
                        let is_double_tap = {
                            match state.shortcut_pending.lock() {
                                Ok(mut pending_map) => {
                                    let result = match pending_map.get(&scene_id_clone) {
                                        Some(first_time) => {
                                            let elapsed = now.duration_since(*first_time);
                                            info!("[SHORTCUT] Found pending first tap at {:?}, elapsed: {}ms", first_time, elapsed.as_millis());
                                            if elapsed.as_millis() < DOUBLE_TAP_WINDOW_MS as u128 {
                                                // Double-tap detected! Remove pending entry
                                                pending_map.remove(&scene_id_clone);
                                                info!("[SHORTCUT] Double-tap DETECTED for scene: {} (elapsed: {}ms < {}ms window), will emit skip_llm=true",
                                                    scene_id_clone, elapsed.as_millis(), DOUBLE_TAP_WINDOW_MS);
                                                true
                                            } else {
                                                info!("[SHORTCUT] First tap too old ({}ms >= {}ms), treating as new single-tap", elapsed.as_millis(), DOUBLE_TAP_WINDOW_MS);
                                                false
                                            }
                                        }
                                        None => {
                                            info!("[SHORTCUT] No pending first tap found, this is first tap");
                                            false
                                        }
                                    };
                                    result
                                }
                                Err(_) => false,
                            }
                        };

                        if is_double_tap {
                            // Double-tap: emit skip_llm=true immediately
                            info!("[SHORTCUT] Emitting shortcut-triggered with skip_llm=true (double-tap)");
                            emit_shortcut_event(app, &scene_id_clone, true);
                        } else {
                            // Record this as first trigger (potential single-tap)
                            info!("[SHORTCUT] Recording first tap for scene: {} at {:?}, will emit skip_llm=false after {}ms if no double-tap",
                                scene_id_clone, now, DOUBLE_TAP_WINDOW_MS);
                            if let Ok(mut pending_map) = state.shortcut_pending.lock() {
                                pending_map.insert(scene_id_clone.clone(), now);
                            }

                            // Spawn a delayed task to emit skip_llm=false after DOUBLE_TAP_WINDOW_MS
                            let app_for_thread = app.clone();
                            let scene_for_thread = scene_id_clone.clone();
                            thread::spawn(move || {
                                thread::sleep(Duration::from_millis(DOUBLE_TAP_WINDOW_MS));

                                // Check if this trigger is still pending (no double-tap occurred)
                                if let Some(state) = app_for_thread.try_state::<AppState>() {
                                    if let Ok(mut pending_map) = state.shortcut_pending.lock() {
                                        if pending_map.contains_key(&scene_for_thread) {
                                            // Still pending, emit as single-tap (skip_llm=false)
                                            pending_map.remove(&scene_for_thread);
                                            info!("Single-tap confirmed for scene: {}, emitting skip_llm=false", scene_for_thread);
                                            emit_shortcut_event(&app_for_thread, &scene_for_thread, false);
                                        } else {
                                            // Was consumed by double-tap, do nothing
                                            info!("Trigger for scene: {} was consumed by double-tap, skipping delayed emit", scene_for_thread);
                                        }
                                    }
                                }
                            });
                        }
                    }
                    None => {
                        error!("Failed to get AppState for scene: {}", scene_id_clone);
                    }
                };
            }
        })
        .map_err(|e| {
            error!("Failed to register shortcut: {}", e);
            format!("Failed to register shortcut: {}", e)
        })?;

    // Store the shortcut
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut shortcuts) = state.shortcuts.lock() {
            shortcuts.push(shortcut.to_string());
        }
    }

    info!("Shortcut registered successfully: {}", shortcut);
    Ok(())
}

#[tauri::command]
async fn unregister_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    info!("Unregistering shortcut: {}", shortcut);

    let shortcut: Shortcut = shortcut.parse().map_err(|e| {
        error!("Failed to parse shortcut: {}", e);
        format!("Invalid shortcut format: {}", e)
    })?;

    app.global_shortcut().unregister(shortcut).map_err(|e| {
        error!("Failed to unregister shortcut: {}", e);
        format!("Failed to unregister shortcut: {}", e)
    })?;

    // Remove from stored shortcuts
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut shortcuts) = state.shortcuts.lock() {
            shortcuts.retain(|s| s != &shortcut.to_string());
        }
    }

    info!("Shortcut unregistered successfully: {}", shortcut);
    Ok(())
}

#[tauri::command]
async fn unregister_all_shortcuts(app: AppHandle) -> Result<(), String> {
    info!("Unregistering all shortcuts");

    app.global_shortcut().unregister_all().map_err(|e| {
        error!("Failed to unregister all shortcuts: {}", e);
        format!("Failed to unregister all shortcuts: {}", e)
    })?;

    // Clear stored shortcuts
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut shortcuts) = state.shortcuts.lock() {
            shortcuts.clear();
        }
    }

    info!("All shortcuts unregistered successfully");
    Ok(())
}

/// Detect if the current foreground window is a terminal/CMD window
/// Uses both window class name (more reliable) and title matching
#[cfg(windows)]
fn is_terminal_window() -> bool {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::HWND;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == HWND(std::ptr::null_mut()) {
            return false;
        }

        // First check window class name (most reliable for consoles)
        let mut class_buffer: [u16; 256] = [0; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buffer);

        if class_len > 0 {
            let class_name = OsString::from_wide(&class_buffer[..class_len as usize]);
            let class_str = class_name.to_string_lossy().to_lowercase();

            // Console window class names
            let console_classes = [
                "consolewindowclass",            // CMD
                "cascadia_hosting_window_class", // Windows Terminal
                "windowsterminal",               // Windows Terminal alternative
                "mintty",                        // Git Bash, Cygwin
                "putty",                         // PuTTY
                "alacritty",                     // Alacritty
                "conemu",                        // ConEmu
                "command_window",                // Some terminals
            ];

            for class_keyword in console_classes {
                if class_str.contains(class_keyword) {
                    info!(
                        "[is_terminal_window] Detected terminal by class: {}",
                        class_str
                    );
                    return true;
                }
            }
        }

        // Fallback: check window title
        let mut title_buffer: [u16; 512] = [0; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buffer);

        if title_len > 0 {
            let title = OsString::from_wide(&title_buffer[..title_len as usize]);
            let title_str = title.to_string_lossy().to_lowercase();

            // Terminal-related keywords in window title
            let terminal_keywords = [
                "cmd.exe",
                "command prompt",
                "powershell",
                "windows terminal",
                "git bash",
                "mingw",
                "cygwin",
                "alacritty",
                "conemu",
                "terminal",
            ];

            for keyword in terminal_keywords {
                if title_str.contains(keyword) {
                    info!(
                        "[is_terminal_window] Detected terminal by title: {}",
                        title_str
                    );
                    return true;
                }
            }
        }

        // Log what we found for debugging
        if class_len > 0 {
            let class_name = OsString::from_wide(&class_buffer[..class_len as usize]);
            let class_str = class_name.to_string_lossy();
            info!("[is_terminal_window] Not a terminal. Class: {}", class_str);
        }

        false
    }
}

#[cfg(not(windows))]
fn is_terminal_window() -> bool {
    // On non-Windows platforms, default to Ctrl+V
    false
}

#[tauri::command]
async fn get_registered_shortcuts(app: AppHandle) -> Result<Vec<String>, String> {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(shortcuts) = state.shortcuts.lock() {
            return Ok(shortcuts.clone());
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
async fn simulate_input(app: AppHandle, text: String) -> Result<(), String> {
    let start_time = std::time::Instant::now();
    let thread_id = std::thread::current().id();
    info!(
        "[simulate_input] START - {} characters, thread_id: {:?}",
        text.len(),
        thread_id
    );

    // Acquire clipboard lock to serialize access (Windows clipboard is single-access)
    let app_state = app.state::<AppState>();
    let clipboard_guard = app_state.clipboard_lock.lock().map_err(|e| {
        error!("[simulate_input] FAILED to acquire clipboard lock: {}", e);
        format!("Failed to acquire clipboard lock: {}", e)
    })?;
    info!(
        "[simulate_input] Clipboard lock acquired, thread_id: {:?}",
        thread_id
    );

    // Use clipboard paste for instant text input
    // 1. Create clipboard and save current content
    let mut clipboard = Clipboard::new().map_err(|e| {
        error!("[simulate_input] FAILED to create clipboard: {}", e);
        format!("Failed to access clipboard: {}", e)
    })?;

    let old_clipboard = clipboard.get_text().ok();
    info!(
        "[simulate_input] Old clipboard content: {} chars",
        old_clipboard.as_ref().map(|s| s.len()).unwrap_or(0)
    );

    // 2. Set text to clipboard
    clipboard.set_text(&text).map_err(|e| {
        error!("[simulate_input] FAILED to set clipboard text: {}", e);
        format!("Failed to set clipboard text: {}", e)
    })?;
    info!("[simulate_input] Clipboard text set successfully");

    // 3. Detect if current foreground window is a terminal/CMD
    // In terminals, Ctrl+V doesn't work, so we need Shift+Insert
    let is_terminal = is_terminal_window();
    info!("[simulate_input] Is terminal window: {}", is_terminal);

    // 4. Create enigo instance for simulating keystrokes
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| {
        error!("[simulate_input] FAILED to create enigo instance: {}", e);
        format!("Failed to create enigo instance: {}", e)
    })?;

    if is_terminal {
        // Use Shift+Insert for terminals (CMD, PowerShell, Windows Terminal)
        // Ctrl+V doesn't work in these environments
        info!("[simulate_input] Using Shift+Insert for terminal");

        enigo
            .key(Key::Shift, enigo::Direction::Press)
            .map_err(|e| {
                error!("[simulate_input] FAILED to press Shift: {}", e);
                format!("Failed to press Shift: {}", e)
            })?;

        std::thread::sleep(std::time::Duration::from_millis(30));

        enigo
            .key(Key::Insert, enigo::Direction::Click)
            .map_err(|e| {
                error!("[simulate_input] FAILED to click Insert: {}", e);
                format!("Failed to click Insert: {}", e)
            })?;

        std::thread::sleep(std::time::Duration::from_millis(30));

        enigo
            .key(Key::Shift, enigo::Direction::Release)
            .map_err(|e| {
                error!("[simulate_input] FAILED to release Shift: {}", e);
                format!("Failed to release Shift: {}", e)
            })?;
    } else {
        // Use Ctrl+V for regular applications (Notepad, WeChat, browsers, etc.)
        // This avoids the Insert key "overwrite mode" issue
        info!("[simulate_input] Using Ctrl+V for regular application");

        enigo
            .key(Key::Control, enigo::Direction::Press)
            .map_err(|e| {
                error!("[simulate_input] FAILED to press Control: {}", e);
                format!("Failed to press Control: {}", e)
            })?;

        std::thread::sleep(std::time::Duration::from_millis(30));

        enigo
            .key(Key::Unicode('v'), enigo::Direction::Click)
            .map_err(|e| {
                error!("[simulate_input] FAILED to click V: {}", e);
                format!("Failed to click V: {}", e)
            })?;

        std::thread::sleep(std::time::Duration::from_millis(30));

        enigo
            .key(Key::Control, enigo::Direction::Release)
            .map_err(|e| {
                error!("[simulate_input] FAILED to release Control: {}", e);
                format!("Failed to release Control: {}", e)
            })?;
    }

    info!("[simulate_input] Paste operation completed");

    // Drop enigo first
    drop(enigo);

    // 4. Restore old clipboard content after a delay
    if let Some(old_text) = old_clipboard {
        std::thread::sleep(std::time::Duration::from_millis(300));

        // Check if clipboard content has changed (user may have copied something else)
        match clipboard.get_text() {
            Ok(current_text) => {
                // Only restore if the clipboard still contains what we pasted
                if current_text == text {
                    match clipboard.set_text(&old_text) {
                        Ok(()) => info!("[simulate_input] Clipboard restored to previous content"),
                        Err(e) => warn!(
                            "[simulate_input] WARNING: Failed to restore clipboard: {}",
                            e
                        ),
                    }
                }
            }
            Err(e) => {
                warn!(
                    "[simulate_input] WARNING: Could not read clipboard for restore check: {}",
                    e
                );
            }
        }
    }

    // Explicitly drop clipboard before releasing lock
    drop(clipboard);

    // Release clipboard lock
    drop(clipboard_guard);
    info!(
        "[simulate_input] Clipboard lock released, thread_id: {:?}",
        thread_id
    );

    let elapsed = start_time.elapsed();
    info!(
        "[simulate_input] END - SUCCESS, total time: {}ms",
        elapsed.as_millis()
    );
    Ok(())
}

#[tauri::command]
async fn show_window(window: WebviewWindow) -> Result<(), String> {
    info!("Showing window");
    window.show().map_err(|e| {
        error!("Failed to show window: {}", e);
        format!("Failed to show window: {}", e)
    })?;
    window.set_focus().map_err(|e| {
        error!("Failed to focus window: {}", e);
        format!("Failed to focus window: {}", e)
    })?;
    Ok(())
}

#[tauri::command]
async fn hide_window(window: WebviewWindow) -> Result<(), String> {
    info!("Hiding window");
    window.hide().map_err(|e| {
        error!("Failed to hide window: {}", e);
        format!("Failed to hide window: {}", e)
    })?;
    Ok(())
}

#[tauri::command]
async fn set_window_visible(window: WebviewWindow, visible: bool) -> Result<(), String> {
    info!("Setting window visible: {}", visible);
    if visible {
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
    } else {
        window
            .hide()
            .map_err(|e| format!("Failed to hide window: {}", e))?;
    }
    Ok(())
}

// Float panel state for communication between windows
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FloatPanelState {
    pub visible: bool,
    pub status: String,
    pub scene_name: Option<String>,
    pub text: Option<String>,
    // 进度条相关字段
    pub model_id: Option<String>,
    pub device: Option<String>,
    pub audio_duration: Option<f64>,
    pub is_transcribing: Option<bool>,
    // LLM 进度相关字段
    pub llm_model_id: Option<String>,
    pub has_llm_profile: Option<bool>,
    pub text_len: Option<u32>,
    // 双击跳过 LLM 标记
    pub skip_llm: Option<bool>,
    // 分段转录开关（用于控制状态指示器）
    pub segment_transcribe: Option<bool>,
}

/// Show the float panel at the bottom center of the screen
#[tauri::command]
async fn show_float_panel(app: AppHandle, state: FloatPanelState) -> Result<(), String> {
    info!("[show_float_panel] ===== START =====");
    info!("[show_float_panel] Received state: {:?}", state);
    info!("[show_float_panel] STATUS: {:?}", state.status);
    info!("[show_float_panel] model_id: {:?}, device: {:?}, audio_duration: {:?}, is_transcribing: {:?}",
        state.model_id, state.device, state.audio_duration, state.is_transcribing);

    // Get the float panel window
    let float_window = app
        .get_webview_window("float-panel")
        .ok_or("Float panel window not found")?;
    info!("[show_float_panel] Float panel window found");

    // Emit state update to the float panel window
    app.emit_to("float-panel", "float-panel-update", &state)
        .map_err(|e| format!("Failed to emit float panel update: {}", e))?;

    info!("[show_float_panel] Event emitted to float-panel window");

    // Check if the panel is already shown using our tracked state
    let already_shown = app
        .try_state::<AppState>()
        .and_then(|s| s.float_panel_shown.lock().ok().map(|g| *g))
        .unwrap_or(false);

    // 只在首次显示时设置药丸高度，已显示时保持当前高度
    if !already_shown {
        if let Ok(monitor) = float_window.primary_monitor() {
            if let Some(monitor) = monitor {
                let monitor_size = monitor.size();

                // 初始显示：药丸模式（仅显示状态栏）
                let window_width = 520u32;
                let window_height = 60u32; // 药丸高度：60 物理像素

                // 计算窗口位置：底部居中，距任务栏固定间距
                let x = (monitor_size.width as i32 - window_width as i32) / 2;
                let y = monitor_size.height as i32 - window_height as i32 - 80;

                // 设置窗口大小和位置
                let _ = float_window.set_size(PhysicalSize::new(window_width, window_height));
                let _ = float_window.set_position(PhysicalPosition::new(x, y));

                info!(
                    "Float panel positioned at: x={}, y={}, height={} (pill mode)",
                    x, y, window_height
                );
            }
        }

        // 关键：先取消置顶，再显示窗口，最后重新置顶
        let _ = float_window.set_always_on_top(false);

        // Show float panel window (preview is integrated inside)
        float_window
            .show()
            .map_err(|e| format!("Failed to show float panel: {}", e))?;
        info!("[show_float_panel] Float panel shown successfully");

        // Mark as shown
        if let Some(s) = app.try_state::<AppState>() {
            if let Ok(mut shown) = s.float_panel_shown.lock() {
                *shown = true;
            }
            if let Ok(mut preview_visible) = s.preview_window_visible.lock() {
                *preview_visible = true;
            }
        }
    } else {
        info!("Float panel already visible, keeping current height, only updating state");
        // 窗口已显示，只更新状态，不改变窗口高度
        let _ = float_window.set_always_on_top(false);
    }

    // 无论窗口是否已显示，最后都重新置顶（确保在置顶窗口组的顶部）
    let _ = float_window.set_always_on_top(true);
    // 不获取焦点，保持用户当前应用的焦点
    // let _ = float_window.set_focus();

    info!("Float panel shown successfully");
    Ok(())
}

/// Hide the float panel
#[tauri::command]
async fn hide_float_panel(app: AppHandle, reason: Option<String>) -> Result<(), String> {
    let caller = reason.unwrap_or_else(|| "unknown".to_string());
    info!("[HIDE] hide_float_panel called by: {}", caller);

    // Emit hide event directly to the float panel window first (for animation)
    app.emit_to("float-panel", "float-panel-hide", ())
        .map_err(|e| format!("Failed to emit float panel hide: {}", e))?;

    // Emit hide event to preview window (now integrated in float-panel)
    app.emit_to("float-panel", "preview-window-hide", ())
        .map_err(|e| format!("Failed to emit preview window hide: {}", e))?;

    // Wait for animation (150ms), then hide the windows
    std::thread::sleep(std::time::Duration::from_millis(150));

    // Get the float panel window and hide it
    if let Some(float_window) = app.get_webview_window("float-panel") {
        float_window
            .hide()
            .map_err(|e| format!("Failed to hide float panel: {}", e))?;
    }

    // preview window is no longer used (integrated into float-panel)
    // but we keep the state update
    // Mark as hidden
    if let Some(s) = app.try_state::<AppState>() {
        if let Ok(mut shown) = s.float_panel_shown.lock() {
            *shown = false;
        }
        if let Ok(mut preview_visible) = s.preview_window_visible.lock() {
            *preview_visible = false;
        }
    }

    info!(
        "[HIDE] Float panel and preview window hidden successfully (caller: {})",
        caller
    );
    Ok(())
}

/// Set float panel height (切换窗口高度：药丸模式 vs 展开模式)
/// preview_height: 预览高度档位 "high"(500px) | "medium"(280px) | "low"(120px)
/// 当 preview_height 为 None 时，使用默认展开高度 500px
#[tauri::command]
async fn set_float_panel_height(
    app: AppHandle,
    expanded: bool,
    preview_height: Option<String>,
) -> Result<(), String> {
    info!(
        "Setting float panel height: expanded={}, preview_height={:?}",
        expanded, preview_height
    );

    let float_window = app
        .get_webview_window("float-panel")
        .ok_or("Float panel window not found")?;

    if let Ok(monitor) = float_window.primary_monitor() {
        if let Some(monitor) = monitor {
            let monitor_size = monitor.size();

            // 使用 PhysicalSize 设置物理像素尺寸
            let window_width = 520u32;

            // 根据高度档位设置不同的展开高度
            let target_height = if expanded {
                match preview_height.as_deref() {
                    Some("low") => 140u32,    // 低：约3行
                    Some("medium") => 280u32, // 中：适中
                    _ => 500u32,              // 高（默认）：500px
                }
            } else {
                60u32 // 药丸高度：60 物理像素
            };

            // 计算窗口位置：底部居中，距任务栏固定间距
            let x = (monitor_size.width as i32 - window_width as i32) / 2;
            let y = monitor_size.height as i32 - target_height as i32 - 80;

            // 设置窗口大小和位置（物理像素）
            let _ = float_window.set_size(PhysicalSize::new(window_width, target_height));
            let _ = float_window.set_position(PhysicalPosition::new(x, y));

            info!(
                "Float panel height set to: {}px (expanded={}, preview_height={:?})",
                target_height, expanded, preview_height
            );
        }
    }

    Ok(())
}

/// Open the model folder in file explorer
#[tauri::command]
async fn open_model_folder(model_id: String) -> Result<(), String> {
    // 使用统一辅助函数获取正确路径
    let model_path = crate::utils::downloader::get_model_path_from_preset(&model_id)?;

    // Get parent directory (or the file itself)
    let path_to_open = if model_path.exists() {
        model_path
    } else {
        // If model doesn't exist, open the models directory
        let models_dir = crate::utils::downloader::get_model_storage_dir()?;
        models_dir
    };

    // Open in file explorer
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path_to_open.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path_to_open.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path_to_open.parent().unwrap_or(&path_to_open))
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

#[derive(serde::Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub shortcut: String,
    pub model_id: String,
    pub enabled: bool,
}

#[tauri::command]
async fn update_tray_menu(app: AppHandle, scenes: Vec<Scene>) -> Result<(), String> {
    info!("Updating tray menu with {} scenes", scenes.len());

    // Get tray from app state
    let state = app.try_state::<AppState>();
    let tray = match state {
        Some(s) => {
            let guard = s
                .tray
                .lock()
                .map_err(|e| format!("Failed to lock tray: {}", e))?;
            match guard.as_ref() {
                Some(t) => t.clone(),
                None => return Err("Tray not initialized".to_string()),
            }
        }
        None => return Err("App state not found".to_string()),
    };

    // Build scene submenu items
    let mut scene_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for scene in &scenes {
        if scene.enabled {
            let item = MenuItem::with_id(
                &app,
                format!("scene_{}", scene.id),
                format!("{} (快捷键: {})", scene.name, scene.shortcut),
                true,
                None::<&str>,
            )
            .map_err(|e| format!("Failed to create scene menu item: {}", e))?;
            scene_items.push(item);
        }
    }

    // Create new menu with scenes
    let show_item = MenuItem::with_id(&app, "show", "显示主窗口", true, None::<&str>)
        .map_err(|e| format!("Failed to create show menu item: {}", e))?;
    let hide_item = MenuItem::with_id(&app, "hide", "隐藏窗口", true, None::<&str>)
        .map_err(|e| format!("Failed to create hide menu item: {}", e))?;
    let quit_item = MenuItem::with_id(&app, "quit", "退出", true, None::<&str>)
        .map_err(|e| format!("Failed to create quit menu item: {}", e))?;

    // Build menu based on whether there are scenes
    let menu = if !scene_items.is_empty() {
        let scene_submenu = Submenu::with_items(
            &app,
            "场景快捷键",
            true,
            &scene_items
                .iter()
                .map(|s| s as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
                .collect::<Vec<_>>(),
        )
        .map_err(|e| format!("Failed to create scene submenu: {}", e))?;

        Menu::with_items(&app, &[&show_item, &hide_item, &scene_submenu, &quit_item])
            .map_err(|e| format!("Failed to create menu: {}", e))?
    } else {
        Menu::with_items(&app, &[&show_item, &hide_item, &quit_item])
            .map_err(|e| format!("Failed to create menu: {}", e))?
    };

    // Update tray menu
    tray.set_menu(Some(menu))
        .map_err(|e| format!("Failed to set tray menu: {}", e))?;

    info!("Tray menu updated successfully");
    Ok(())
}

#[tauri::command]
async fn enable_autostart() -> Result<(), String> {
    info!("Enabling autostart");
    #[cfg(target_os = "windows")]
    {
        use std::env;
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path =
            env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;
        let exe_path_str = exe_path.to_string_lossy().to_string();

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|e| format!("Failed to open registry key: {}", e))?;

        key.set_value("Voconly", &exe_path_str)
            .map_err(|e| format!("Failed to set registry value: {}", e))?;

        info!("Autostart enabled successfully via registry");
    }
    Ok(())
}

#[tauri::command]
async fn disable_autostart() -> Result<(), String> {
    info!("Disabling autostart");
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_WRITE,
        ) {
            key.delete_value("Voconly").map_err(|e| {
                error!("Failed to delete registry value: {}", e);
                format!("Failed to delete registry value: {}", e)
            })?;
            info!("Autostart disabled successfully via registry");
        } else {
            error!("Failed to open registry key for writing");
            return Err("Failed to open registry key for writing".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
async fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
            let result: Result<String, _> = key.get_value("Voconly");
            return Ok(result.is_ok());
        }
    }
    Ok(false)
}

/// Start VAD-based recording
#[tauri::command]
async fn start_vad_recording(app: AppHandle, scene_id: String) -> Result<(), String> {
    info!("Starting VAD recording... (scene: {})", scene_id);

    // Get VAD model path from Application directory
    let vad_model_path = resolve_resource_path("resources/models/silero_vad_v6.2.1_16k.onnx")?;
    info!("VAD model path: {:?}", vad_model_path);

    // 从配置读取分段转录开关
    let streaming_enabled = load_config()
        .map(|r| r.config.segment_transcribe)
        .unwrap_or(true);
    info!("Segment transcription enabled: {}", streaming_enabled);

    // Get AppState for audio_capture
    let state = app.state::<AppState>();

    // Get or create audio capture
    let mut capture_guard = state.audio_capture.lock().map_err(|e| e.to_string())?;

    let capture = match capture_guard.as_mut() {
        Some(c) => c,
        None => {
            // Create new capture instance
            let new_capture = AudioCapture::new(app.clone(), vad_model_path.to_str().unwrap())
                .map_err(|e| format!("Failed to create AudioCapture: {}", e))?;
            *capture_guard = Some(new_capture);
            capture_guard.as_mut().unwrap()
        }
    };

    // Open microphone if not already open
    capture
        .open()
        .map_err(|e| format!("Failed to open microphone: {}", e))?;

    // Apply streaming mode setting
    if streaming_enabled {
        capture
            .set_streaming_mode(true)
            .map_err(|e| format!("Failed to set streaming mode: {}", e))?;
    }

    // Start recording
    capture
        .start(&scene_id)
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    // Set is_recording flag to true
    {
        let mut is_recording_guard = state.is_recording.lock().map_err(|e| e.to_string())?;
        *is_recording_guard = true;
    }

    info!(
        "VAD recording started successfully (streaming: {})",
        streaming_enabled
    );
    Ok(())
}

/// Set streaming transcription mode
#[tauri::command]
async fn set_streaming_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    info!("Setting streaming mode: {}", enabled);

    let state = app.state::<AppState>();

    // Always store the setting in AppState (persisted across AudioCapture lifecycle)
    {
        let mut streaming_mode_guard = state.streaming_mode.lock().map_err(|e| e.to_string())?;
        *streaming_mode_guard = enabled;
    }

    // Apply to existing AudioCapture if available
    let capture_guard = state.audio_capture.lock().map_err(|e| e.to_string())?;
    if let Some(capture) = capture_guard.as_ref() {
        capture
            .set_streaming_mode(enabled)
            .map_err(|e| format!("Failed to set streaming mode: {}", e))?;
    }

    info!("Streaming mode set to: {}", enabled);
    Ok(())
}

/// Pre-initialize audio capture to reduce latency on first recording
/// This loads the VAD model so that subsequent recordings can start faster
/// Note: We do NOT open the microphone stream here, to avoid showing the
/// microphone-in-use indicator in the system tray on startup
#[tauri::command]
async fn preinit_audio_capture(app: AppHandle) -> Result<(), String> {
    info!("Pre-initializing audio capture (loading VAD model and opening microphone)...");

    // Get VAD model path from Application directory
    let vad_model_path = resolve_resource_path("resources/models/silero_vad_v6.2.1_16k.onnx")?;
    info!("VAD model path: {:?}", vad_model_path);

    // Get or create audio capture
    let state = app.state::<AppState>();
    let mut capture_guard = state.audio_capture.lock().map_err(|e| e.to_string())?;

    // Skip if already initialized and microphone is open
    if let Some(capture) = capture_guard.as_ref() {
        if capture.is_open() {
            info!("Audio capture already initialized and microphone open, skipping preinit");
            return Ok(());
        }
    }

    // Create new capture instance
    let mut new_capture = AudioCapture::new(app.clone(), vad_model_path.to_str().unwrap())
        .map_err(|e| format!("Failed to create AudioCapture: {}", e))?;

    // 【关键修复】预打开麦克风，避免首次录音时的延迟
    // 这样用户按快捷键时，麦克风已经准备好了
    new_capture
        .open()
        .map_err(|e| format!("Failed to open microphone during preinit: {}", e))?;

    *capture_guard = Some(new_capture);

    info!("Audio capture pre-initialized successfully (VAD model loaded + microphone opened)");
    Ok(())
}

/// Stop VAD-based recording and save audio asynchronously
/// Returns immediately without waiting for file save to complete
#[tauri::command]
async fn stop_vad_recording(app: AppHandle) -> Result<(), String> {
    info!("[Capture] Stopping VAD recording...");

    let state = app.state::<AppState>();
    let mut capture_guard = state.audio_capture.lock().map_err(|e| e.to_string())?;

    let capture = capture_guard.as_mut().ok_or("No active recording")?;

    // Stop recording and get samples
    info!("[Capture] Calling capture.stop()...");
    let samples = capture
        .stop()
        .map_err(|e| format!("Failed to stop recording: {}", e))?;
    info!(
        "[Capture] capture.stop() returned {} samples",
        samples.len()
    );

    // Log memory usage for debugging
    let memory_mb = samples.len() * 4 / 1024 / 1024; // f32 = 4 bytes
    let duration_secs = samples.len() as f64 / 16000.0;
    info!(
        "[Capture] Audio stats: {:.2}s duration, ~{} MB memory",
        duration_secs, memory_mb
    );

    // Close microphone stream to release the device
    capture
        .close()
        .map_err(|e| format!("Failed to close microphone: {}", e))?;
    info!("[Capture] Microphone stream closed");

    // Set is_recording flag to false
    {
        let mut is_recording_guard = state.is_recording.lock().map_err(|e| e.to_string())?;
        *is_recording_guard = false;
    }
    info!("[Capture] is_recording flag set to false");

    if samples.is_empty() {
        return Err("No audio recorded".to_string());
    }

    // 【关键优化】异步保存文件，不阻塞返回
    // 克隆样本数据用于后台保存
    let samples_clone = samples.clone();
    std::thread::spawn(move || {
        if let Some(path) = debug_audio::save_last_recording(&samples_clone, 16000) {
            info!("[LastRecording] Audio saved asynchronously to: {:?}", path);
        }
    });

    // 立即返回，不等待文件保存完成
    info!("[Capture] Returning immediately (file save in background)");
    Ok(())
}

/// Cancel VAD-based recording and discard audio
#[tauri::command]
async fn cancel_recording(app: AppHandle) -> Result<(), String> {
    info!("[Capture] Cancelling VAD recording...");

    let state = app.state::<AppState>();
    let mut capture_guard = state.audio_capture.lock().map_err(|e| e.to_string())?;

    if let Some(capture) = capture_guard.as_mut() {
        // Cancel recording and discard samples (don't emit any segments)
        info!("[Capture] Cancelling recording and discarding samples...");
        let _ = capture.cancel();

        // Close microphone stream to release the device
        let _ = capture.close();
        info!("[Capture] Recording cancelled and microphone closed");
    } else {
        info!("[Capture] No active recording to cancel");
    }

    // Clear the capture to indicate no active recording
    *capture_guard = None;

    // Set is_recording flag to false
    {
        let mut is_recording_guard = state.is_recording.lock().map_err(|e| e.to_string())?;
        *is_recording_guard = false;
    }
    info!("[Capture] is_recording flag set to false");

    // Clear preview text (discard transcription)
    {
        let mut preview = state.preview_text.lock().map_err(|e| e.to_string())?;
        preview.clear();
    }
    {
        let mut preview_visible = state
            .preview_window_visible
            .lock()
            .map_err(|e| e.to_string())?;
        *preview_visible = false;
    }

    // Emit events to notify frontend
    if let Err(e) = app.emit("recording-cancelled", ()) {
        error!("[Capture] Failed to emit recording-cancelled event: {}", e);
    } else {
        info!("[Capture] Emitted recording-cancelled event");
    }

    // Emit hide event to preview window (now integrated in float-panel)
    if let Err(e) = app.emit_to("float-panel", "preview-window-hide", ()) {
        error!("[Capture] Failed to emit preview-window-hide event: {}", e);
    } else {
        info!("[Capture] Emitted preview-window-hide event");
    }

    info!("[Capture] Recording cancelled successfully");
    Ok(())
}

/// Register ESC key as global shortcut for canceling recording
/// Called when recording starts, unregistered when recording ends
#[tauri::command]
async fn register_esc_cancel(app: AppHandle) -> Result<(), String> {
    info!("[ESC] Registering ESC as cancel shortcut...");

    // Check if already registered
    let state = app.state::<AppState>();
    {
        let esc_registered = state
            .esc_cancel_registered
            .lock()
            .map_err(|e| e.to_string())?;
        if *esc_registered {
            info!("[ESC] ESC cancel shortcut already registered, skipping");
            return Ok(());
        }
    }

    let app_handle = app.clone();
    let shortcut: Shortcut = "Escape".parse().map_err(|e| {
        error!("[ESC] Failed to parse Escape shortcut: {}", e);
        format!("Invalid Escape shortcut format: {}", e)
    })?;

    // Register ESC shortcut with callback
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                info!("[ESC] ESC key pressed, emitting esc-cancel-triggered event");
                // Emit event to frontend to handle cancellation
                if let Err(e) = app_handle.emit("esc-cancel-triggered", ()) {
                    error!("[ESC] Failed to emit esc-cancel-triggered event: {}", e);
                }
            }
        })
        .map_err(|e| {
            error!("[ESC] Failed to register ESC shortcut: {}", e);
            format!("Failed to register ESC shortcut: {}", e)
        })?;

    // Mark as registered
    {
        let mut esc_registered = state
            .esc_cancel_registered
            .lock()
            .map_err(|e| e.to_string())?;
        *esc_registered = true;
    }

    info!("[ESC] ESC cancel shortcut registered successfully");
    Ok(())
}

/// Unregister ESC key shortcut
/// Called when recording ends or is cancelled
#[tauri::command]
async fn unregister_esc_cancel(app: AppHandle) -> Result<(), String> {
    info!("[ESC] Unregistering ESC cancel shortcut...");

    // Check if registered
    let state = app.state::<AppState>();
    {
        let esc_registered = state
            .esc_cancel_registered
            .lock()
            .map_err(|e| e.to_string())?;
        if !*esc_registered {
            info!("[ESC] ESC cancel shortcut not registered, skipping unregister");
            return Ok(());
        }
    }

    let shortcut: Shortcut = "Escape".parse().map_err(|e| {
        error!(
            "[ESC] Failed to parse Escape shortcut for unregister: {}",
            e
        );
        format!("Invalid Escape shortcut format: {}", e)
    })?;

    // Unregister ESC shortcut
    app.global_shortcut().unregister(shortcut).map_err(|e| {
        error!("[ESC] Failed to unregister ESC shortcut: {}", e);
        format!("Failed to unregister ESC shortcut: {}", e)
    })?;

    // Mark as unregistered
    {
        let mut esc_registered = state
            .esc_cancel_registered
            .lock()
            .map_err(|e| e.to_string())?;
        *esc_registered = false;
    }

    info!("[ESC] ESC cancel shortcut unregistered successfully");
    Ok(())
}

/// 获取当前累积的预览文字
/// 停止录音时调用，获取完整的转录文字用于输出或LLM处理
#[tauri::command]
async fn get_preview_text(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let preview = state.preview_text.lock().map_err(|e| e.to_string())?;
    Ok(preview.clone())
}

/// 清空预览文字（取消录音时调用）
#[tauri::command]
async fn clear_preview_text(app: AppHandle) -> Result<(), String> {
    info!("[Preview] Clearing preview text...");
    let state = app.state::<AppState>();

    // 清空预览文字
    {
        let mut preview = state.preview_text.lock().map_err(|e| e.to_string())?;
        preview.clear();
    }

    // 标记预览窗口不可见
    {
        let mut visible = state
            .preview_window_visible
            .lock()
            .map_err(|e| e.to_string())?;
        *visible = false;
    }

    // 发送隐藏事件到前端 (now integrated in float-panel)
    app.emit_to("float-panel", "preview-window-hide", ())
        .map_err(|e| format!("Failed to emit preview-window-hide: {}", e))?;

    info!("[Preview] Preview text cleared and window hidden");
    Ok(())
}

/// 更新预览文字（前端编辑后同步到后端）
/// 录音结束时调用，确保后续流程使用正确的文本
#[tauri::command]
async fn update_preview_text(app: AppHandle, text: String) -> Result<(), String> {
    let text_len = text.len();
    let state = app.state::<AppState>();
    let mut preview = state.preview_text.lock().map_err(|e| e.to_string())?;
    *preview = text;
    info!("[Preview] Updated preview text to {} chars", text_len);
    Ok(())
}

/// 追加预览文字并更新预览窗口
/// 转录段完成时由后端调用
#[tauri::command]
async fn append_preview_text(app: AppHandle, text: String) -> Result<(), String> {
    info!("[Preview] ===== append_preview_text called =====");
    info!(
        "[Preview] Appending preview text: {} chars, content: \"{}\"",
        text.len(),
        text
    );
    let state = app.state::<AppState>();

    // 检查 preview 窗口是否存在
    let preview_window = app.get_webview_window("preview");
    info!(
        "[Preview] Preview window exists: {}",
        preview_window.is_some()
    );

    // 追加文字
    let full_text = {
        let mut preview = state.preview_text.lock().map_err(|e| e.to_string())?;
        preview.push_str(&text);
        info!("[Preview] Full text after append: {} chars", preview.len());
        preview.clone()
    };

    // 标记预览窗口可见
    {
        let mut visible = state
            .preview_window_visible
            .lock()
            .map_err(|e| e.to_string())?;
        *visible = true;
        info!("[Preview] Preview window visible flag set to true");
    }

    // 发送预览更新事件到前端
    #[derive(Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct PreviewTextPayload {
        pub full_text: String,
        pub segment_text: String,
    }

    info!("[Preview] Emitting preview-text-update event to 'float-panel' window...");
    app.emit_to(
        "float-panel",
        "preview-text-update",
        PreviewTextPayload {
            full_text,
            segment_text: text,
        },
    )
    .map_err(|e| format!("Failed to emit preview-text-update: {}", e))?;
    info!("[Preview] preview-text-update event emitted successfully");

    // 检查窗口是否可见
    if let Some(window) = preview_window {
        info!(
            "[Preview] Preview window visibility: {}",
            window.is_visible().unwrap_or(false)
        );
    }

    Ok(())
}

/// 获取药丸窗口位置（用于预览窗口定位）
#[tauri::command]
async fn get_float_panel_position(app: AppHandle) -> Result<(i32, i32), String> {
    let float_window = app
        .get_webview_window("float-panel")
        .ok_or("Float panel window not found")?;
    let position = float_window
        .outer_position()
        .map_err(|e| format!("Failed to get position: {}", e))?;
    Ok((position.x, position.y))
}

/// Write samples to WAV file
fn write_wav_file(path: &PathBuf, samples: &[f32], sample_rate: u32) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(path, spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

    for sample in samples {
        let int_sample = (*sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
        writer
            .write_sample(int_sample)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

    Ok(())
}

// Position window at center (for settings window)
fn position_window(window: &WebviewWindow) {
    if let Ok(monitor) = window.primary_monitor() {
        if let Some(monitor) = monitor {
            let monitor_size = monitor.size();
            let window_size = window
                .outer_size()
                .unwrap_or(tauri::PhysicalSize::new(720, 580));

            // Calculate position at center
            let x = (monitor_size.width as i32 - window_size.width as i32) / 2;
            let y = (monitor_size.height as i32 - window_size.height as i32) / 2;

            let _ = window.set_position(PhysicalPosition::new(x, y));
            info!("Window positioned at center: x={}, y={}", x, y);
        }
    }
}

/// 构建控制台日志过滤器
fn build_console_filter() -> env_filter::Filter {
    let mut builder = env_filter::Builder::new();

    match std::env::var("RUST_LOG") {
        Ok(spec) if !spec.trim().is_empty() => {
            // 尊重 RUST_LOG 环境变量
            builder.parse(&spec);
            info!("Using RUST_LOG environment variable: {}", spec);
        }
        _ => {
            // 默认 Info 级别（便于调试）
            builder.filter_level(log::LevelFilter::Info);
        }
    }

    builder.build()
}

fn main() {
    let main_start = Instant::now();
    info!("[STARTUP] ===== 应用启动开始 =====");

    // 设置 DPI 感知，确保在高 DPI 显示器上正确缩放
    #[cfg(windows)]
    unsafe {
        let dpi_start = Instant::now();
        let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        info!(
            "[STARTUP] DPI 设置完成, 耗时: {}ms",
            dpi_start.elapsed().as_millis()
        );
    }

    // 构建控制台日志过滤器
    let console_filter_start = Instant::now();
    let console_filter = build_console_filter();
    info!(
        "[STARTUP] 控制台日志过滤器构建完成, 耗时: {}ms",
        console_filter_start.elapsed().as_millis()
    );

    // Load config first to initialize model manager
    #[cfg(windows)]
    unsafe {
        let dpi_start = Instant::now();
        let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        info!(
            "[STARTUP] DPI 设置完成, 耗时: {}ms",
            dpi_start.elapsed().as_millis()
        );
    }

    // Load config first to initialize model manager
    let config_start = Instant::now();
    let config = load_config()
        .map(|r| r.config)
        .unwrap_or_else(|_| AppConfig::default());
    info!(
        "[STARTUP] 配置加载完成, 耗时: {}ms",
        config_start.elapsed().as_millis()
    );

    // 从配置中读取日志级别并设置全局原子变量
    let log_level_start = Instant::now();
    if let Some(ref log_level) = config.log_level {
        if let Some(level) = log_settings::LogLevel::from_str(log_level) {
            log_settings::FILE_LOG_LEVEL.store(
                level.to_level_filter() as u8,
                std::sync::atomic::Ordering::Relaxed,
            );
        }
    }
    info!(
        "[STARTUP] 日志级别设置完成, 耗时: {}ms",
        log_level_start.elapsed().as_millis()
    );

    let model_mgr_start = Instant::now();
    let config_arc = std::sync::Arc::new(Mutex::new(config.clone()));
    let app_services = commands::transcribe::init_model_manager(config_arc.clone());
    info!(
        "[STARTUP] Model Manager 初始化完成, 耗时: {}ms",
        model_mgr_start.elapsed().as_millis()
    );

    // Initialize performance tracker
    let perf_start = Instant::now();
    let app_data_dir = paths::tmp_dir().expect("Failed to get temp directory");

    // 确保日志目录存在
    let log_dir = app_data_dir.join("logs");
    if !log_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&log_dir) {
            eprintln!("Failed to create log directory: {}", e);
        }
    }

    let performance_state = commands::performance::init_performance_tracker(&app_data_dir);
    let llm_performance_state = commands::performance::init_llm_performance_tracker(&app_data_dir);
    info!(
        "[STARTUP] 性能跟踪器初始化完成, 耗时: {}ms",
        perf_start.elapsed().as_millis()
    );

    // Initialize crash reporter first (before any other code that might crash)
    let crash_start = Instant::now();
    crash_report::init_crash_reporter();

    // Set up enhanced panic hook for logging and crash report file
    panic::set_hook(Box::new(crash_report::enhanced_panic_hook));
    info!(
        "[STARTUP] 崩溃报告器初始化完成, 耗时: {}ms",
        crash_start.elapsed().as_millis()
    );

    info!(
        "[STARTUP] 主函数初始化阶段总耗时: {}ms",
        main_start.elapsed().as_millis()
    );

    let console_filter_clone = console_filter.clone();
    let result = tauri::Builder::default()
        .manage(AppState {
            shortcuts: Mutex::new(Vec::new()),
            tray: Mutex::new(None),
            float_panel_shown: Mutex::new(false),
            audio_capture: Mutex::new(None),
            shortcut_pending: Mutex::new(HashMap::new()),
            clipboard_lock: Mutex::new(()),
            streaming_mode: Mutex::new(true), // 分段转录默认值，实际值从配置读取
            esc_cancel_registered: Mutex::new(false),
            preview_text: Mutex::new(String::new()),
            preview_window_visible: Mutex::new(false),
            is_recording: Mutex::new(false),
        })
        .manage(app_services)
        .manage(performance_state)
        .manage(llm_performance_state)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_keyhook::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            Builder::new()
                .level(log::LevelFilter::Trace) // 全局最高级别
                .max_file_size(500_000) // 单文件最大 500KB
                .rotation_strategy(RotationStrategy::KeepOne) // 只保留一个文件
                .clear_targets()
                .targets([
                    // 通道 1: 控制台输出
                    Target::new(TargetKind::Stdout)
                        .filter(move |metadata| console_filter_clone.enabled(metadata)),
                    // 通道 2: 文件输出
                    Target::new(TargetKind::Folder {
                        path: app_data_dir.join("logs"),
                        file_name: Some("talk-free".into()),
                    })
                    .filter(|metadata| {
                        let file_level =
                            log_settings::FILE_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed);
                        metadata.level() <= log_settings::level_filter_from_u8(file_level)
                    }),
                ])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            register_shortcut,
            unregister_shortcut,
            unregister_all_shortcuts,
            get_registered_shortcuts,
            simulate_input,
            load_config,
            save_config,
            get_model_storage_path,
            config_exists,
            show_window,
            hide_window,
            set_window_visible,
            show_float_panel,
            hide_float_panel,
            set_float_panel_height,
            update_tray_menu,
            enable_autostart,
            disable_autostart,
            is_autostart_enabled,
            // VAD recording commands
            start_vad_recording,
            stop_vad_recording,
            cancel_recording,
            set_streaming_mode,
            preinit_audio_capture,
            // ESC cancel shortcut commands
            register_esc_cancel,
            unregister_esc_cancel,
            // Preview text commands
            get_preview_text,
            clear_preview_text,
            update_preview_text,
            append_preview_text,
            get_float_panel_position,
            load_history,
            load_history_paged,
            get_history_count,
            save_history,
            get_archive_stats,
            get_full_stats,
            add_history_record,
            delete_history_record,
            clear_history,
            rebuild_stats,
            // New commands for local model management
            commands::transcribe::transcribe_audio,
            commands::transcribe::cleanup_all_resources,
            commands::model::load_model_by_id,
            commands::model::unload_model,
            commands::model::switch_asr_model,
            commands::model::is_model_loaded,
            commands::model::scan_asr_models,
            commands::model::scan_llm_models,
            commands::model::get_asr_model_list,
            // Custom ASR model directory commands
            commands::model::get_custom_asr_model_dirs,
            commands::model::add_custom_asr_model_dir,
            commands::model::remove_custom_asr_model_dir,
            // LLM commands
            commands::llm::llm_health_check,
            commands::llm::llm_list_models,
            commands::llm::llm_process_text,
            commands::llm::llm_process_text_for_scene,
            commands::llm::llm_process_text_for_scene_with_progress,
            commands::llm::get_llm_profile,
            commands::llm::save_llm_profile,
            commands::llm::get_llm_prompt_presets,
            commands::llm::save_llm_prompt_presets,
            // Provider management commands
            commands::llm::get_provider_list,
            commands::llm::save_provider_config,
            commands::llm::delete_provider_config,
            commands::llm::fetch_provider_models,
            commands::llm::check_provider_connection,
            // Provider model cache commands
            commands::llm::get_cached_provider_models,
            commands::llm::refresh_provider_models,
            // LLM model management commands
            commands::llm::get_llm_model_list,
            commands::llm::download_llm_model,
            commands::llm::delete_llm_model,
            commands::llm::check_llm_model_exists,
            commands::llm::get_llm_model_storage_path_cmd,
            commands::llm::detect_gpu,
            // New download commands
            download_model_with_source,
            download_model_from_url,
            get_model_storage_path_cmd,
            check_model_exists_cmd,
            cancel_model_download,
            get_downloading_model_ids,
            open_model_folder,
            // Performance tracking commands
            commands::performance::record_performance,
            commands::performance::estimate_transcribe_time,
            commands::performance::get_performance_stats,
            // LLM Performance tracking commands
            commands::performance::record_llm_performance,
            commands::performance::estimate_llm_time,
            commands::performance::get_llm_performance_stats,
            // Log management commands
            log_settings::get_log_dir_path,
            log_settings::open_log_dir,
            log_settings::get_log_level,
            log_settings::set_log_level,
            log_settings::log_from_frontend,
            // Dictionary commands
            commands::dictionary::get_user_dictionary,
            commands::dictionary::save_user_dictionary,
            commands::dictionary::add_dictionary_entry,
            commands::dictionary::remove_dictionary_entry,
            // Updater commands
            updater::check_for_updates,
            updater::get_app_version,
            updater::get_update_state,
            updater::download_update,
            updater::cancel_download,
            updater::install_update,
            updater::cleanup_downloaded_update,
            updater::reset_remind_count,
            updater::increment_remind_count,
            updater::exit_app,
            // File operations (unified API from lib)
            voconly::file_ops::read_text_file,
            voconly::file_ops::write_text_file,
            voconly::file_ops::read_binary_file,
            voconly::file_ops::write_binary_file,
            voconly::file_ops::file_exists,
            voconly::file_ops::delete_file,
            voconly::file_ops::create_dir,
            voconly::file_ops::delete_dir,
            voconly::file_ops::list_dir,
            voconly::file_ops::get_full_path,
            voconly::file_ops::get_app_root,
        ])
        .setup(|app| {
            let setup_start = Instant::now();
            info!("[STARTUP] ===== Tauri Setup 开始 =====");

            // 注册单实例插件：防止启动多个进程
            // 当用户再次双击图标时，只显示已有窗口，不启动新实例
            #[cfg(desktop)]
            {
                let app_handle = app.handle().clone();
                app.handle()
                    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                        info!("[SingleInstance] 检测到第二次启动请求，显示已有窗口");
                        // 显示并聚焦主窗口
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.unminimize();
                            info!("[SingleInstance] 主窗口已显示并聚焦");
                        }
                    }))
                    .expect("Failed to initialize single-instance plugin");
                info!("[STARTUP] 单实例插件注册完成");
            }

            // Configure WebView2 data directory to Application\WebView
            let webview_dir_start = Instant::now();
            let webview_data_dir = crate::paths::application_dir()
                .map(|p| p.join("WebView"))
                .map_err(|e| format!("Failed to get Application directory: {}", e))?;
            std::fs::create_dir_all(&webview_data_dir)
                .map_err(|e| format!("Failed to create WebView directory: {}", e))?;
            info!(
                "[STARTUP] WebView 数据目录配置完成, 耗时: {}ms",
                webview_dir_start.elapsed().as_millis()
            );

            // Create main window with custom WebView data directory
            // Window is initially hidden to prevent showing blank content
            // It will be shown after the page loads (via on_page_load event)
            let main_window_start = Instant::now();
            let main_window = WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Voconly - 语音输入")
                .inner_size(1200.0, 820.0)
                .min_inner_size(800.0, 600.0)
                .resizable(true)
                .fullscreen(false)
                .decorations(false)
                .always_on_top(false)
                .transparent(false)
                .skip_taskbar(false)
                .visible(false) // Initially hidden, show after page loads
                .center()
                .data_directory(webview_data_dir.clone())
                .on_page_load(|window, _payload| {
                    info!("[STARTUP] Main window page loaded, showing window");
                    let _ = window.show();
                })
                .build()
                .expect("Failed to create main window");

            // Set main window background color to match HTML background (#F5F5F7)
            // This ensures the window shows correct color immediately when shown
            let _ = main_window
                .set_background_color(Some(tauri::window::Color(0xF5, 0xF5, 0xF7, 0xFF)));

            info!(
                "[STARTUP] 主窗口创建完成 (初始隐藏, 页面加载后显示), 耗时: {}ms",
                main_window_start.elapsed().as_millis()
            );

            // Create float panel window with same WebView data directory
            let float_window_start = Instant::now();
            let float_window = WebviewWindowBuilder::new(
                app,
                "float-panel",
                tauri::WebviewUrl::App("float.html".into()),
            )
            .title("Voconly 悬浮窗")
            .inner_size(520.0, 160.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .transparent(true)
            .skip_taskbar(true)
            .visible(false)
            .position(0.0, 0.0)
            .focusable(false)
            .shadow(false)
            .data_directory(webview_data_dir.clone())
            .build()
            .expect("Failed to create float panel window");
            info!(
                "[STARTUP] 悬浮窗口创建完成, 耗时: {}ms",
                float_window_start.elapsed().as_millis()
            );

            // Create preview window (above float panel) with same WebView data directory
            let preview_window_start = Instant::now();
            let preview_window = WebviewWindowBuilder::new(
                app,
                "preview",
                tauri::WebviewUrl::App("preview.html".into()),
            )
            .title("Voconly 预览窗")
            .inner_size(300.0, 80.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .transparent(true)
            .skip_taskbar(true)
            .visible(false)
            .position(0.0, 0.0)
            .focusable(false)
            .shadow(false)
            .data_directory(webview_data_dir.clone())
            .build()
            .expect("Failed to create preview window");
            info!(
                "[STARTUP] 预览窗口创建完成, 耗时: {}ms",
                preview_window_start.elapsed().as_millis()
            );

            // Set float panel webview background to fully transparent
            let bg_start = Instant::now();
            let _ = float_window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
            let _ = preview_window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
            info!(
                "[STARTUP] WebView 背景透明设置完成, 耗时: {}ms",
                bg_start.elapsed().as_millis()
            );

            info!(
                "[STARTUP] WebView 窗口创建阶段总耗时: {}ms",
                setup_start.elapsed().as_millis()
            );

            // Setup system tray
            let tray_start = Instant::now();
            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)
                .expect("Failed to create show menu item");
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)
                .expect("Failed to create settings menu item");
            let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)
                .expect("Failed to create hide menu item");
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
                .expect("Failed to create quit menu item");

            let menu = Menu::with_items(app, &[&show_item, &settings_item, &hide_item, &quit_item])
                .expect("Failed to create tray menu");

            let app_handle = app.handle().clone();

            // Build tray and store in app state
            let built_tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    let event_id = event.id.as_ref();
                    // Check if it's a scene shortcut
                    if event_id.starts_with("scene_") {
                        let scene_id = event_id.strip_prefix("scene_").unwrap_or("");
                        info!("Scene shortcut triggered from tray: {}", scene_id);
                        if let Err(e) = app.emit("shortcut-triggered", scene_id) {
                            error!("Failed to emit scene shortcut event: {}", e);
                        }
                        return;
                    }

                    match event_id {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                // Emit event to switch to settings tab
                                let _ = app.emit("navigate-to", "settings");
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "quit" => {
                            info!("Quit requested from tray menu");

                            // 显式清理 ModelManager（释放模型资源）
                            if let Some(state) = app.try_state::<AppServices>() {
                                if let Ok(mut mgr_guard) = state.model_manager.lock() {
                                    if let Some(mgr) = mgr_guard.take() {
                                        info!("[Quit] 清理 ModelManager...");
                                        drop(mgr); // 触发所有 LoadedModel.drop -> SpeechBackend 资源释放
                                        info!("[Quit] ModelManager 已清理");
                                    }
                                }
                            }

                            // 清理 LLM 模型缓存
                            llm::clear_model_cache();

                            info!("[Quit] 所有资源清理完成，退出应用");
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(&app_handle)?;
            info!(
                "[STARTUP] 系统托盘创建完成, 耗时: {}ms",
                tray_start.elapsed().as_millis()
            );

            // Store tray in app state for later access
            let tray_store_start = Instant::now();
            match app.try_state::<AppState>() {
                Some(state) => match state.tray.lock() {
                    Ok(mut tray_guard) => {
                        *tray_guard = Some(built_tray);
                        info!(
                            "[STARTUP] 托盘存储到 AppState 成功, 耗时: {}ms",
                            tray_store_start.elapsed().as_millis()
                        );
                    }
                    Err(e) => {
                        error!("[STARTUP] 托盘存储失败: 无法锁定 tray mutex: {}", e);
                    }
                },
                None => {
                    error!("[STARTUP] 托盘存储失败: AppState 未找到");
                }
            }

            // Handle window close event - minimize to tray instead of exiting
            let window_event_start = Instant::now();
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Prevent the window from closing, hide it instead
                        api.prevent_close();
                        let _ = window_clone.hide();
                        info!("Window hidden to tray on close request");
                    }
                });
            }
            info!(
                "[STARTUP] 窗口关闭事件处理设置完成, 耗时: {}ms",
                window_event_start.elapsed().as_millis()
            );

            info!(
                "[STARTUP] ===== Setup 阶段完成, 总耗时: {}ms =====",
                setup_start.elapsed().as_millis()
            );

            // ===== 异步预加载常驻模型 =====
            // 在窗口显示后后台加载，避免阻塞启动
            // 包括 GPU 加速器初始化和模型预加载
            info!("[STARTUP] 启动后台初始化线程...");
            let preload_thread_start = Instant::now();
            let app_for_preload = app.handle().clone();
            std::thread::spawn(move || {
                let async_init_start = Instant::now();
                info!("[AsyncInit] 后台初始化线程开始");

                // 等待 WebView 完全渲染
                std::thread::sleep(std::time::Duration::from_millis(1000));
                info!(
                    "[AsyncInit] WebView 渲染等待完成, 耗时: {}ms",
                    async_init_start.elapsed().as_millis()
                );

                // 1. 初始化 GPU 加速器
                let onnx_gpu_start = Instant::now();
                crate::backends::onnx::apply_ort_accelerator("cuda");
                info!(
                    "[AsyncInit] ONNX GPU 加速器初始化完成, 耗时: {}ms",
                    onnx_gpu_start.elapsed().as_millis()
                );

                // Initialize transcribe-cpp backend (for GGUF ASR models like Qwen3-ASR)
                // This loads Vulkan/Metal/CUDA backend modules before any model load
                let transcribe_cpp_start = Instant::now();
                crate::backends::transcribe_cpp::init_transcribe_cpp_backend();
                info!(
                    "[AsyncInit] TranscribeCpp 后端初始化完成, 耗时: {}ms",
                    transcribe_cpp_start.elapsed().as_millis()
                );

                // 2. 获取 AppServices 并执行预加载
                let preload_start = Instant::now();
                if let Some(state) = app_for_preload.try_state::<AppServices>() {
                    if let Ok(mut mgr_guard) = state.model_manager.lock() {
                        if let Some(mgr) = mgr_guard.as_mut() {
                            info!("[AsyncInit] 开始预加载常驻模型...");
                            mgr.preload_always_models();
                            info!(
                                "[AsyncInit] 预加载完成, 耗时: {}ms",
                                preload_start.elapsed().as_millis()
                            );

                            // 通知前端预加载完成
                            let _ = app_for_preload.emit("models-preloaded", ());
                        }
                    }
                }

                info!(
                    "[AsyncInit] ===== 后台初始化线程完成, 总耗时: {}ms =====",
                    async_init_start.elapsed().as_millis()
                );
            });
            info!(
                "[STARTUP] 后台初始化线程已启动, 耗时: {}ms",
                preload_thread_start.elapsed().as_millis()
            );

            // ===== 启动 ASR 模型闲置检测定时器 =====
            // 每分钟检查一次闲置模型
            let app_for_idle = app.handle().clone();
            std::thread::spawn(move || {
                info!("[IdleChecker] ASR 模型闲置检测定时器启动");
                loop {
                    // 每分钟检查一次
                    std::thread::sleep(std::time::Duration::from_secs(60));

                    // 获取闲置超时配置和模型状态
                    let (idle_timeout_secs, loaded_count, idle_info) = {
                        if let Some(state) = app_for_idle.try_state::<AppServices>() {
                            let config_val = if let Ok(config) = state.config.lock() {
                                config.asr_idle_timeout_seconds
                            } else {
                                continue
                            };

                            // 获取模型状态
                            let (count, info) = if let Ok(mgr_guard) = state.model_manager.lock() {
                                if let Some(mgr) = mgr_guard.as_ref() {
                                    let models = mgr.get_loaded_models();
                                    let info: Vec<(String, u64)> = models.iter()
                                        .map(|m| (m.model_id.clone(), m.last_used_secs))
                                        .collect();
                                    (models.len(), info)
                                } else {
                                    (0, Vec::new())
                                }
                            } else {
                                (0, Vec::new())
                            };

                            (config_val, count, info)
                        } else {
                            continue
                        }
                    };

                    // 打印检查信息
                    info!(
                        "[IdleChecker] ⏱️ 配置超时: {}秒 ({}分钟), 已加载模型: {}, 状态: {:?}",
                        idle_timeout_secs,
                        idle_timeout_secs / 60,
                        loaded_count,
                        idle_info
                    );

                    // 0 表示禁用自动清理
                    if idle_timeout_secs == 0 {
                        info!("[IdleChecker] 自动清理已禁用，跳过");
                        continue;
                    }

                    // 执行闲置清理并获取被卸载的模型列表
                    let unloaded_models = if let Some(state) = app_for_idle.try_state::<AppServices>() {
                        if let Ok(mut mgr_guard) = state.model_manager.lock() {
                            if let Some(mgr) = mgr_guard.as_mut() {
                                mgr.cleanup_idle_models(idle_timeout_secs)
                            } else {
                                Vec::new()
                            }
                        } else {
                            Vec::new()
                        }
                    } else {
                        Vec::new()
                    };

                    // 如果有模型被卸载，通知前端更新状态
                    if !unloaded_models.is_empty() {
                        info!(
                            "[IdleChecker] ✅ 已卸载 {} 个模型: {:?}",
                            unloaded_models.len(),
                            unloaded_models
                        );
                        if let Err(e) = app_for_idle.emit("asr-models-unloaded", &unloaded_models) {
                            error!("[IdleChecker] 发送卸载通知失败: {}", e);
                        }
                    }
                }
            });
            info!("[STARTUP] ASR 模型闲置检测定时器已启动");

            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        error!("Error running Tauri application: {:?}", e);
        std::process::exit(1);
    }
}
