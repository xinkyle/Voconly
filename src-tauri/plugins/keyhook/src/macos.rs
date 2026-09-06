use crate::{emit_key_event, emit_listen_state, APP_HANDLE, IS_LISTENING, SHOULD_STOP};
use core_foundation::base::TCFType;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop, CFRunLoopRef};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType, EventField,
};
use lazy_static::lazy_static;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRunLoopRun();
    fn CFRunLoopStop(rl: CFRunLoopRef);
}

struct SendableCFRunLoopRef(CFRunLoopRef);

unsafe impl Send for SendableCFRunLoopRef {}
unsafe impl Sync for SendableCFRunLoopRef {}

const FN_KEYCODE: i64 = 63;

lazy_static! {
    static ref MACOS_RUNLOOP: Mutex<Option<SendableCFRunLoopRef>> = Mutex::new(None);
}

static FN_KEY_PRESSED: AtomicBool = AtomicBool::new(false);

// macOS 设备特定标志
const NX_DEVICELSHIFTKEYMASK: u64 = 0x00000002;
const NX_DEVICERSHIFTKEYMASK: u64 = 0x00000004;
const NX_DEVICELCTLKEYMASK: u64 = 0x00000001;
const NX_DEVICERCTLKEYMASK: u64 = 0x00002000;
const NX_DEVICELALTKEYMASK: u64 = 0x00000020;
const NX_DEVICERALTKEYMASK: u64 = 0x00000040;
const NX_DEVICELCMDKEYMASK: u64 = 0x00000008;
const NX_DEVICERCMDKEYMASK: u64 = 0x00000010;

/// 是否已清理过失效的「输入监控」授权条目（每个进程只清理一次，
/// 避免反复重置用户刚在系统设置里做的授权）
static LISTEN_RESET_DONE: AtomicBool = AtomicBool::new(false);

/// 清理可能失效的「输入监控」授权条目（通过官方 tccutil，无需管理员权限）。
/// 条目失效（如应用签名变更）时，系统设置里的开关看起来已打开但实际不生效；
/// 重置后下次创建 tap 会让系统重新注册当前二进制并弹出授权引导。
fn reset_listen_event_grant() {
    if LISTEN_RESET_DONE.swap(true, Ordering::SeqCst) {
        return;
    }
    let identifier = APP_HANDLE
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|app| app.config().identifier.clone()))
        .unwrap_or_else(|| "com.voconly.desktop".to_string());
    match std::process::Command::new("/usr/bin/tccutil")
        .args(["reset", "ListenEvent", &identifier])
        .status()
    {
        Ok(status) if status.success() => {
            tracing::info!("[Keyhook] Reset stale Input Monitoring entry for {}", identifier);
        }
        Ok(status) => tracing::error!("[Keyhook] tccutil reset ListenEvent failed: {}", status),
        Err(e) => tracing::error!("[Keyhook] Failed to run tccutil: {}", e),
    }
}

