use crate::{emit_key_event, APP_HANDLE, IS_LISTENING, SHOULD_STOP, BLOCK_RULE};
use lazy_static::lazy_static;
use rdev::{grab, Event, EventType, Key};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::thread::{self, JoinHandle};

lazy_static! {
    /// 存储 grab 线程句柄，用于等待线程结束
    static ref GRAB_THREAD: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);
}

/// 将 rdev::Key 映射到 keycode 名称和 Windows 虚拟键码
fn key_to_code(key: Key) -> (&'static str, u32) {
    match key {
        // 修饰键
        Key::ControlLeft => ("LeftCtrl", 0xA2),
        Key::ControlRight => ("RightCtrl", 0xA3),
        Key::ShiftLeft => ("LeftShift", 0xA0),
        Key::ShiftRight => ("RightShift", 0xA1),
        Key::Alt => ("LeftAlt", 0xA4),
        Key::AltGr => ("RightAlt", 0xA5),
        Key::MetaLeft => ("LeftWindows", 0x5B),
        Key::MetaRight => ("RightWindows", 0x5C),

        // 字母键
        Key::KeyA => ("KeyA", 0x41),
        Key::KeyB => ("KeyB", 0x42),
        Key::KeyC => ("KeyC", 0x43),
        Key::KeyD => ("KeyD", 0x44),
        Key::KeyE => ("KeyE", 0x45),
        Key::KeyF => ("KeyF", 0x46),
        Key::KeyG => ("KeyG", 0x47),
        Key::KeyH => ("KeyH", 0x48),
        Key::KeyI => ("KeyI", 0x49),
        Key::KeyJ => ("KeyJ", 0x4A),
        Key::KeyK => ("KeyK", 0x4B),
        Key::KeyL => ("KeyL", 0x4C),
        Key::KeyM => ("KeyM", 0x4D),
        Key::KeyN => ("KeyN", 0x4E),
        Key::KeyO => ("KeyO", 0x4F),
        Key::KeyP => ("KeyP", 0x50),
        Key::KeyQ => ("KeyQ", 0x51),
        Key::KeyR => ("KeyR", 0x52),
        Key::KeyS => ("KeyS", 0x53),
        Key::KeyT => ("KeyT", 0x54),
        Key::KeyU => ("KeyU", 0x55),
        Key::KeyV => ("KeyV", 0x56),
        Key::KeyW => ("KeyW", 0x57),
        Key::KeyX => ("KeyX", 0x58),
        Key::KeyY => ("KeyY", 0x59),
        Key::KeyZ => ("KeyZ", 0x5A),

        // 数字键（主键盘上方）
        Key::Num0 => ("Digit0", 0x30),
        Key::Num1 => ("Digit1", 0x31),
        Key::Num2 => ("Digit2", 0x32),
        Key::Num3 => ("Digit3", 0x33),
        Key::Num4 => ("Digit4", 0x34),
        Key::Num5 => ("Digit5", 0x35),
        Key::Num6 => ("Digit6", 0x36),
        Key::Num7 => ("Digit7", 0x37),
        Key::Num8 => ("Digit8", 0x38),
        Key::Num9 => ("Digit9", 0x39),

        // 功能键
        Key::F1 => ("F1", 0x70),
        Key::F2 => ("F2", 0x71),
        Key::F3 => ("F3", 0x72),
        Key::F4 => ("F4", 0x73),
        Key::F5 => ("F5", 0x74),
        Key::F6 => ("F6", 0x75),
        Key::F7 => ("F7", 0x76),
        Key::F8 => ("F8", 0x77),
        Key::F9 => ("F9", 0x78),
        Key::F10 => ("F10", 0x79),
        Key::F11 => ("F11", 0x7A),
        Key::F12 => ("F12", 0x7B),

        // 符号键
        Key::BackQuote => ("Backquote", 0xC0),
        Key::Minus => ("Minus", 0xBD),
        Key::Equal => ("Equal", 0xBB),
        Key::Backspace => ("Backspace", 0x08),
        Key::Tab => ("Tab", 0x09),
        Key::LeftBracket => ("BracketLeft", 0xDB),
        Key::RightBracket => ("BracketRight", 0xDD),
        Key::BackSlash => ("Backslash", 0xDC),
        Key::SemiColon => ("Semicolon", 0xBA),
        Key::Quote => ("Quote", 0xDE),
        Key::Return => ("Enter", 0x0D),
        Key::Comma => ("Comma", 0xBC),
        Key::Dot => ("Period", 0xBE),
        Key::Slash => ("Slash", 0xBF),
        Key::Space => ("Space", 0x20),
        Key::CapsLock => ("CapsLock", 0x14),

        // 导航键
        Key::UpArrow => ("ArrowUp", 0x26),
        Key::DownArrow => ("ArrowDown", 0x28),
        Key::LeftArrow => ("ArrowLeft", 0x25),
        Key::RightArrow => ("ArrowRight", 0x27),
        Key::Home => ("Home", 0x24),
        Key::End => ("End", 0x23),
        Key::PageUp => ("PageUp", 0x21),
        Key::PageDown => ("PageDown", 0x22),
        Key::Insert => ("Insert", 0x2D),
        Key::Delete => ("Delete", 0x2E),

        // 小键盘
        Key::Kp0 => ("Numpad0", 0x60),
        Key::Kp1 => ("Numpad1", 0x61),
        Key::Kp2 => ("Numpad2", 0x62),
        Key::Kp3 => ("Numpad3", 0x63),
        Key::Kp4 => ("Numpad4", 0x64),
        Key::Kp5 => ("Numpad5", 0x65),
        Key::Kp6 => ("Numpad6", 0x66),
        Key::Kp7 => ("Numpad7", 0x67),
        Key::Kp8 => ("Numpad8", 0x68),
        Key::Kp9 => ("Numpad9", 0x69),
        Key::KpMultiply => ("NumpadMultiply", 0x6A),
        Key::KpPlus => ("NumpadAdd", 0x6B),
        Key::KpMinus => ("NumpadSubtract", 0x6D),
        Key::KpDivide => ("NumpadDivide", 0x6F),
        Key::KpReturn => ("NumpadEnter", 0x0D),
        Key::KpDelete => ("NumpadDecimal", 0x6E),

        // 系统键
        Key::Escape => ("Escape", 0x1B),
        Key::PrintScreen => ("PrintScreen", 0x2A),
        Key::Pause => ("Pause", 0x13),
        Key::ScrollLock => ("ScrollLock", 0x91),
        Key::NumLock => ("NumLock", 0x90),

        // 其他
        Key::Function => ("Fn", 0xFF),
        Key::IntlBackslash => ("IntlBackslash", 0xE2),
        Key::Unknown(code) => ("Unknown", code),
    }
}

