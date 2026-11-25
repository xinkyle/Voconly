pub const TARGET_CHANGED: &str = "LIVE_INPUT_TARGET_CHANGED";
pub const CANCELLED: &str = "LIVE_INPUT_CANCELLED";

#[derive(PartialEq)]
pub enum WindowIdentity {
    #[cfg(any(windows, test))]
    NativeHandle(usize),
    #[cfg(target_os = "macos")]
    Accessibility(macos::FocusedWindow),
}

#[cfg(target_os = "macos")]
impl WindowIdentity {
    pub fn for_process(process: u32) -> Option<Self> {
        macos::FocusedWindow::for_process(process).map(Self::Accessibility)
    }
}

#[derive(PartialEq)]
pub struct ForegroundTarget {
    pub process: u32,
    pub window: Option<WindowIdentity>,
}

#[derive(Default)]
pub struct LiveVoiceInput {
    active: Option<(u32, ForegroundTarget)>,
}

impl LiveVoiceInput {
    pub fn begin(
        &mut self,
        session_id: u32,
        foreground: Option<ForegroundTarget>,
    ) -> Result<(), &'static str> {
        self.active = foreground.map(|target| (session_id, target));
        self.active.as_ref().map(|_| ()).ok_or(TARGET_CHANGED)
    }

    pub fn end(&mut self, session_id: u32) {
        if self
            .active
            .as_ref()
            .is_some_and(|(id, _)| *id == session_id)
        {
            self.cancel();
        }
    }

    pub fn cancel(&mut self) {
        self.active = None;
    }

    pub fn verify(
        &mut self,
        session_id: u32,
        foreground: Option<ForegroundTarget>,
    ) -> Result<(), &'static str> {
        let Some((active_id, target)) = self.active.as_ref() else {
            return Err(CANCELLED);
        };
        if *active_id != session_id {
            return Err(CANCELLED);
        }
        if foreground.as_ref() != Some(target) {
            self.cancel();
            return Err(TARGET_CHANGED);
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use core_foundation::base::{CFType, CFTypeID, CFTypeRef, TCFType};
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateApplication(process: i32) -> CFTypeRef;
        fn AXUIElementSetMessagingTimeout(element: CFTypeRef, timeout: f32) -> i32;
        fn AXUIElementCopyAttributeValue(
            element: CFTypeRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> i32;
        fn AXUIElementGetTypeID() -> CFTypeID;
    }

    #[derive(PartialEq)]
    pub struct FocusedWindow(CFType);

    // The retained AX reference is an immutable identity. It is only compared through
    // CFEqual and released, and access to an active recording's identity is serialized.
    unsafe impl Send for FocusedWindow {}

    impl FocusedWindow {
        pub fn for_process(process: u32) -> Option<Self> {
            // A synchronous AX request to our own UI can wait on this same main thread.
            if process == std::process::id() {
                return None;
            }

            let application = unsafe { AXUIElementCreateApplication(process as i32) };
            if application.is_null() {
                return None;
            }
            let application = unsafe { CFType::wrap_under_create_rule(application) };
            let attribute = CFString::from_static_string("AXFocusedWindow");
            let mut window = std::ptr::null();

            // Bound requests when an app's Accessibility server is slow or unresponsive.
            if unsafe { AXUIElementSetMessagingTimeout(application.as_CFTypeRef(), 0.1) } != 0 {
                return None;
            }
            let status = unsafe {
                AXUIElementCopyAttributeValue(
                    application.as_CFTypeRef(),
                    attribute.as_concrete_TypeRef(),
                    &mut window,
                )
            };
            if status != 0 || window.is_null() {
                return None;
            }
            let window = unsafe { CFType::wrap_under_create_rule(window) };
            if window.type_of() != unsafe { AXUIElementGetTypeID() } {
                return None;
            }
            Some(Self(window))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EDITOR: ForegroundTarget = ForegroundTarget {
        process: 1,
        window: Some(WindowIdentity::NativeHandle(2)),
    };
    const OTHER_WINDOW: ForegroundTarget = ForegroundTarget {
        process: 1,
        window: Some(WindowIdentity::NativeHandle(3)),
    };

    #[test]
    fn switching_windows_invalidates_the_session() {
        let mut input = LiveVoiceInput::default();
        input.begin(1, Some(EDITOR)).unwrap();
        assert_eq!(input.verify(1, Some(EDITOR)), Ok(()));
        assert_eq!(input.verify(1, Some(OTHER_WINDOW)), Err(TARGET_CHANGED));
        assert_eq!(input.verify(1, Some(EDITOR)), Err(CANCELLED));
    }

    #[test]
    fn losing_a_known_focused_window_invalidates_the_session() {
        let mut input = LiveVoiceInput::default();
        input.begin(1, Some(EDITOR)).unwrap();
        let no_window = ForegroundTarget {
            process: EDITOR.process,
            window: None,
        };
        assert_eq!(input.verify(1, Some(no_window)), Err(TARGET_CHANGED));
    }

    #[test]
    fn ending_an_old_session_does_not_end_the_current_one() {
        let mut input = LiveVoiceInput::default();
        input.begin(1, Some(EDITOR)).unwrap();
        input.begin(2, Some(OTHER_WINDOW)).unwrap();
        input.end(1);
        assert_eq!(input.verify(1, Some(OTHER_WINDOW)), Err(CANCELLED));
        assert_eq!(input.verify(2, Some(OTHER_WINDOW)), Ok(()));
        input.end(2);
        assert_eq!(input.verify(2, Some(OTHER_WINDOW)), Err(CANCELLED));
    }

    #[test]
    fn cancelling_disables_following_pastes() {
        let mut input = LiveVoiceInput::default();
        input.begin(1, Some(EDITOR)).unwrap();
        input.cancel();
        assert_eq!(input.verify(1, Some(EDITOR)), Err(CANCELLED));
    }

    #[test]
    fn requires_a_foreground_target_at_start() {
        let mut input = LiveVoiceInput::default();
        assert_eq!(input.begin(1, None), Err(TARGET_CHANGED));
        assert_eq!(input.verify(1, Some(EDITOR)), Err(CANCELLED));
    }
}