/// 启动键盘钩子线程
pub fn start_hook_thread() {
    std::thread::spawn(|| {
        unsafe {
            // 无权限（或授权条目失效）时 tap 创建会失败：清理失效条目后重试一次，
            // 重试会让系统重新注册当前二进制并弹出「输入监控」授权引导
            let create_tap = || {
                CGEventTap::new(
                    CGEventTapLocation::HID,
                    CGEventTapPlacement::HeadInsertEventTap,
                    CGEventTapOptions::ListenOnly,
                    vec![
                        CGEventType::FlagsChanged,
                        CGEventType::KeyDown,
                        CGEventType::KeyUp,
                    ],
                    |_proxy, type_, event| {
                        if SHOULD_STOP.load(Ordering::SeqCst) {
                            return Some(event.to_owned());
                        }

                        let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);

                        // macOS 键码映射
                        let key_name = match keycode {
                            // 修饰键
                            58 => "LeftOption",
                            61 => "RightOption",
                            59 => "LeftCtrl",
                            62 => "RightCtrl",
                            56 => "LeftShift",
                            60 => "RightShift",
                            55 => "LeftCmd",
                            54 => "RightCmd",
                            // Fn 键
                            FN_KEYCODE => "Fn",
                            // 功能键 F1-F12
                            122 => "F1",
                            120 => "F2",
                            99 => "F3",
                            118 => "F4",
                            96 => "F5",
                            97 => "F6",
                            98 => "F7",
                            100 => "F8",
                            101 => "F9",
                            109 => "F10",
                            103 => "F11",
                            111 => "F12",
                            _ => "Other",
                        };

                        let mut event_type = match type_ {
                            CGEventType::KeyDown => "down",
                            CGEventType::KeyUp => "up",
                            CGEventType::FlagsChanged => "flags_changed",
                            _ => "unknown",
                        };

                        // 处理 FlagsChanged 事件，根据设备标志确定真实的按下/释放状态
                        if event_type == "flags_changed" {
                            if keycode == FN_KEYCODE {
                                let was_pressed = FN_KEY_PRESSED.load(Ordering::SeqCst);
                                let is_pressed = !was_pressed;
                                FN_KEY_PRESSED.store(is_pressed, Ordering::SeqCst);

                                if is_pressed {
                                    event_type = "down";
                                } else {
                                    event_type = "up";
                                }
                            } else {
                                let flags = event.get_flags().bits();
                                let mask = match keycode {
                                    56 => Some(NX_DEVICELSHIFTKEYMASK),
                                    60 => Some(NX_DEVICERSHIFTKEYMASK),
                                    59 => Some(NX_DEVICELCTLKEYMASK),
                                    62 => Some(NX_DEVICERCTLKEYMASK),
                                    58 => Some(NX_DEVICELALTKEYMASK),
                                    61 => Some(NX_DEVICERALTKEYMASK),
                                    55 => Some(NX_DEVICELCMDKEYMASK),
                                    54 => Some(NX_DEVICERCMDKEYMASK),
                                    _ => None,
                                };

                                if let Some(m) = mask {
                                    if (flags & m) != 0 {
                                        event_type = "down";
                                    } else {
                                        event_type = "up";
                                    }
                                }
                            }
                        }

                        if let Ok(guard) = APP_HANDLE.lock() {
                            if let Some(app) = guard.as_ref() {
                                emit_key_event(app, crate::KeyEventPayload {
                                    keycode: key_name.to_string(),
                                    raw_code: keycode as u32,
                                    event_type: event_type.to_string(),
                                });
                            }
                        }

                        // 始终传递事件（不阻塞）
                        Some(event.to_owned())
                    },
                )
            };

            let tap = match create_tap() {
                Ok(tap) => Ok(tap),
                Err(_) => {
                    tracing::error!(
                        "Failed to create the keyboard event tap; resetting stale Input Monitoring entry and retrying"
                    );
                    reset_listen_event_grant();
                    create_tap()
                }
            };

            match tap {
                Ok(stream) => {
                    let Ok(loop_source) = stream.mach_port.create_runloop_source(0) else {
                        tracing::error!("Failed to create the macOS keyhook RunLoop source");
                        if let Ok(guard) = APP_HANDLE.lock() {
                            if let Some(app) = guard.as_ref() {
                                emit_listen_state(app, false);
                            }
                        }
                        IS_LISTENING.store(false, Ordering::SeqCst);
                        return;
                    };

                    let current_loop = CFRunLoop::get_current();
                    current_loop.add_source(&loop_source, kCFRunLoopCommonModes);

                    if let Ok(mut guard) = MACOS_RUNLOOP.lock() {
                        *guard = Some(SendableCFRunLoopRef(current_loop.as_concrete_TypeRef()));
                    }

                    // 通知前端监听已就绪（授权自动恢复后用于清除引导提示）
                    if let Ok(guard) = APP_HANDLE.lock() {
                        if let Some(app) = guard.as_ref() {
                            emit_listen_state(app, true);
                        }
                    }

                    CFRunLoopRun();

                    if let Ok(mut guard) = MACOS_RUNLOOP.lock() {
                        *guard = None;
                    }
                }
                Err(_) => {
                    tracing::error!(
                        "Failed to create the keyboard event tap; check Input Monitoring permission in System Settings"
                    );
                    if let Ok(guard) = APP_HANDLE.lock() {
                        if let Some(app) = guard.as_ref() {
                            emit_listen_state(app, false);
                        }
                    }
                }
            }
        }
        IS_LISTENING.store(false, Ordering::SeqCst);
    });
}

/// 停止键盘钩子线程
pub fn stop_hook_thread() {
    unsafe {
        if let Ok(guard) = MACOS_RUNLOOP.lock() {
            if let Some(ref rl) = *guard {
                CFRunLoopStop(rl.0);
            }
        }
    }
}
