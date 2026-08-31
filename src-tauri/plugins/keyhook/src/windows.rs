use crate::{emit_key_event, APP_HANDLE, IS_LISTENING, SHOULD_STOP};
use lazy_static::lazy_static;
use std::ptr::null_mut;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use windows::Win32::{
    Devices::HumanInterfaceDevice::{HID_USAGE_GENERIC_KEYBOARD, HID_USAGE_PAGE_GENERIC},
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL},
    UI::{
        Input::{
            GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE,
            RAWINPUTHEADER, RIDEV_INPUTSINK, RID_INPUT, RIM_TYPEKEYBOARD,
        },
        WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW,
            PostMessageW, RegisterClassW, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, HWND_MESSAGE, MSG,
            RI_KEY_BREAK, WM_DESTROY, WM_INPUT, WM_QUIT, WNDCLASSW, WS_OVERLAPPEDWINDOW,
        },
    },
};

static mut RAW_INPUT_HWND: HWND = HWND(null_mut());

#[derive(Clone)]
struct WindowsKeyEvent {
    keycode: String,
    raw_code: u32,
    event_type: String,
}

lazy_static! {
    static ref WIN_EVENT_SENDER: Mutex<Option<Sender<WindowsKeyEvent>>> = Mutex::new(None);
}

/// Raw Input 窗口过程函数
unsafe extern "system" fn raw_input_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_INPUT => {
            let mut size: u32 = 0;

            let _ = GetRawInputData(
                HRAWINPUT(lparam.0 as _),
                RID_INPUT,
                None,
                &mut size,
                std::mem::size_of::<RAWINPUTHEADER>() as u32,
            );

            if size > 0 {
                let mut buffer = vec![0u8; size as usize];
                let result = GetRawInputData(
                    HRAWINPUT(lparam.0 as _),
                    RID_INPUT,
                    Some(buffer.as_mut_ptr() as *mut _),
                    &mut size,
                    std::mem::size_of::<RAWINPUTHEADER>() as u32,
                );

                if result == size {
                    let raw_input = &*(buffer.as_ptr() as *const RAWINPUT);

                    if raw_input.header.dwType == RIM_TYPEKEYBOARD.0 {
                        let keyboard = &raw_input.data.keyboard;
                        let vk = keyboard.VKey;
                        let scan_code = keyboard.MakeCode;
                        let flags = keyboard.Flags;

                        let event_type = if (flags & (RI_KEY_BREAK as u16)) != 0 {
                            "up"
                        } else {
                            "down"
                        };

                        // E0 标志用于区分左右修饰键
                        const RI_KEY_E0: u16 = 0x02;
                        let is_extended = (flags & RI_KEY_E0) != 0;

                        let (key_name, mapped_vk) = match vk as u32 {
                            // Ctrl 键：扩展键标志区分左右
                            0x11 => {
                                if is_extended {
                                    ("RightCtrl", 0xA3u32)
                                } else {
                                    ("LeftCtrl", 0xA2u32)
                                }
                            }
                            // Shift 键：扫描码区分左右
                            0x10 => {
                                if scan_code == 54 {
                                    ("RightShift", 0xA1u32)
                                } else {
                                    ("LeftShift", 0xA0u32)
                                }
                            }
                            // Alt 键：扩展键标志区分左右
                            0x12 => {
                                if is_extended {
                                    ("RightAlt", 0xA5u32)
                                } else {
                                    ("LeftAlt", 0xA4u32)
                                }
                            }
                            // 直接发送左右键码的情况
                            0xA4 => ("LeftAlt", 0xA4u32),
                            0xA5 => ("RightAlt", 0xA5u32),
                            0xA2 => ("LeftCtrl", 0xA2u32),
                            0xA3 => ("RightCtrl", 0xA3u32),
                            0xA0 => ("LeftShift", 0xA0u32),
                            0xA1 => ("RightShift", 0xA1u32),
                            // Windows 键
                            0x5B => ("LeftWindows", 0x5Bu32),
                            0x5C => ("RightWindows", 0x5Cu32),
                            // 数字键 0-9 (主键盘上方)
                            0x30 => ("Digit0", 0x30u32),
                            0x31 => ("Digit1", 0x31u32),
                            0x32 => ("Digit2", 0x32u32),
                            0x33 => ("Digit3", 0x33u32),
                            0x34 => ("Digit4", 0x34u32),
                            0x35 => ("Digit5", 0x35u32),
                            0x36 => ("Digit6", 0x36u32),
                            0x37 => ("Digit7", 0x37u32),
                            0x38 => ("Digit8", 0x38u32),
                            0x39 => ("Digit9", 0x39u32),
                            // 字母键 A-Z
                            0x41 => ("KeyA", 0x41u32),
                            0x42 => ("KeyB", 0x42u32),
                            0x43 => ("KeyC", 0x43u32),
                            0x44 => ("KeyD", 0x44u32),
                            0x45 => ("KeyE", 0x45u32),
                            0x46 => ("KeyF", 0x46u32),
                            0x47 => ("KeyG", 0x47u32),
                            0x48 => ("KeyH", 0x48u32),
                            0x49 => ("KeyI", 0x49u32),
                            0x4A => ("KeyJ", 0x4Au32),
                            0x4B => ("KeyK", 0x4Bu32),
                            0x4C => ("KeyL", 0x4Cu32),
                            0x4D => ("KeyM", 0x4Du32),
                            0x4E => ("KeyN", 0x4Eu32),
                            0x4F => ("KeyO", 0x4Fu32),
                            0x50 => ("KeyP", 0x50u32),
                            0x51 => ("KeyQ", 0x51u32),
                            0x52 => ("KeyR", 0x52u32),
                            0x53 => ("KeyS", 0x53u32),
                            0x54 => ("KeyT", 0x54u32),
                            0x55 => ("KeyU", 0x55u32),
                            0x56 => ("KeyV", 0x56u32),
                            0x57 => ("KeyW", 0x57u32),
                            0x58 => ("KeyX", 0x58u32),
                            0x59 => ("KeyY", 0x59u32),
                            0x5A => ("KeyZ", 0x5Au32),
                            // 标点符号键
                            0xBA => ("Semicolon", 0xBAu32),      // ; :
                            0xBB => ("Equal", 0xBBu32),          // = +
                            0xBC => ("Comma", 0xBCu32),          // , <
                            0xBD => ("Minus", 0xBDu32),          // - _
                            0xBE => ("Period", 0xBEu32),         // . >
                            0xBF => ("Slash", 0xBFu32),          // / ?
                            0xC0 => ("Backquote", 0xC0u32),      // ` ~
                            0xDB => ("BracketLeft", 0xDBu32),    // [ {
                            0xDC => ("Backslash", 0xDCu32),      // \ |
                            0xDD => ("BracketRight", 0xDDu32),   // ] }
                            0xDE => ("Quote", 0xDEu32),          // ' "
                            // 功能键 F1-F24
                            0x70 => ("F1", 0x70u32),
                            0x71 => ("F2", 0x71u32),
                            0x72 => ("F3", 0x72u32),
                            0x73 => ("F4", 0x73u32),
                            0x74 => ("F5", 0x74u32),
                            0x75 => ("F6", 0x75u32),
                            0x76 => ("F7", 0x76u32),
                            0x77 => ("F8", 0x77u32),
                            0x78 => ("F9", 0x78u32),
                            0x79 => ("F10", 0x79u32),
                            0x7A => ("F11", 0x7Au32),
                            0x7B => ("F12", 0x7Bu32),
                            0x7C => ("F13", 0x7Cu32),
                            0x7D => ("F14", 0x7Du32),
                            0x7E => ("F15", 0x7Eu32),
                            0x7F => ("F16", 0x7Fu32),
                            0x80 => ("F17", 0x80u32),
                            0x81 => ("F18", 0x81u32),
                            0x82 => ("F19", 0x82u32),
                            0x83 => ("F20", 0x83u32),
                            0x84 => ("F21", 0x84u32),
                            0x85 => ("F22", 0x85u32),
                            0x86 => ("F23", 0x86u32),
                            0x87 => ("F24", 0x87u32),
                            _ => ("Other", vk as u32),
                        };

                        if let Ok(guard) = WIN_EVENT_SENDER.try_lock() {
                            if let Some(sender) = guard.as_ref() {
                                let _ = sender.send(WindowsKeyEvent {
                                    keycode: key_name.to_string(),
                                    raw_code: mapped_vk,
                                    event_type: event_type.to_string(),
                                });
                            }
                        }
                    }
                }
            }
            LRESULT(0)
        }
        WM_DESTROY => LRESULT(0),
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// 启动键盘钩子线程
pub fn start_hook_thread() {
    let (sender, receiver) = channel::<WindowsKeyEvent>();

    if let Ok(mut guard) = WIN_EVENT_SENDER.lock() {
        *guard = Some(sender);
    }

    // 事件分发线程
    std::thread::spawn(move || loop {
        match receiver.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(event) => {
                if let Ok(guard) = APP_HANDLE.lock() {
                    if let Some(app) = guard.as_ref() {
                        emit_key_event(app, crate::KeyEventPayload {
                            keycode: event.keycode,
                            raw_code: event.raw_code,
                            event_type: event.event_type,
                        });
                    }
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if SHOULD_STOP.load(Ordering::SeqCst) {
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                break;
            }
        }
    });

    // Raw Input 窗口线程
    std::thread::spawn(|| unsafe {
        let current_thread = GetCurrentThread();
        // 使用 ABOVE_NORMAL 优先级，避免抢占过多 CPU 资源
        // TIME_CRITICAL 可能导致系统卡顿或被安全软件拦截
        let _ = SetThreadPriority(current_thread, THREAD_PRIORITY_ABOVE_NORMAL);
        tracing::debug!("Keyhook listener thread started with above-normal priority");

        let class_name_str = "RawInputKeyboardClass\0";
        let class_name: Vec<u16> = class_name_str.encode_utf16().collect();

        let wnd_class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(raw_input_wnd_proc),
            hInstance: windows::Win32::Foundation::HINSTANCE(null_mut()),
            lpszClassName: windows::core::PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };

        let atom = RegisterClassW(&wnd_class);
        if atom == 0 {
            tracing::error!("Failed to register the keyhook window class");
            IS_LISTENING.store(false, Ordering::SeqCst);
            return;
        }

        let hwnd = match CreateWindowExW(
            Default::default(),
            windows::core::PCWSTR(class_name.as_ptr()),
            windows::core::PCWSTR::null(),
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            HWND_MESSAGE,
            None,
            None,
            None,
        ) {
            Ok(hwnd) => hwnd,
            Err(e) => {
                tracing::error!("Failed to create the keyhook message window: {:?}", e);
                IS_LISTENING.store(false, Ordering::SeqCst);
                return;
            }
        };

        if hwnd.0.is_null() {
            tracing::error!("Created window handle is null");
            IS_LISTENING.store(false, Ordering::SeqCst);
            return;
        }

        RAW_INPUT_HWND = hwnd;
        tracing::debug!("Keyhook message window created");

        // 注册 Raw Input 设备
        let raw_input_device = RAWINPUTDEVICE {
            usUsagePage: HID_USAGE_PAGE_GENERIC,
            usUsage: HID_USAGE_GENERIC_KEYBOARD,
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        };

        let result = RegisterRawInputDevices(
            &[raw_input_device],
            std::mem::size_of::<RAWINPUTDEVICE>() as u32,
        );

        if result.is_err() {
            tracing::error!(error = ?result.err(), "Failed to register Raw Input device");
            let _ = DestroyWindow(hwnd);
            IS_LISTENING.store(false, Ordering::SeqCst);
            return;
        }
        tracing::debug!("Keyboard Raw Input device registered");

        let mut msg = MSG::default();
        tracing::debug!("Keyhook Raw Input message loop started");

        loop {
            // 使用 GetMessage 处理消息
            let ret = windows::Win32::UI::WindowsAndMessaging::GetMessageW(&mut msg, HWND(null_mut()), 0, 0);

            if ret.0 == 0 || ret.0 == -1 {
                tracing::debug!("Keyhook Raw Input message loop ended");
                break;
            }

            DispatchMessageW(&msg);
        }

        let _ = DestroyWindow(hwnd);
        RAW_INPUT_HWND = HWND(null_mut());
        tracing::debug!("Keyhook Raw Input resources released");

        IS_LISTENING.store(false, Ordering::SeqCst);

        if let Ok(mut guard) = WIN_EVENT_SENDER.lock() {
            *guard = None;
        }
    });
}

/// 停止键盘钩子线程
pub fn stop_hook_thread() {
    unsafe {
        if !RAW_INPUT_HWND.0.is_null() {
            let _ = PostMessageW(RAW_INPUT_HWND, WM_QUIT, WPARAM(0), LPARAM(0));
            tracing::debug!("Requested the keyhook Raw Input message loop to stop");
        }
    }

    if let Ok(mut guard) = WIN_EVENT_SENDER.lock() {
        *guard = None;
    }
}