/// 检查是否应该拦截此按键
/// 根据 BLOCK_RULE 中的规则来决定
fn should_block_key(keycode: &str, event_type: &str) -> bool {
    if let Ok(guard) = BLOCK_RULE.lock() {
        // 检查按键是否在拦截列表中
        if guard.keycodes.contains(keycode) {
            // 根据事件类型和规则决定是否拦截
            match event_type {
                "down" => guard.block_down,
                "up" => guard.block_up,
                _ => false,
            }
        } else {
            false
        }
    } else {
        false
    }
}

/// 启动键盘钩子线程
pub fn start_hook_thread() {
    // 检查是否已经在监听
    if IS_LISTENING.load(Ordering::SeqCst) {
        tracing::warn!("[Keyhook] Already listening, skipping");
        return;
    }

    // 在启动线程前设置状态
    IS_LISTENING.store(true, Ordering::SeqCst);
    tracing::info!("[Keyhook] Starting grab thread...");

    let handle = thread::spawn(|| {
        tracing::info!("[Keyhook] Grab thread started, calling rdev::grab...");

        // grab 回调函数
        let callback = |event: Event| -> Option<Event> {
            // 检查是否需要停止
            if SHOULD_STOP.load(Ordering::SeqCst) {
                tracing::info!("[Keyhook] SHOULD_STOP is true, passing event through");
                return Some(event);
            }

            // 只处理键盘事件
            match &event.event_type {
                EventType::KeyPress(key) | EventType::KeyRelease(key) => {
                    let (keycode, raw_code) = key_to_code(*key);
                    let event_type = match event.event_type {
                        EventType::KeyPress(_) => "down",
                        EventType::KeyRelease(_) => "up",
                        _ => return Some(event),
                    };

                    // 使用 debug 级别避免日志过多影响性能
                    tracing::debug!("[Keyhook] ⌨️ Key event: {} ({})", keycode, event_type);

                    // 发送事件到前端
                    if let Ok(guard) = APP_HANDLE.lock() {
                        if let Some(app) = guard.as_ref() {
                            tracing::info!("[Keyhook] 📤 Emitting event to frontend: {} ({})", keycode, event_type);
                            emit_key_event(app, crate::KeyEventPayload {
                                keycode: keycode.to_string(),
                                raw_code,
                                event_type: event_type.to_string(),
                            });
                        } else {
                            tracing::warn!("[Keyhook] ⚠️ APP_HANDLE is None");
                        }
                    } else {
                        tracing::error!("[Keyhook] 🔒 Failed to lock APP_HANDLE");
                    }

                    // 检查是否应该拦截此按键
                    if should_block_key(keycode, event_type) {
                        tracing::info!("[Keyhook] 🚫 Blocking key: {} ({})", keycode, event_type);
                        return None; // 拦截事件
                    }

                    // 放行事件
                    Some(event)
                }
                // 放行非键盘事件（鼠标等）
                _ => Some(event),
            }
        };

        // 启动 grab
        match grab(callback) {
            Ok(()) => {
                tracing::info!("[Keyhook] Grab ended normally");
            }
            Err(e) => {
                tracing::error!("[Keyhook] Grab error: {:?}", e);
            }
        }

        // grab 结束后更新状态
        IS_LISTENING.store(false, Ordering::SeqCst);
        tracing::info!("[Keyhook] Grab thread ended");
    });

    // 保存线程句柄
    if let Ok(mut guard) = GRAB_THREAD.lock() {
        *guard = Some(handle);
    }

    tracing::debug!("Keyhook started with rdev::grab");
}

/// 停止键盘钩子线程
pub fn stop_hook_thread() {
    // 设置停止标志
    SHOULD_STOP.store(true, Ordering::SeqCst);

    // 等待 grab 线程结束
    // 注意：由于 rdev::grab 是阻塞调用，它可能不会立即停止
    // 需要等待下一个键盘事件触发回调检查 SHOULD_STOP 标志
    // 或者等待超时

    // 尝试等待线程结束（最多等待 500ms）
    if let Ok(mut guard) = GRAB_THREAD.lock() {
        if let Some(handle) = guard.take() {
            // 给 grab 线程一点时间来停止
            // 由于 grab 可能不会立即停止，我们不阻塞等待
            // 而是让它在后台自然结束
            thread::spawn(move || {
                let _ = handle.join();
                tracing::debug!("Keyhook thread joined");
            });
        }
    }

    // 清理状态
    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = None;
    }

    tracing::debug!("Keyhook stop requested");
}