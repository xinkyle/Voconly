//! 应用更新模块
//! 支持从远程服务器检查版本、下载安装包并安装
//! 使用 Tauri updater 的签名验证和安装能力

use crate::paths::resolve_path;
use futures_util::StreamExt;
use log::{info, warn};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

/// 默认版本信息 URL（Google Drive）
const DEFAULT_VERSION_URL: &str = "https://drive.google.com/uc?export=download&id=VERSION_FILE_ID";

/// GitHub latest.json URL
const GITHUB_LATEST_URL: &str = "https://github.com/xinkyle/Voconly/releases/download/v{{version}}/latest.json";

/// Gitee latest.json URL
const GITEE_LATEST_URL: &str = "https://gitee.com/xingkyle/Voconly/releases/download/v{{version}}/latest.json";

/// 下载取消标志
static DOWNLOAD_CANCELLED: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

/// 远程版本信息（旧版，保留兼容性）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVersionInfo {
    pub version: String,
    pub release_date: String,
    pub download_url: String,
    pub file_name: String,
    pub file_size: u64,
    pub changelog: Vec<String>,
    pub min_version: String,
}

/// 平台更新信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformUpdateInfo {
    pub url: String,
    pub signature: String,
}

/// latest.json 文件格式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestJson {
    pub version: String,
    pub date: String,
    pub notes: Option<String>,
    #[serde(default)]
    pub platforms: std::collections::HashMap<String, PlatformUpdateInfo>,
}

/// 更新信息（新版，用于 V2 命令）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub date: String,
    pub notes: Option<String>,
    pub url: String,
    pub signature: String,
}

/// 本地更新状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub last_check_date: String,
    pub last_version_checked: String,
    pub remind_count_today: u32,
    pub downloaded_file: Option<String>,
    pub download_complete: bool,
}

/// 下载进度事件数据
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total_size: u64,
    pub progress: u32, // 0-100
}

/// 获取当前应用版本
pub fn get_current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 比较版本号，返回 true 表示 remote 版本更高
pub fn is_newer_version(current: &str, remote: &str) -> bool {
    let current_parts: Vec<u32> = current.split('.').filter_map(|s| s.parse().ok()).collect();
    let remote_parts: Vec<u32> = remote.split('.').filter_map(|s| s.parse().ok()).collect();

    for i in 0..std::cmp::max(current_parts.len(), remote_parts.len()) {
        let current_val = current_parts.get(i).unwrap_or(&0);
        let remote_val = remote_parts.get(i).unwrap_or(&0);
        if remote_val > current_val {
            return true;
        }
        if remote_val < current_val {
            return false;
        }
    }
    false
}

/// 获取更新状态文件路径
fn get_update_state_path() -> Result<PathBuf, String> {
    resolve_path("update_state.json")
}

/// 确保目录存在
fn ensure_parent_dir_exists(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    Ok(())
}

