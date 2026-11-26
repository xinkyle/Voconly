//! Delivery status describes what is known about the target, not just SendInput's return code.
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InputStatus {
    Confirmed,
    Submitted,
    NotSubmitted,
    Uncertain,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputOutcome {
    pub status: InputStatus,
    pub method: &'static str,
    pub reason: Option<String>,
    pub clipboard_available: bool,
}

impl InputOutcome {
    pub fn new(
        status: InputStatus,
        method: &'static str,
        reason: Option<String>,
        clipboard_available: bool,
    ) -> Self {
        Self {
            status,
            method,
            reason,
            clipboard_available,
        }
    }
}

#[cfg(windows)]
pub mod windows;
