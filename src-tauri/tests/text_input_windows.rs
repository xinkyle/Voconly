#![cfg(windows)]
#[path = "../src/text_input/mod.rs"]
mod text_input;
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use text_input::{
    windows::{insert_text, InputTarget},
    InputStatus,
};
use windows::Win32::System::Threading::AttachThreadInput;
use windows::{
    core::w,
    Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        System::DataExchange::{CloseClipboard, OpenClipboard},
        UI::WindowsAndMessaging::*,
    },
};

#[test]
fn windows_line_endings_preserve_unicode_and_do_not_double_crlf() {
    assert_eq!(
        text_input::windows::edit_text("中文🙂\r\nnext\nlast\tend"),
        "中文🙂\r\nnext\r\nlast\tend"
    );
}

// A separate process is essential: these are real, marshalled Edit messages,
// not mocked APIs or same-process calls. The host never touches user documents.
struct Host {
    child: Child,
    parent: HWND,
    edit: HWND,
    previous: HWND,
}
impl Host {
    fn start(kind: &str) -> Self {
        let previous = unsafe { GetForegroundWindow() };
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args(["--ignored", "--exact", "edit_host", "--nocapture"])
            .env("VOCONLY_TEST_HOST", kind)
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let handles = lines
            .find_map(|line| {
                line.ok()
                    .and_then(|line| line.strip_prefix("INPUT_HOST ").map(str::to_owned))
            })
            .unwrap();
        let handles: Vec<usize> = handles
            .split_whitespace()
            .map(|v| v.parse().unwrap())
            .collect();
        let parent = HWND(handles[0] as *mut _);
        let edit = HWND(handles[1] as *mut _);
        let host = Self {
            child,
            parent,
            edit,
            previous,
        };
        unsafe {
            // Test setup only. The production implementation never attaches queues.
            let mut message = MSG::default();
            let _ = PeekMessageW(&mut message, None, 0, 0, PM_NOREMOVE);
            let current = windows::Win32::System::Threading::GetCurrentThreadId();
            // SetForegroundWindow may be restricted for an unattended test runner.
            for _ in 0..10 {
                let target = GetWindowThreadProcessId(GetForegroundWindow(), None);
                let attached = AttachThreadInput(current, target, true).as_bool();
                let _ = SetForegroundWindow(parent);
                if attached {
                    let _ = AttachThreadInput(current, target, false);
                }
                if GetForegroundWindow() == parent {
                    break;
                }
                thread::sleep(Duration::from_millis(30));
            }
            assert!(
                GetForegroundWindow() == parent,
                "The desktop must be available for this opt-in test"
            );
        }
        let start = Instant::now();
        while InputTarget::capture().is_err() {
            assert!(start.elapsed() < Duration::from_secs(2));
            thread::sleep(Duration::from_millis(10));
        }
        thread::sleep(Duration::from_millis(30));
        host
    }
    fn text(&self) -> String {
        let mut buffer = [0u16; 512];
        let n = unsafe {
            SendMessageW(
                self.edit,
                WM_GETTEXT,
                WPARAM(buffer.len()),
                LPARAM(buffer.as_mut_ptr() as isize),
            )
            .0
        };
        String::from_utf16_lossy(&buffer[..n as usize])
    }
    fn seed(&self, text: &str) {
        let text: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
        unsafe {
            SendMessageW(
                self.edit,
                WM_SETTEXT,
                WPARAM(0),
                LPARAM(text.as_ptr() as isize),
            );
        }
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        unsafe {
            if !self.previous.0.is_null() {
                let _ = SetForegroundWindow(self.previous);
            }
        }
    }
}

fn hold_clipboard() -> std::sync::mpsc::Sender<()> {
    let (locked_tx, locked_rx) = std::sync::mpsc::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    thread::spawn(move || unsafe {
        let monitor = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("STATIC"),
            w!("Clipboard contention fixture"),
            WS_POPUP,
            0,
            0,
            1,
            1,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let start = Instant::now();
        while OpenClipboard(monitor).is_err() {
            assert!(start.elapsed() < Duration::from_secs(2));
            thread::sleep(Duration::from_millis(5));
        }
        locked_tx.send(()).unwrap();
        let _ = release_rx.recv_timeout(Duration::from_secs(10));
        CloseClipboard().unwrap();
        let _ = DestroyWindow(monitor);
    });
    locked_rx.recv_timeout(Duration::from_secs(3)).unwrap();
    release_tx
}

fn set_clipboard(clipboard: &mut arboard::Clipboard, text: impl AsRef<str>) {
    let start = Instant::now();
    while clipboard.set_text(text.as_ref()).is_err() {
        assert!(
            start.elapsed() < Duration::from_secs(2),
            "fixture clipboard writer timed out"
        );
        thread::sleep(Duration::from_millis(10));
    }
}

