//! 应用更新模块
//! 支持从远程服务器检查版本、下载安装包并安装

use crate::paths::{cache_dir, resolve_path};
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

/// 下载取消标志
static DOWNLOAD_CANCELLED: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

/// 远程版本信息
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

/// 检查版本更新（Tauri Command）
#[tauri::command]
pub async fn check_for_updates(
    version_url: Option<String>,
) -> Result<Option<RemoteVersionInfo>, String> {
    info!("Checking for updates...");

    let url = version_url.unwrap_or(DEFAULT_VERSION_URL.to_string());

    // 发送 HTTP 请求获取版本信息
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch version info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let version_info: RemoteVersionInfo = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse version info: {}", e))?;

    let current_version = get_current_version();
    info!(
        "Current version: {}, Remote version: {}",
        current_version, version_info.version
    );

    // 更新检查状态
    let mut state = load_update_state().unwrap_or_default();
    state.last_check_date = get_today_date_string();
    state.last_version_checked = version_info.version.clone();
    save_update_state(&state)?;

    // 比较版本
    if is_newer_version(&current_version, &version_info.version) {
        info!("New version available: {}", version_info.version);
        Ok(Some(version_info))
    } else {
        info!("Already on latest version");
        Ok(None)
    }
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

/// 获取下载目录路径
fn get_download_dir() -> Result<PathBuf, String> {
    cache_dir().map(|p| p.join("updates"))
}

/// 取消下载（Tauri Command）
#[tauri::command]
pub fn cancel_download() -> Result<(), String> {
    DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
    info!("Download cancelled by user");
    Ok(())
}

/// 下载更新（Tauri Command）
/// 返回下载文件的完整路径
#[tauri::command]
pub async fn download_update(
    download_url: String,
    file_name: String,
    expected_size: u64,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    info!("Starting download: {} from {}", file_name, download_url);

    // 重置取消标志
    DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);

    // 确保下载目录存在
    let download_dir = get_download_dir()?;
    ensure_parent_dir_exists(&download_dir)?;

    // Sanitize file name to prevent path traversal
    let safe_file_name = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid file name")?;
    let file_path = download_dir.join(safe_file_name);

    // 创建 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5分钟超时
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // 发送请求
    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // 获取实际文件大小
    let total_size = response.content_length().unwrap_or(expected_size);
    info!("Download size: {} bytes", total_size);

    // 创建文件
    let mut file =
        fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;

    // 流式下载
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        // 检查是否取消
        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            info!("Download cancelled, cleaning up...");
            fs::remove_file(&file_path).ok();
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;

        // 写入文件
        use std::io::Write;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

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

    // 校验文件大小
    let actual_size = fs::metadata(&file_path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to get file size: {}", e))?;

    if actual_size != expected_size && expected_size > 0 {
        warn!(
            "File size mismatch: expected {}, got {}",
            expected_size, actual_size
        );
        // 不删除文件，让用户决定是否继续
    }

    info!("Download complete: {}", file_path.display());

    // 更新状态
    let mut state = load_update_state().unwrap_or_default();
    state.downloaded_file = Some(file_path.to_string_lossy().to_string());
    state.download_complete = true;
    save_update_state(&state)?;

    Ok(file_path.to_string_lossy().to_string())
}

/// 安装更新（Tauri Command）
#[tauri::command]
pub fn install_update(file_path: String) -> Result<(), String> {
    info!("Installing update from: {}", file_path);

    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Windows: 静默安装升级（参考 Tauri 内置 updater 的方式）
    // /P = Passive mode：显示进度条，无用户交互，自动关闭
    // /UPDATE = Update mode：跳过卸载旧版本的对话框，直接覆盖安装，保留快捷方式
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        info!("Launching installer in passive update mode...");
        info!("File path: {}", path.display());
        info!("Arguments: /P /UPDATE");

        let spawn_result = Command::new(&path)
            .arg("/P") // Passive mode：有进度条，无交互
            .arg("/UPDATE") // Update mode：直接覆盖安装
            .spawn();

        match spawn_result {
            Ok(_) => info!("Installer launched successfully with /P /UPDATE"),
            Err(e) => {
                warn!("Failed to launch installer: {}", e);
                return Err(format!("Failed to launch installer: {}", e));
            }
        }

        // 清理更新状态
        let mut state = load_update_state().unwrap_or_default();
        state.downloaded_file = None;
        state.download_complete = false;
        save_update_state(&state)?;

        info!("Update state cleaned up, installer should be running now");
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Installation not supported on this platform".to_string())
    }
}

/// 清理已下载的安装包（Tauri Command）
#[tauri::command]
pub fn cleanup_downloaded_update() -> Result<(), String> {
    let state = load_update_state().unwrap_or_default();

    if let Some(file_path) = &state.downloaded_file {
        let path = PathBuf::from(file_path);
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))?;
            info!("Cleaned up downloaded update: {}", file_path);
        }
    }

    // 重置状态
    let mut state = state;
    state.downloaded_file = None;
    state.download_complete = false;
    save_update_state(&state)?;

    Ok(())
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

    info!("[ExitApp] 所有资源清理完成，退出应用");
    app_handle.exit(0);
}
