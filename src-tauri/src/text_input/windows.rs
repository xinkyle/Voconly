//! Standard Edit delivery avoids the clipboard entirely. Other targets keep a single,
//! bounded clipboard attempt; its completion is deliberately not called confirmed.
use super::{InputOutcome, InputStatus};
use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use log::{info, warn};
use std::{
    mem::size_of,
    thread,
    time::{Duration, Instant},
};
use windows::Win32::{
    Foundation::{HWND, LPARAM, WPARAM},
    System::DataExchange::{GetClipboardSequenceNumber, GetOpenClipboardWindow},
    UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, IsWindowEnabled},
        WindowsAndMessaging::*,
    },
};

const WAIT_LIMIT: Duration = Duration::from_millis(1000);
const QUIET_TIME: Duration = Duration::from_millis(50);
const POLL: Duration = Duration::from_millis(10);
const MAX_VERIFY_UNITS: usize = 1_048_576;
const EM_GETSEL: u32 = 0x00b0;
const EM_REPLACESEL: u32 = 0x00c2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputTarget {
    foreground: usize,
    focus: usize,
    process: u32,
}

impl InputTarget {
    pub fn capture() -> Result<Self, String> {
        unsafe {
            let foreground = GetForegroundWindow();
            if foreground.0.is_null() {
                return Err("no_foreground_window".into());
            }
            let mut process = 0;
            let thread = GetWindowThreadProcessId(foreground, Some(&mut process));
            let mut gui = GUITHREADINFO {
                cbSize: size_of::<GUITHREADINFO>() as u32,
                ..Default::default()
            };
            GetGUIThreadInfo(thread, &mut gui).map_err(|_| "cannot_read_input_focus".to_owned())?;
            if gui.hwndFocus.0.is_null()
                || GetAncestor(gui.hwndFocus, GA_ROOT) != foreground
                || GetForegroundWindow() != foreground
            {
                return Err("no_stable_input_focus".into());
            }
            Ok(Self {
                foreground: foreground.0 as usize,
                focus: gui.hwndFocus.0 as usize,
                process,
            })
        }
    }

    fn hwnd(self) -> HWND {
        HWND(self.focus as *mut _)
    }
    fn unchanged(self) -> bool {
        Self::capture().ok() == Some(self)
    }
    fn class(self) -> String {
        let mut buffer = [0u16; 128];
        let count = unsafe { GetClassNameW(self.hwnd(), &mut buffer) };
        String::from_utf16_lossy(&buffer[..count as usize])
    }
}

fn outcome(
    status: InputStatus,
    method: &'static str,
    reason: &str,
    clipboard: bool,
) -> InputOutcome {
    InputOutcome::new(
        status,
        method,
        (!reason.is_empty()).then(|| reason.to_owned()),
        clipboard,
    )
}

pub fn insert_text(text: &str, target: InputTarget, terminal: bool) -> InputOutcome {
    if text.is_empty() {
        return outcome(InputStatus::Confirmed, "empty", "", false);
    }
    if text.contains('\0') {
        return outcome(InputStatus::NotSubmitted, "none", "embedded_nul", false);
    }
    if !target.unchanged() {
        return outcome(InputStatus::NotSubmitted, "none", "target_changed", false);
    }
    info!(
        "[text_input] target_pid={} foreground={} focus={} class={}",
        target.process,
        target.foreground,
        target.focus,
        target.class()
    );
    // Only the documented Unicode Edit control is enabled here. Other classes,
    // including web editors and RichEdit variants, retain the compatibility path.
    if !terminal
        && target.class().eq_ignore_ascii_case("Edit")
        && unsafe { IsWindowUnicode(target.hwnd()).as_bool() }
    {
        return insert_edit(text, target);
    }
    paste_clipboard(text, target, terminal)
}

fn message(target: InputTarget, msg: u32, wp: usize, lp: isize) -> Result<usize, ()> {
    let mut result = 0;
    let delivered = unsafe {
        SendMessageTimeoutW(
            target.hwnd(),
            msg,
            WPARAM(wp),
            LPARAM(lp),
            SMTO_ABORTIFHUNG | SMTO_BLOCK | SMTO_ERRORONEXIT,
            500,
            Some(&mut result),
        )
    };
    if delivered.0 == 0 {
        Err(())
    } else {
        Ok(result)
    }
}