#[test]
#[ignore = "Opt-in desktop test: uses only its own off-screen editor and temporarily the clipboard"]
fn real_windows_delivery_regressions() {
    let host = Host::start("edit");
    let clipboard_lock = hold_clipboard();
    for n in 0..30 {
        host.seed("前缀后缀");
        unsafe {
            SendMessageW(host.edit, 0x00b1, WPARAM(2), LPARAM(2));
        }
        let result = insert_text(
            "中文🙂\n第二行\tend",
            InputTarget::capture().unwrap(),
            false,
        );
        assert_eq!(result.status, InputStatus::Confirmed, "{result:?}");
        assert_eq!(result.method, "native_edit");
        assert_eq!(host.text(), "前缀中文🙂\r\n第二行\tend后缀");
        unsafe {
            SendMessageW(host.edit, 0x00c7, WPARAM(0), LPARAM(0));
        }
        assert_eq!(
            host.text(),
            "前缀后缀",
            "insertion must be undoable, iteration {n}"
        );
    }
    // Native delivery leaves the clipboard entirely alone, even under contention.
    clipboard_lock.send(()).unwrap();
    drop(host);

    let host = Host::start("edit");
    let mut clipboard = arboard::Clipboard::new().unwrap();
    let backup = clipboard.get_text().ok();
    set_clipboard(&mut clipboard, "替换🙂\r\n第二行");
    thread::sleep(Duration::from_millis(200));
    host.seed("前缀OLD后缀");
    unsafe {
        SendMessageW(host.edit, 0x00b1, WPARAM(2), LPARAM(5));
        let before = SendMessageW(host.parent, WM_APP + 1, WPARAM(0), LPARAM(0));
        SendMessageW(host.edit, WM_PASTE, WPARAM(0), LPARAM(0));
        let after = SendMessageW(host.parent, WM_APP + 1, WPARAM(0), LPARAM(0));
        assert!(
            after.0 > before.0,
            "baseline WM_PASTE must actually change the control"
        );
        SendMessageW(host.edit, 0x00c7, WPARAM(0), LPARAM(0));
    }
    let baseline_undo = host.text();
    let clipboard_lock = hold_clipboard();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(120));
        let _ = clipboard_lock.send(());
    });
    for _ in 0..30 {
        host.seed("前缀OLD后缀");
        unsafe {
            SendMessageW(host.edit, 0x00b1, WPARAM(2), LPARAM(5));
        }
        let result = insert_text("替换🙂\n第二行", InputTarget::capture().unwrap(), false);
        assert_eq!(result.status, InputStatus::Confirmed, "{result:?}");
        assert_eq!(result.method, "native_edit");
        assert_eq!(host.text(), "前缀替换🙂\r\n第二行后缀");
        unsafe {
            SendMessageW(host.edit, 0x00c7, WPARAM(0), LPARAM(0));
        }
        assert_eq!(
            host.text(),
            baseline_undo,
            "native replacement must preserve the control's existing undo behavior"
        );
    }
    if let Some(backup) = backup {
        set_clipboard(&mut clipboard, backup);
    } else {
        clipboard.clear().unwrap();
    }
    drop(host);

    let host = Host::start("static");
    let clipboard_lock = hold_clipboard();
    let result = insert_text("must not submit", InputTarget::capture().unwrap(), false);
    assert_eq!(result.status, InputStatus::NotSubmitted);
    assert_eq!(result.reason.as_deref(), Some("clipboard_write_timeout"));
    clipboard_lock.send(()).unwrap();
    thread::sleep(Duration::from_millis(30));
    // A user copy between preparation and submission must survive untouched.
    let mut clipboard = arboard::Clipboard::new().unwrap();
    let backup = clipboard.get_text().ok();
    set_clipboard(&mut clipboard, "before");
    let sequence = unsafe { windows::Win32::System::DataExchange::GetClipboardSequenceNumber() };
    let copier = thread::spawn(move || {
        let mut clipboard = arboard::Clipboard::new().unwrap();
        let start = Instant::now();
        while unsafe { windows::Win32::System::DataExchange::GetClipboardSequenceNumber() }
            == sequence
        {
            assert!(start.elapsed() < Duration::from_secs(2));
            thread::sleep(Duration::from_millis(1));
        }
        set_clipboard(&mut clipboard, "new user copy");
    });
    let result = insert_text("generated result", InputTarget::capture().unwrap(), false);
    copier.join().unwrap();
    assert_eq!(result.status, InputStatus::NotSubmitted, "{result:?}");
    assert_eq!(clipboard.get_text().unwrap(), "new user copy");
    if let Some(backup) = backup {
        set_clipboard(&mut clipboard, backup);
    } else {
        clipboard.clear().unwrap();
    }
    let old_target = InputTarget::capture().unwrap();
    let other = Host::start("edit");
    let result = insert_text("wrong window", old_target, false);
    assert_eq!(result.status, InputStatus::NotSubmitted);
    assert_eq!(result.reason.as_deref(), Some("target_changed"));
    assert_eq!(other.text(), "");
    drop(other);
    drop(host);
    let readonly = Host::start("readonly");
    let result = insert_text("readonly", InputTarget::capture().unwrap(), false);
    assert_eq!(result.status, InputStatus::NotSubmitted);
    assert_eq!(readonly.text(), "");
    drop(readonly);
    let slow = Host::start("slow");
    let result = insert_text("only once", InputTarget::capture().unwrap(), false);
    assert_eq!(result.status, InputStatus::Uncertain);
    assert_eq!(
        result.reason.as_deref(),
        Some("native_message_failed_or_timed_out")
    );
    assert_eq!(
        slow.text(),
        "only once",
        "a timed-out message may still finish; do not retry it"
    );
}

