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
//!
//! 签名检测：
//! - ad-hoc 签名的应用每次构建签名都会变化
//! - 签名变化后，旧的授权条目失效，需要清理
//! - 通过对比存储的签名和当前签名，判断是否需要清理

use std::path::PathBuf;
use std::fs;

/// 获取应用配置目录（用于存储签名文件）
fn get_signature_file_path() -> Option<PathBuf> {
    // 使用应用数据目录
    let home = std::env::var("HOME").ok()?;
    let config_dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("Voconly");

    // 确保目录存在
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).ok()?;
    }

    Some(config_dir.join("app_signature.txt"))
}

/// 获取当前应用的签名标识（CDHash）
/// 使用 codesign 命令获取签名信息
#[cfg(target_os = "macos")]
fn get_current_signature() -> Option<String> {
    // 获取当前应用的路径
    let app_path = std::env::current_exe().ok()?;

    // 获取 .app 包路径（从 MacOS/Voconly 回退到 .app）
    let app_bundle_path = app_path
        .ancestors()
        .find(|p| p.extension().map(|e| e == "app").unwrap_or(false))?
        .to_path_buf();

    log::info!("[Signature] Checking signature for: {:?}", app_bundle_path);

    // 执行 codesign 命令获取签名信息
    let output = std::process::Command::new("/usr/bin/codesign")
        .args(["-dv", &app_bundle_path.to_string_lossy()])
        .output()
        .ok()?;

    // 解析输出，提取 CDHash 或 Identifier
    let output_str = String::from_utf8_lossy(&output.stderr);
    log::info!("[Signature] codesign output:\n{}", output_str);

    // 尝试提取 CDHash（更精确的签名标识）
    for line in output_str.lines() {
        if line.starts_with("CDHash=") {
            log::info!("[Signature] Found CDHash: {}", line);
            return Some(line.to_string());
        }
    }

    // 如果没有 CDHash，尝试提取 Identifier
    for line in output_str.lines() {
        if line.starts_with("Identifier=") {
            log::info!("[Signature] No CDHash found, using Identifier: {}", line);
            return Some(line.to_string());
        }
    }

    log::warn!("[Signature] No CDHash or Identifier found in codesign output");
    None
}

/// 非 macOS 平台没有签名检测
#[cfg(not(target_os = "macos"))]
fn get_current_signature() -> Option<String> {
    None
}

/// 读取存储的签名
fn get_stored_signature() -> Option<String> {
    let path = get_signature_file_path()?;
    let signature = fs::read_to_string(&path).ok();
    if let Some(ref sig) = signature {
        log::info!("[Signature] Stored signature from {:?}: {}", path, sig);
    } else {
        log::info!("[Signature] No stored signature found at {:?}", path);
    }
    signature
}

/// 保存当前签名
fn save_signature(signature: &str) -> Option<()> {
    let path = get_signature_file_path()?;
    fs::write(path, signature).ok()
}

/// 清理旧的授权条目
#[cfg(target_os = "macos")]
fn clear_old_permissions() {
    // 获取应用标识符
    let identifier = get_app_identifier();

    // 清理输入监控权限
    reset_tcc_service("ListenEvent", &identifier);

    // 清理辅助功能权限
    reset_tcc_service("Accessibility", &identifier);

    log::info!("[Signature] Cleared old permissions for: {}", identifier);
}

/// 非 macOS 平台无需清理
#[cfg(not(target_os = "macos"))]
fn clear_old_permissions() {}

/// 获取应用标识符（用于 tccutil）
/// 从 Info.plist 读取真实的 Bundle Identifier
#[cfg(target_os = "macos")]
fn get_app_identifier() -> String {
    // 获取当前应用的路径
    if let Some(app_path) = std::env::current_exe()
        .ok()
        .and_then(|p| {
            p.ancestors()
                .find(|p| p.extension().map(|e| e == "app").unwrap_or(false))
                .map(|p| p.to_path_buf())
        })
    {
        // 从 Info.plist 读取 CFBundleIdentifier
        let info_plist_path = app_path.join("Contents").join("Info.plist");
        log::info!("[Signature] Looking for Info.plist at: {:?}", info_plist_path);

        if info_plist_path.exists() {
            // 使用 plutil 命令解析 plist
            if let Ok(output) = std::process::Command::new("/usr/bin/plutil")
                .args(["-extract", "CFBundleIdentifier", "raw", &info_plist_path.to_string_lossy()])
                .output()
            {
                let bundle_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !bundle_id.is_empty() {
                    log::info!("[Signature] Bundle ID from Info.plist: {}", bundle_id);
                    return bundle_id;
                }
            }
        }

        // 如果读取失败，从 .app 路径提取应用名称作为后备
        if let Some(name) = app_path.file_stem() {
            let fallback_id = format!("com.{}", name.to_string_lossy());
            log::info!("[Signature] Using fallback Bundle ID from app name: {}", fallback_id);
            return fallback_id;
        }
    }

    // 默认使用 voconly.desktop（与 tauri.conf.json 保持一致）
    log::info!("[Signature] Using default Bundle ID: com.voconly.desktop");
    "com.voconly.desktop".to_string()
}

/// 检查签名是否变化，如果变化则清理旧授权条目
/// 返回 true 表示签名变化（已执行清理）
/// 返回 false 表示签名未变化
#[cfg(target_os = "macos")]
pub fn check_signature_changed() -> bool {
    // 获取当前签名
    let current_sig = match get_current_signature() {
        Some(sig) => sig,
        None => {
            // 获取签名失败，按保守策略处理（不清理）
            log::warn!("[Signature] Failed to get current signature, skip clearing");
            return false;
        }
    };

    // 读取存储的签名
    let stored_sig = get_stored_signature();

    // 判断是否变化
    let changed = match &stored_sig {
        Some(stored) => {
            // 有历史签名，对比是否变化
            log::info!("[Signature] Comparing signatures:\n  Stored: {}\n  Current: {}", stored, current_sig);
            stored != &current_sig
        }
        None => {
            // 无历史签名（新安装），视为"变化"，执行清理
            // 这是安全的，因为新安装没有旧授权需要清理
            // 但可以确保签名文件被创建
            log::info!("[Signature] No stored signature, treating as changed");
            true
        }
    };

    if changed {
        log::info!("[Signature] Signature changed: {} -> {}",
            stored_sig.as_deref().unwrap_or("(none)"),
            current_sig
        );

        // 清理旧的授权条目
        clear_old_permissions();

        // 保存当前签名
        if save_signature(&current_sig).is_none() {
            log::error!("[Signature] Failed to save signature");
        }

        true
    } else {
        log::info!("[Signature] Signature unchanged: {}", current_sig);

        // 即使签名未变化，也检查授权状态
        // 如果辅助功能未授权，可能是之前用错误的 Bundle ID 清理失败
        if !ax_is_trusted(false) {
            log::info!("[Signature] Accessibility not granted, attempting to clear stale entries");
            clear_old_permissions();
        }

        false
    }
}

/// 非 macOS 平台签名永远不会变化
#[cfg(not(target_os = "macos"))]
pub fn check_signature_changed() -> bool {
    false
}

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
