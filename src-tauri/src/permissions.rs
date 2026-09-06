//! macOS 辅助功能（Accessibility）与输入监控（Input Monitoring）权限检查与自愈
//!
//! 背景：
//! - 全局键盘监听（keyhook 的 CGEventTap）需要「输入监控」权限；
//!   向其他应用模拟 ⌘V 粘贴（enigo / CGEventPost）需要「辅助功能」权限。
//! - TCC 按应用签名身份记忆授权：ad-hoc 签名的应用每次构建指纹都不同，
//!   旧版本的授权对新版本无效，残留条目还会让系统设置里的开关"看起来已打开"。
//! - 这里提供静默检查、以及"清理失效条目 + 触发系统重新注册"的自愈能力：
//!   用户在系统设置里只需要拨动一次开关，无需手动删除再重新添加。
//!
//! 注意：两个权限是独立的，需要分别授权！

/// 静默检查当前进程是否被信任为辅助功能（Accessibility）客户端。
/// `prompt` 为 true 时，未授权会弹出系统引导窗，并把当前二进制注册进
/// 系统设置 → 隐私与安全性 → 辅助功能 列表（开关关闭状态）。
#[cfg(target_os = "macos")]
pub fn ax_is_trusted(prompt: bool) -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
        static kAXTrustedCheckOptionPrompt: CFStringRef;
    }

    let key = unsafe { CFString::wrap_under_create_rule(kAXTrustedCheckOptionPrompt) };
    let value = if prompt {
        CFBoolean::true_value()
    } else {
        CFBoolean::false_value()
    };
    let options = CFDictionary::from_CFType_pairs(&[(key, value)]);
    unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) }
}

/// 检查输入监控权限：尝试创建一个临时的 CGEventTap，成功则说明有权限。
/// 注意：这个检查可能会触发系统授权弹窗，所以只在用户主动点击"授权"时调用。
#[cfg(target_os = "macos")]
pub fn check_input_monitoring() -> bool {
    use core_graphics::event::{
        CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    };

    // 尝试创建一个临时的 listen-only tap
    let result = CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        vec![CGEventType::KeyDown],
        |_proxy, _type, event| Some(event.to_owned()),
    );

    match result {
        Ok(tap) => {
            // 有权限，立即销毁 tap
            drop(tap);
            true
        }
        Err(_) => false,
    }
}

/// 通过官方 tccutil 清理指定服务的授权条目（无需管理员权限）。
/// 只允许在确认当前未被信任时调用，避免误伤正常的授权。
#[cfg(target_os = "macos")]
pub fn reset_tcc_service(service: &str, identifier: &str) {
    match std::process::Command::new("/usr/bin/tccutil")
        .args(["reset", service, identifier])
        .status()
    {
        Ok(status) => log::info!(
            "[Permissions] tccutil reset {} {} -> {}",
            service,
            identifier,
            if status.success() { "ok" } else { "failed" }
        ),
        Err(e) => log::error!("[Permissions] Failed to run tccutil: {}", e),
    }
}

/// 请求辅助功能权限（用户点击"去授权"时调用）：
/// 1. 已授权 → 直接返回 true，不做任何事；
/// 2. 未授权 → 清理失效的辅助功能条目，再以 prompt 模式触发系统注册。
/// 返回调用时刻的授权状态（通常为 false，用户在系统设置里打开开关后，
/// 由前端在窗口聚焦时重新检查确认）。
///
/// 注意：不再重置 ListenEvent，避免影响输入监控的授权状态。
#[cfg(target_os = "macos")]
pub fn request_accessibility(identifier: &str) -> bool {
    if ax_is_trusted(false) {
        return true;
    }

    // 只重置辅助功能条目
    reset_tcc_service("Accessibility", identifier);

    // 直接调用 ax_is_trusted(true)，不需要 DispatchQueue::main()
    // AXIsProcessTrustedWithOptions 本身是线程安全的
    ax_is_trusted(true);

    ax_is_trusted(false)
}

/// 请求输入监控权限（用户点击"去授权"时调用）：
/// 1. 清理失效的输入监控条目
/// 2. 尝试创建 tap 触发系统授权引导
/// 返回调用时刻的授权状态。
#[cfg(target_os = "macos")]
pub fn request_input_monitoring(identifier: &str) -> bool {
    // 先检查辅助功能权限，如果没有则提示用户先授权辅助功能
    if !ax_is_trusted(false) {
        log::warn!("[Permissions] Accessibility not granted, cannot request input monitoring");
        return false;
    }

    // 检查是否已有输入监控权限
    if check_input_monitoring() {
        return true;
    }

    // 重置输入监控条目
    reset_tcc_service("ListenEvent", identifier);

    // 再次尝试创建 tap，这会触发系统授权弹窗
    check_input_monitoring()
}

/// 非 macOS 平台没有 TCC 权限体系，恒为已授权
#[cfg(not(target_os = "macos"))]
pub fn ax_is_trusted(_prompt: bool) -> bool {
    true
}

/// 非 macOS 平台无需授权动作
#[cfg(not(target_os = "macos"))]
pub fn request_accessibility(_identifier: &str) -> bool {
    true
}

/// 非 macOS 平台恒为已授权
#[cfg(not(target_os = "macos"))]
pub fn check_input_monitoring() -> bool {
    true
}

/// 非 macOS 平台无需授权动作
#[cfg(not(target_os = "macos"))]
pub fn request_input_monitoring(_identifier: &str) -> bool {
    true
}

/// 非 macOS 平台无需重置
#[cfg(not(target_os = "macos"))]
pub fn reset_tcc_service(_service: &str, _identifier: &str) {}