static ORIGINAL_EDIT_PROC: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static ORIGINAL_PARENT_PROC: std::sync::atomic::AtomicIsize =
    std::sync::atomic::AtomicIsize::new(0);
static CHANGES: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
unsafe extern "system" fn parent_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    if msg == WM_COMMAND && (wp.0 >> 16) & 0xffff == 0x0300 {
        CHANGES.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
    if msg == WM_APP + 1 {
        return windows::Win32::Foundation::LRESULT(
            CHANGES.load(std::sync::atomic::Ordering::SeqCst) as isize,
        );
    }
    CallWindowProcW(
        std::mem::transmute(ORIGINAL_PARENT_PROC.load(std::sync::atomic::Ordering::SeqCst)),
        hwnd,
        msg,
        wp,
        lp,
    )
}
unsafe extern "system" fn slow_edit_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    if msg == 0x00c2 {
        thread::sleep(Duration::from_millis(900));
    }
    CallWindowProcW(
        std::mem::transmute(ORIGINAL_EDIT_PROC.load(std::sync::atomic::Ordering::SeqCst)),
        hwnd,
        msg,
        wp,
        lp,
    )
}

#[test]
#[ignore = "Subprocess fixture, invoked by real_windows_delivery_regressions"]
fn edit_host() {
    let Ok(kind) = std::env::var("VOCONLY_TEST_HOST") else {
        return;
    };
    unsafe {
        let parent = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("STATIC"),
            w!("Voconly test editor"),
            WS_OVERLAPPEDWINDOW,
            -30000,
            -30000,
            400,
            200,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        ORIGINAL_PARENT_PROC.store(
            SetWindowLongPtrW(parent, GWLP_WNDPROC, parent_proc as *const () as isize),
            std::sync::atomic::Ordering::SeqCst,
        );
        let class = if kind == "static" {
            w!("STATIC")
        } else {
            w!("EDIT")
        };
        let style = WS_CHILD
            | WS_VISIBLE
            | WINDOW_STYLE(ES_MULTILINE as u32)
            | if kind == "readonly" {
                WINDOW_STYLE(ES_READONLY as u32)
            } else {
                WINDOW_STYLE(0)
            };
        let edit = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class,
            w!(""),
            style,
            0,
            0,
            380,
            160,
            parent,
            None,
            None,
            None,
        )
        .unwrap();
        if kind == "slow" {
            ORIGINAL_EDIT_PROC.store(
                SetWindowLongPtrW(edit, GWLP_WNDPROC, slow_edit_proc as *const () as isize),
                std::sync::atomic::Ordering::SeqCst,
            );
        }
        let _ = ShowWindow(parent, SW_SHOW);
        let current = windows::Win32::System::Threading::GetCurrentThreadId();
        let previous_thread = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let attached = AttachThreadInput(current, previous_thread, true).as_bool();
        let _ = SetForegroundWindow(parent);
        let _ = windows::Win32::UI::Input::KeyboardAndMouse::SetFocus(edit);
        if attached {
            let _ = AttachThreadInput(current, previous_thread, false);
        }
        println!("INPUT_HOST {} {}", parent.0 as usize, edit.0 as usize);
        loop {
            let mut message = MSG::default();
            while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            if GetForegroundWindow() == parent
                && windows::Win32::UI::Input::KeyboardAndMouse::GetFocus() != edit
            {
                let _ = windows::Win32::UI::Input::KeyboardAndMouse::SetFocus(edit);
            }
            thread::sleep(Duration::from_millis(1));
        }
    }
}
