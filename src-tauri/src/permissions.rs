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
//!
//! 输入监控权限的检查由 keyhook 插件处理（通过尝试创建 CGEventTap），
//! 本模块只负责辅助功能权限和重置输入监控条目。

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

/// 请求辅助功能权限（用户点击"去授权"时调用）。
/// 清理工作已在 check_accessibility_permission 中完成，这里只负责触发系统弹窗。
/// 返回调用时刻的授权状态。
#[cfg(target_os = "macos")]
pub fn request_accessibility(_identifier: &str) -> bool {
    // 清理工作已在 check_accessibility_permission 中完成
    // 直接触发系统弹窗，把当前应用注册到系统设置列表中
    ax_is_trusted(true);
    ax_is_trusted(false)
}

/// 重置输入监控权限条目（用户点击 keyhook 横幅"去授权"时调用）。
/// 重置后需要调用 keyhook 的 startListen 来触发授权引导。
/// 注意：调用此函数前应先确认辅助功能权限已授权。
#[cfg(target_os = "macos")]
pub fn reset_input_monitoring(identifier: &str) {
    // 先检查辅助功能权限
    if !ax_is_trusted(false) {
        log::warn!("[Permissions] Accessibility not granted, cannot reset input monitoring");
        return;
    }

    reset_tcc_service("ListenEvent", identifier);
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

/// 非 macOS 平台无需重置
#[cfg(not(target_os = "macos"))]
pub fn reset_input_monitoring(_identifier: &str) {}

/// 非 macOS 平台无需重置
#[cfg(not(target_os = "macos"))]
pub fn reset_tcc_service(_service: &str, _identifier: &str) {}