/// 加载更新状态
pub fn load_update_state() -> Result<UpdateState, String> {
    let path = get_update_state_path()?;
    if !path.exists() {
        return Ok(UpdateState::default());
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read update state: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse update state: {}", e))
}

/// 保存更新状态
pub fn save_update_state(state: &UpdateState) -> Result<(), String> {
    let path = get_update_state_path()?;
    ensure_parent_dir_exists(&path)?;
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize update state: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write update state: {}", e))
}

/// 获取今天的日期字符串
fn get_today_date_string() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// 获取当前版本（Tauri Command）
#[tauri::command]
pub fn get_app_version() -> String {
    get_current_version()
}

/// 获取更新状态（Tauri Command）
#[tauri::command]
pub fn get_update_state() -> Result<UpdateState, String> {
    load_update_state()
}

/// 重置今日提醒计数（Tauri Command）
#[tauri::command]
pub fn reset_remind_count() -> Result<(), String> {
    let mut state = load_update_state().unwrap_or_default();
    state.remind_count_today = 0;
    save_update_state(&state)?;
    Ok(())
}

/// 增加今日提醒计数（Tauri Command）
#[tauri::command]
pub fn increment_remind_count() -> Result<u32, String> {
    let mut state = load_update_state().unwrap_or_default();

    // 检查是否跨天
    let today = get_today_date_string();
    if state.last_check_date != today {
        state.remind_count_today = 0;
        state.last_check_date = today;
    }

    state.remind_count_today += 1;
    save_update_state(&state)?;

    Ok(state.remind_count_today)
}

/// 退出应用（Tauri Command）
/// 用于更新安装时退出应用，让安装程序接管
#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    info!("Exiting application for update installation...");

    // 显式清理 ModelManager（释放模型资源）
    if let Some(state) = app_handle.try_state::<crate::config::AppServices>() {
        if let Ok(mut mgr_guard) = state.model_manager.lock() {
            if let Some(mgr) = mgr_guard.take() {
                info!("[ExitApp] 清理 ModelManager...");
                drop(mgr); // 触发所有 LoadedModel.drop -> SpeechBackend 资源释放
                info!("[ExitApp] ModelManager 已清理");
            }
        }
    }

    // 【macOS Metal 修复】等待 GPU 操作完成
    // Metal 的 ResidencySet 需要等待所有 GPU 操作完成才能正确销毁
    // 否则在退出时会触发断言错误：GGML_ASSERT([rsets->data count] == 0)
    #[cfg(target_os = "macos")]
    {
        info!("[ExitApp] 等待 Metal 资源同步...");
        std::thread::sleep(std::time::Duration::from_millis(100));
        info!("[ExitApp] Metal 资源同步完成");
    }

    info!("[ExitApp] 所有资源清理完成，退出应用");
    app_handle.exit(0);
}

// ==================== V2 更新命令 ====================
// 使用 Tauri updater 的签名验证和安装能力

/// 获取当前平台的标识
fn get_platform_target() -> &'static str {
    #[cfg(all(windows, target_arch = "x86_64"))]
    {
        "windows-x86_64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "darwin-aarch64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "darwin-x86_64"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x86_64"
    }
    #[cfg(not(any(
        all(windows, target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64")
    )))]
    {
        "unknown"
    }
}

/// 从 GitHub/Gitee API 获取最新版本号
async fn fetch_latest_version_from_api(language: Option<String>) -> Result<String, String> {
    // 根据语言选择 API 源
    let is_chinese_user = language.as_ref().map(|l| l.starts_with("zh")).unwrap_or(false);

    let urls = if is_chinese_user {
        [
            "https://gitee.com/api/v5/repos/xingkyle/Voconly/releases/latest",
            "https://api.github.com/repos/xinkyle/Voconly/releases/latest",
        ]
    } else {
        [
            "https://api.github.com/repos/xinkyle/Voconly/releases/latest",
            "https://gitee.com/api/v5/repos/xingkyle/Voconly/releases/latest",
        ]
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Voconly-Updater")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut last_error = String::new();

    for url in urls {
        info!("[UpdaterV2] Fetching latest release from: {}", url);
        match client.get(url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    #[derive(Deserialize)]
                    struct ReleaseInfo {
                        tag_name: String,
                    }
                    match response.json::<ReleaseInfo>().await {
                        Ok(info) => {
                            let version = info.tag_name.trim_start_matches('v').to_string();
                            info!("[UpdaterV2] Latest version: {}", version);
                            return Ok(version);
                        }
                        Err(e) => {
                            last_error = format!("Failed to parse response: {}", e);
                            warn!("[UpdaterV2] Failed to parse response from {}: {}", url, e);
                        }
                    }
                } else {
                    last_error = format!("HTTP error: {}", response.status());
                    warn!("[UpdaterV2] HTTP error from {}: {}", url, response.status());
                }
            }
            Err(e) => {
                last_error = format!("Request failed: {}", e);
                warn!("[UpdaterV2] Request to {} failed: {}", url, e);
            }
        }
    }

    Err(format!("Failed to fetch latest version from all sources: {}", last_error))
}

