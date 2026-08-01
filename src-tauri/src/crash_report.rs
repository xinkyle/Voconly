//! Crash report module for capturing and logging native crashes
//!
//! This module provides enhanced crash tracking for the application:
//! - Windows native exception capture via SetUnhandledExceptionFilter
//! - Independent crash report files (not affected by log rotation)
//! - Stack trace and context information

use crate::paths::crash_reports_dir;
use log::{error, info};
use std::fs::{create_dir_all, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use windows::Win32::System::Diagnostics::Debug::{SetUnhandledExceptionFilter, EXCEPTION_POINTERS};

/// Get the crash report directory path
fn get_crash_report_dir() -> Option<PathBuf> {
    crash_reports_dir().ok()
}

/// Generate a timestamp-based filename for crash report
fn generate_crash_filename() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("crash_{}.txt", timestamp)
}

/// Write crash report to file
fn write_crash_report(report_content: &str) {
    let crash_dir = get_crash_report_dir();

    if let Some(dir) = crash_dir {
        // Create directory if not exists
        if let Err(e) = create_dir_all(&dir) {
            error!(
                "[CrashReport] Failed to create crash report directory: {}",
                e
            );
            return;
        }

        let filename = generate_crash_filename();
        let report_path = dir.join(&filename);

        info!("[CrashReport] Writing crash report to: {:?}", report_path);

        if let Err(e) =
            File::create(&report_path).and_then(|mut f| f.write_all(report_content.as_bytes()))
        {
            error!("[CrashReport] Failed to write crash report: {}", e);
        } else {
            info!(
                "[CrashReport] Crash report saved successfully: {}",
                filename
            );
        }
    } else {
        error!("[CrashReport] Could not determine crash report directory");
    }
}

/// Initialize crash report system
pub fn init_crash_reporter() {
    info!("[CrashReport] Initializing crash reporter...");

    // Ensure crash report directory exists
    if let Some(dir) = get_crash_report_dir() {
        if let Err(e) = create_dir_all(&dir) {
            error!(
                "[CrashReport] Failed to create crash report directory: {}",
                e
            );
        } else {
            info!("[CrashReport] Crash report directory: {:?}", dir);
        }
    }

    // Install native exception handler on Windows
    #[cfg(windows)]
    install_exception_filter();

    info!("[CrashReport] Crash reporter initialized");
}

#[cfg(windows)]
/// Windows native exception handler
fn install_exception_filter() {
    unsafe {
        SetUnhandledExceptionFilter(Some(exception_handler));
        info!("[CrashReport] Windows exception filter installed");
    }
}

#[cfg(windows)]
/// Exception handler callback for Windows
unsafe extern "system" fn exception_handler(exception_info: *const EXCEPTION_POINTERS) -> i32 {
    // EXCEPTION_CONTINUE_EXECUTION = -1, EXCEPTION_CONTINUE_SEARCH = 0
    // We want to log and then let other handlers process

    let report_content = generate_windows_exception_report(exception_info);
    write_crash_report(&report_content);

    // Also log to stderr in case file write failed
    eprintln!("\n!!! APPLICATION CRASH !!!\n{}", report_content);

    // Return 0 (EXCEPTION_CONTINUE_SEARCH) to let other handlers process
    0
}

#[cfg(windows)]
/// Generate crash report from Windows exception info
fn generate_windows_exception_report(exception_info: *const EXCEPTION_POINTERS) -> String {
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S");

    let mut report = format!(
        "=== VCONLY CRASH REPORT ===\n\
         Timestamp: {}\n\
         Platform: Windows\n\n",
        timestamp
    );

    unsafe {
        if exception_info.is_null() {
            report.push_str("Exception Info: NULL\n");
        } else {
            let info = &*exception_info;
            let exception_record = &*info.ExceptionRecord;

            // ExceptionCode is NTSTATUS, convert to u32 for display
            let code_value: u32 = exception_record.ExceptionCode.0 as u32;

            report.push_str(&format!(
                "Exception Code: 0x{:08X}\n\
                 Exception Address: 0x{:016X}\n\
                 Exception Flags: 0x{:08X}\n\n",
                code_value,
                exception_record.ExceptionAddress as usize,
                exception_record.ExceptionFlags
            ));

            // Add exception code description
            let exception_desc = describe_exception_code(code_value);
            report.push_str(&format!("Exception Type: {}\n\n", exception_desc));

            // Try to get stack trace (basic)
            if !info.ContextRecord.is_null() {
                let context = &*info.ContextRecord;
                // On x64, get RIP (instruction pointer)
                #[cfg(target_arch = "x86_64")]
                {
                    report.push_str(&format!(
                        "Instruction Pointer (RIP): 0x{:016X}\n\
                         Stack Pointer (RSP): 0x{:016X}\n",
                        context.Rip, context.Rsp
                    ));
                }
                #[cfg(target_arch = "x86")]
                {
                    report.push_str(&format!(
                        "Instruction Pointer (EIP): 0x{:08X}\n\
                         Stack Pointer (ESP): 0x{:08X}\n",
                        context.Eip, context.Esp
                    ));
                }
            }
        }
    }

    report.push_str("\n=== END OF CRASH REPORT ===\n");
    report
}