/// Edit uses UTF-16 offsets and Windows line endings, not Rust byte offsets.
pub fn edit_text(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "\r\n")
}

fn read_edit(target: InputTarget) -> Option<Vec<u16>> {
    let length = message(target, WM_GETTEXTLENGTH, 0, 0).ok()?;
    if length > MAX_VERIFY_UNITS {
        return None;
    }
    let mut buffer = vec![0u16; length + 1];
    let copied = message(
        target,
        WM_GETTEXT,
        buffer.len(),
        buffer.as_mut_ptr() as isize,
    )
    .ok()?;
    if copied > length {
        return None;
    }
    buffer.truncate(copied);
    Some(buffer)
}

fn selection(target: InputTarget) -> Option<(usize, usize)> {
    let (mut start, mut end) = (0u32, 0u32);
    message(
        target,
        EM_GETSEL,
        &mut start as *mut _ as usize,
        &mut end as *mut _ as isize,
    )
    .ok()?;
    Some((start as usize, end as usize))
}

fn insert_edit(text: &str, target: InputTarget) -> InputOutcome {
    let method = "native_edit";
    let style = unsafe { GetWindowLongPtrW(target.hwnd(), GWL_STYLE) } as u32;
    if style & (ES_READONLY as u32 | ES_PASSWORD as u32) != 0
        || !unsafe { IsWindowEnabled(target.hwnd()).as_bool() }
    {
        return outcome(
            InputStatus::NotSubmitted,
            method,
            "control_not_editable",
            false,
        );
    }
    // Same-process SendMessageTimeout with pointer parameters cannot promise the
    // receiver has stopped using the pointer after a timeout. Use keyboard delivery
    // for our own UI rather than exposing a dangling buffer to another UI thread.
    if target.process == std::process::id() {
        return paste_clipboard(text, target, false);
    }
    let before = read_edit(target).zip(selection(target));
    let mut replacement: Vec<u16> = edit_text(text).encode_utf16().collect();
    let expected = before.and_then(|(old, (start, end))| {
        if start > end
            || end > old.len()
            || old.len().saturating_add(replacement.len()) > MAX_VERIFY_UNITS
        {
            return None;
        }
        let mut expected = old[..start].to_vec();
        expected.extend_from_slice(&replacement);
        expected.extend_from_slice(&old[end..]);
        Some(expected)
    });
    if !target.unchanged() {
        return outcome(InputStatus::NotSubmitted, method, "target_changed", false);
    }
    replacement.push(0);
    if message(target, EM_REPLACESEL, 1, replacement.as_ptr() as isize).is_err() {
        // A timeout does not prove that the target did not act. Never paste again.
        return outcome(
            InputStatus::Uncertain,
            method,
            "native_message_failed_or_timed_out",
            false,
        );
    }
    match (expected, read_edit(target)) {
        (Some(expected), Some(actual)) if expected == actual => {
            outcome(InputStatus::Confirmed, method, "", false)
        }
        (Some(_), Some(_)) => outcome(
            InputStatus::Uncertain,
            method,
            "native_content_not_confirmed",
            false,
        ),
        _ => outcome(
            InputStatus::Submitted,
            method,
            "native_message_processed_unverified",
            false,
        ),
    }
}

fn modifiers_released() -> bool {
    // Never synthesize key-up events for keys physically held by the user.
    [0x10, 0x11, 0x12, 0x5b, 0x5c]
        .iter()
        .all(|key| unsafe { GetAsyncKeyState(*key) } >= 0)
}

fn log_clipboard_busy() {
    unsafe {
        let window = GetOpenClipboardWindow().unwrap_or_default();
        let mut process = 0;
        if !window.0.is_null() {
            GetWindowThreadProcessId(window, Some(&mut process));
        }
        warn!(
            "[text_input] clipboard busy: hwnd={} pid={} (null hwnd does not imply unlocked)",
            window.0 as usize, process
        );
    }
}