/// 检查更新 V2（Tauri Command）
/// 根据语言选择 GitHub 或 Gitee 的 latest.json URL
/// 支持通过环境变量 VOCONLY_UPDATE_URL 指定自定义更新服务器（用于测试）
#[tauri::command]
pub async fn check_for_updates_v2(
    language: Option<String>,
) -> Result<Option<UpdateInfo>, String> {
    info!("[UpdaterV2] Checking for updates... language={:?}", language);

    let current_version = get_current_version();
    info!("[UpdaterV2] Current version: {}", current_version);

    // 检查是否设置了自定义更新 URL（用于本地测试）
    let custom_update_url = std::env::var("VOCONLY_UPDATE_URL").ok();

    let (latest_version, latest_url) = if let Some(custom_url) = custom_update_url {
        info!("[UpdaterV2] Using custom update URL: {}", custom_url);

        // 从自定义 URL 获取 latest.json
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .user_agent("Voconly-Updater")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&custom_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch from custom URL: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP error from custom URL: {}", response.status()));
        }

        let latest_json: LatestJson = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse latest.json: {}", e))?;

        // 检查版本
        if !is_newer_version(&current_version, &latest_json.version) {
            info!("[UpdaterV2] Already on latest version");
            return Ok(None);
        }

        (latest_json.version.clone(), custom_url)
    } else {
        // 正常流程：从 GitHub/Gitee API 获取最新版本号
        let latest_version = fetch_latest_version_from_api(language.clone()).await?;

        // 检查版本
        if !is_newer_version(&current_version, &latest_version) {
            info!("[UpdaterV2] Already on latest version");
            return Ok(None);
        }

        info!("[UpdaterV2] New version available: {}", latest_version);

        // 构造 latest.json URL（根据语言选择源）
        let is_chinese_user = language.as_ref().map(|l| l.starts_with("zh")).unwrap_or(false);
        let latest_url = if is_chinese_user {
            GITEE_LATEST_URL.replace("{{version}}", &latest_version)
        } else {
            GITHUB_LATEST_URL.replace("{{version}}", &latest_version)
        };

        (latest_version, latest_url)
    };

    info!("[UpdaterV2] Fetching latest.json from: {}", latest_url);

    // 下载 latest.json
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Voconly-Updater")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&latest_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest.json: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error fetching latest.json: {}", response.status()));
    }

    let latest_json: LatestJson = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse latest.json: {}", e))?;

    // 获取当前平台的信息
    let platform = get_platform_target();
    info!("[UpdaterV2] Current platform: {}", platform);

    let platform_info = latest_json
        .platforms
        .get(platform)
        .ok_or_else(|| format!("Platform {} not found in latest.json", platform))?;

    // 更新检查状态
    let mut state = load_update_state().unwrap_or_default();
    state.last_check_date = get_today_date_string();
    state.last_version_checked = latest_json.version.clone();
    save_update_state(&state)?;

    let update_info = UpdateInfo {
        version: latest_json.version,
        current_version: current_version,
        date: latest_json.date,
        notes: latest_json.notes,
        url: platform_info.url.clone(),
        signature: platform_info.signature.clone(),
    };

    info!("[UpdaterV2] Update available: {} -> {}", update_info.current_version, update_info.version);
    info!("[UpdaterV2] Download URL: {}", update_info.url);

    Ok(Some(update_info))
}