#[cfg(windows)]
/// Describe Windows exception code in human-readable form
fn describe_exception_code(code: u32) -> &'static str {
    match code {
        0xC0000005 => "ACCESS_VIOLATION - Memory access violation",
        0xC0000094 => "INTEGER_DIVIDE_BY_ZERO",
        0xC0000095 => "INTEGER_OVERFLOW",
        0xC00000FD => "STACK_OVERFLOW",
        0xC000001D => "ILLEGAL_INSTRUCTION",
        0xC0000409 => "STACK_BUFFER_OVERRUN",
        0xC0000417 => "INVALID_HANDLE",
        0xC0000135 => "DLL_NOT_FOUND",
        0xC0000142 => "DLL_INIT_FAILED",
        0xE06D7363 => "CPP_EXCEPTION (throw)",
        _ => "UNKNOWN_EXCEPTION",
    }
}

/// Generate crash report for Rust panic
pub fn generate_panic_report(panic_info: &std::panic::PanicHookInfo<'_>) -> String {
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S");

    let mut report = format!(
        "=== VCONLY PANIC REPORT ===\n\
         Timestamp: {}\n\
         Platform: {}\n\n",
        timestamp,
        if cfg!(windows) { "Windows" } else { "Other" }
    );

    // Panic location
    if let Some(loc) = panic_info.location() {
        report.push_str(&format!(
            "Location: {}:{}:{}\n",
            loc.file(),
            loc.line(),
            loc.column()
        ));
    }

    // Panic message
    if let Some(msg) = panic_info.payload().downcast_ref::<&str>() {
        report.push_str(&format!("Message: {}\n", msg));
    } else if let Some(msg) = panic_info.payload().downcast_ref::<String>() {
        report.push_str(&format!("Message: {}\n", msg));
    } else {
        report.push_str("Message: Unknown panic payload\n");
    }

    // Thread name (if available)
    let thread_name = std::thread::current()
        .name()
        .map(|n| n.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    report.push_str(&format!("Thread: {}\n", thread_name));

    report.push_str("\n=== END OF PANIC REPORT ===\n");
    report
}

/// Enhanced panic hook that writes to crash report file
pub fn enhanced_panic_hook(panic_info: &std::panic::PanicHookInfo<'_>) {
    let report = generate_panic_report(panic_info);

    // Log to error (this goes to log file)
    error!("[CrashReport] Application panicked:\n{}", report);

    // Also write to dedicated crash report file
    write_crash_report(&report);

    // Print to stderr for immediate visibility
    eprintln!("\n!!! APPLICATION PANIC !!!\n{}", report);
}

/// Protected execution wrapper - catches panics and converts to Result
pub fn protected_execute<T, E, F>(f: F, operation_name: &str) -> Result<T, E>
where
    F: FnOnce() -> Result<T, E> + std::panic::UnwindSafe,
    E: std::fmt::Debug + From<String>,
{
    match std::panic::catch_unwind(f) {
        Ok(result) => result,
        Err(panic_payload) => {
            let msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic".to_string()
            };

            error!("[CrashReport] Panic caught in {}: {}", operation_name, msg);

            // Write crash report
            let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S");
            let report = format!(
                "=== VCONLY CRASH REPORT (CAUGHT PANIC) ===\n\
                 Timestamp: {}\n\
                 Operation: {}\n\
                 Message: {}\n\
                 Thread: {}\n\
                 === END OF CRASH REPORT ===\n",
                timestamp,
                operation_name,
                msg,
                std::thread::current().name().unwrap_or("unknown")
            );
            write_crash_report(&report);

            Err(E::from(msg))
        }
    }
}