fn paste_clipboard(text: &str, target: InputTarget, terminal: bool) -> InputOutcome {
    let method = "clipboard";
    let mut clipboard = match Clipboard::new() {
        Ok(clipboard) => clipboard,
        Err(_) => {
            return outcome(
                InputStatus::NotSubmitted,
                method,
                "clipboard_unavailable",
                false,
            )
        }
    };
    let start = Instant::now();
    let initial_sequence = unsafe { GetClipboardSequenceNumber() };
    // Retry only preparation. Once a keystroke is submitted, there is no retry.
    loop {
        if !target.unchanged() {
            return outcome(InputStatus::NotSubmitted, method, "target_changed", false);
        }
        if unsafe { GetClipboardSequenceNumber() } != initial_sequence {
            return outcome(
                InputStatus::NotSubmitted,
                method,
                "clipboard_changed_during_preparation",
                false,
            );
        }
        if clipboard.set_text(text).is_ok() {
            break;
        }
        if start.elapsed() >= WAIT_LIMIT {
            log_clipboard_busy();
            return outcome(
                InputStatus::NotSubmitted,
                method,
                "clipboard_write_timeout",
                false,
            );
        }
        thread::sleep(POLL);
    }
    let sequence = unsafe { GetClipboardSequenceNumber() };
    let preparation = Instant::now();
    let mut quiet_since = None;
    loop {
        if !target.unchanged() {
            return outcome(
                InputStatus::NotSubmitted,
                method,
                "target_changed",
                unsafe { GetClipboardSequenceNumber() } == sequence,
            );
        }
        if unsafe { GetClipboardSequenceNumber() } != sequence {
            return outcome(
                InputStatus::NotSubmitted,
                method,
                "clipboard_changed",
                false,
            );
        }
        match clipboard.get_text() {
            Ok(current) if current != text => {
                return outcome(
                    InputStatus::NotSubmitted,
                    method,
                    "clipboard_changed",
                    false,
                )
            }
            Ok(_) if modifiers_released() => {
                let quiet = quiet_since.get_or_insert_with(Instant::now);
                if quiet.elapsed() >= QUIET_TIME {
                    break;
                }
            }
            _ => quiet_since = None,
        }
        if preparation.elapsed() >= WAIT_LIMIT {
            log_clipboard_busy();
            return outcome(
                InputStatus::NotSubmitted,
                method,
                "clipboard_or_modifiers_timeout",
                true,
            );
        }
        thread::sleep(POLL);
    }
    info!(
        "[text_input] clipboard prepared after {}ms",
        start.elapsed().as_millis()
    );
    let mut enigo = match Enigo::new(&Settings::default()) {
        Ok(enigo) => enigo,
        Err(_) => {
            return outcome(
                InputStatus::NotSubmitted,
                method,
                "keyboard_unavailable",
                true,
            )
        }
    };
    let other_modifier_down = || {
        [0x12, 0x5b, 0x5c, if terminal { 0x11 } else { 0x10 }]
            .iter()
            .any(|key| unsafe { GetAsyncKeyState(*key) } < 0)
    };
    if !target.unchanged()
        || unsafe { GetClipboardSequenceNumber() } != sequence
        || other_modifier_down()
    {
        return outcome(
            InputStatus::NotSubmitted,
            method,
            "target_or_clipboard_changed",
            false,
        );
    }
    let (modifier, key) = if terminal {
        (Key::Shift, Key::Insert)
    } else {
        (Key::Control, Key::Unicode('v'))
    };
    if enigo.key(modifier, Direction::Press).is_err() {
        let _ = enigo.key(modifier, Direction::Release);
        return outcome(
            InputStatus::Uncertain,
            method,
            "modifier_submission_failed",
            true,
        );
    }
    thread::sleep(Duration::from_millis(30));
    if !target.unchanged()
        || unsafe { GetClipboardSequenceNumber() } != sequence
        || other_modifier_down()
    {
        let _ = enigo.key(modifier, Direction::Release);
        return outcome(
            InputStatus::NotSubmitted,
            method,
            "target_or_clipboard_changed",
            false,
        );
    }
    let paste = enigo.key(key, Direction::Click);
    thread::sleep(Duration::from_millis(30));
    let release = enigo.key(modifier, Direction::Release);
    // Keep the result in the clipboard. Restoring after an arbitrary 300ms can
    // erase a failed paste's recovery copy or race a slow target's eventual read.
    if paste.is_err() || release.is_err() {
        outcome(
            InputStatus::Uncertain,
            method,
            "paste_submission_failed",
            true,
        )
    } else {
        outcome(
            InputStatus::Submitted,
            method,
            "paste_sent_unverified",
            true,
        )
    }
}