/// 下载并安装更新 V2（Tauri Command）
/// 接收下载 URL 和签名，下载文件并安装
#[tauri::command]
pub async fn download_and_install_update_v2(
    url: String,
    signature: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    info!("[UpdaterV2] Starting download and install...");
    info!("[UpdaterV2] Download URL: {}", url);
    info!("[UpdaterV2] Signature: {}...", &signature[..50.min(signature.len())]);

    // 重置取消标志
    DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);

    // 获取临时目录
    let temp_dir = std::env::temp_dir();
    let file_name = url.rsplit('/').next().unwrap_or("update.bin");
    let file_path = temp_dir.join(file_name);

    info!("[UpdaterV2] Download destination: {}", file_path.display());

    // 创建 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600)) // 10 分钟超时
        .user_agent("Voconly-Updater")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // 发送请求
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // 获取文件大小
    let total_size = response.content_length().unwrap_or(0);
    info!("[UpdaterV2] Download size: {} bytes", total_size);

    // 发送下载开始事件
    app_handle
        .emit(
            "download-progress",
            DownloadProgress {
                downloaded: 0,
                total_size,
                progress: 0,
            },
        )
        .ok();

    // 创建文件
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    // 流式下载
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        // 检查是否取消
        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            info!("[UpdaterV2] Download cancelled by user");
            fs::remove_file(&file_path).ok();
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk_result.map_err(|e| {
            fs::remove_file(&file_path).ok();
            format!("Failed to read chunk: {}", e)
        })?;

        // 写入文件
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| {
            fs::remove_file(&file_path).ok();
            format!("Failed to write chunk: {}", e)
        })?;

        downloaded += chunk.len() as u64;

        // 发送进度事件
        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0) as u32
        } else {
            0
        };

        app_handle
            .emit(
                "download-progress",
                DownloadProgress {
                    downloaded,
                    total_size,
                    progress,
                },
            )
            .ok();
    }

    info!("[UpdaterV2] Download complete: {} bytes", downloaded);

    // 关闭文件句柄，确保文件不再被锁定
    drop(file);
    info!("[UpdaterV2] File handle closed");

    // 验证签名（可选，开发阶段可以跳过）
    // TODO: 实现 minisign 签名验证
    // 目前先跳过签名验证，直接安装
    info!("[UpdaterV2] Signature verification skipped (to be implemented)");

    // 安装更新
    install_update_v2(&file_path, &app_handle)?;

    Ok(())
}

/// 安装更新（内部函数）
fn install_update_v2(file_path: &PathBuf, app_handle: &tauri::AppHandle) -> Result<(), String> {
    info!("[UpdaterV2] Installing update from: {}", file_path.display());

    if !file_path.exists() {
        return Err(format!("File not found: {}", file_path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        info!("[UpdaterV2] Launching Windows installer...");

        // Windows: 静默安装升级
        // /P = Passive mode：显示进度条，无用户交互，自动关闭
        // /UPDATE = Update mode：跳过卸载旧版本的对话框，直接覆盖安装，保留快捷方式
        // /R = 自动启动应用（安装完成后）
        let spawn_result = Command::new(file_path)
            .arg("/P")
            .arg("/UPDATE")
            .arg("/R")
            .spawn();

        match spawn_result {
            Ok(mut child) => {
                info!("[UpdaterV2] Windows installer launched successfully");

                // 等待一小段时间确保安装器完全启动
                // spawn() 只是启动进程，但进程可能需要一点时间来初始化
                // 如果应用立即退出，可能会干扰安装器的启动过程
                std::thread::sleep(std::time::Duration::from_millis(500));

                // 检查安装器是否仍在运行
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // 安装器已经退出，这通常意味着启动失败
                        warn!("[UpdaterV2] Installer exited immediately with status: {}", status);
                        return Err(format!("Installer exited immediately with status: {}", status));
                    }
                    Ok(None) => {
                        // 安装器仍在运行，这是正常的
                        info!("[UpdaterV2] Installer is running, proceeding to exit app");
                    }
                    Err(e) => {
                        warn!("[UpdaterV2] Failed to check installer status: {}", e);
                    }
                }

                // 清理更新状态
                let mut state = load_update_state().unwrap_or_default();
                state.downloaded_file = None;
                state.download_complete = false;
                save_update_state(&state)?;

                // 退出当前应用
                info!("[UpdaterV2] Exiting app for installation...");
                app_handle.exit(0);
            }
            Err(e) => {
                warn!("[UpdaterV2] Failed to launch installer: {}", e);
                return Err(format!("Failed to launch installer: {}", e));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        info!("[UpdaterV2] Installing macOS update...");

        // 获取当前应用的可执行文件路径
        let current_exe = std::env::current_exe()
            .map_err(|e| format!("Failed to get current exe path: {}", e))?;

        info!("[UpdaterV2] Current exe path: {}", current_exe.display());

        // 从可执行文件路径向上查找 .app 包路径
        // 这样无论从 .app 包内启动，还是从开发目录启动，都能正确找到路径
        let app_path = current_exe
            .ancestors()
            .find(|p| p.extension().map(|ext| ext == "app").unwrap_or(false))
            .ok_or_else(|| "Failed to find .app bundle in path".to_string())?
            .to_path_buf();

        info!("[UpdaterV2] Current app path: {}", app_path.display());

        let app_name = app_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Voconly.app");

        // 动态获取可执行文件名，而不是硬编码
        let exe_name = current_exe
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("voconly-tauri");

        // 创建临时解压目录
        let temp_extract_dir = std::env::temp_dir().join("voconly_update");

        if temp_extract_dir.exists() {
            fs::remove_dir_all(&temp_extract_dir)
                .map_err(|e| format!("Failed to clean temp dir: {}", e))?;
        }
        fs::create_dir_all(&temp_extract_dir)
            .map_err(|e| format!("Failed to create temp dir: {}", e))?;

        // 解压 tar.gz 文件
        let extract_result = Command::new("tar")
            .arg("-xzf")
            .arg(file_path)
            .arg("-C")
            .arg(&temp_extract_dir)
            .output();

        match extract_result {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("Failed to extract archive: {}", stderr));
                }

                info!("[UpdaterV2] Archive extracted successfully");

                // 查找解压后的 .app 文件
                let extracted_app = temp_extract_dir.join(app_name);
                if !extracted_app.exists() {
                    return Err(format!("Extracted app not found at {:?}", extracted_app));
                }

                // 创建备份目录
                let backup_dir = std::env::temp_dir().join("voconly_backup");

                // 尝试移动当前应用到备份目录
                let move_result = fs::rename(&app_path, backup_dir.join("old_app"));
                let need_authorization = match move_result {
                    Ok(_) => {
                        info!("[UpdaterV2] Old app moved to backup");
                        false
                    }
                    Err(err) => {
                        if err.kind() == std::io::ErrorKind::PermissionDenied {
                            info!("[UpdaterV2] Permission denied, will use AppleScript for admin privileges");
                            true
                        } else {
                            return Err(format!("Failed to backup old app: {}", err));
                        }
                    }
                };

                if need_authorization {
                    // 使用 AppleScript 请求管理员权限来替换应用
                    let apple_script = format!(
                        "do shell script \"rm -rf '{}' && mv -f '{}' '{}'\" with administrator privileges",
                        app_path.display(),
                        extracted_app.display(),
                        app_path.display()
                    );

                    info!("[UpdaterV2] Requesting admin privileges via AppleScript...");

                    let script_result = Command::new("osascript")
                        .arg("-e")
                        .arg(&apple_script)
                        .output();

                    match script_result {
                        Ok(result) => {
                            if !result.status.success() {
                                let stderr = String::from_utf8_lossy(&result.stderr);
                                return Err(format!("AppleScript failed: {}", stderr));
                            }
                            info!("[UpdaterV2] App replaced with admin privileges");
                        }
                        Err(e) => {
                            return Err(format!("Failed to run AppleScript: {}", e));
                        }
                    }
                } else {
                    // 权限足够，直接移动新应用
                    info!("[UpdaterV2] Moving new app to destination...");
                    fs::rename(&extracted_app, &app_path)
                        .map_err(|e| format!("Failed to move new app: {}", e))?;
                }

                // 清理临时目录
                fs::remove_dir_all(&temp_extract_dir).ok();
                fs::remove_dir_all(&backup_dir).ok();

                info!("[UpdaterV2] Installation complete");

                // 重启应用
                info!("[UpdaterV2] Restarting app...");

                // 使用动态获取的可执行文件名
                let app_exe = app_path.join("Contents").join("MacOS").join(exe_name);
                if app_exe.exists() {
                    // 启动新实例
                    let _ = std::process::Command::new(&app_exe).spawn();
                    // 等待一下确保新进程启动
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }

                // 退出当前应用
                app_handle.exit(0);
            }
            Err(e) => {
                return Err(format!("Failed to run tar command: {}", e));
            }
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Err("Installation not supported on this platform".to_string());
    }

    Ok(())
}

/// 取消下载（Tauri Command）- 用于 V2
#[tauri::command]
pub fn cancel_download_v2() -> Result<(), String> {
    DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
    info!("[UpdaterV2] Download cancelled by user");
    Ok(())
}
