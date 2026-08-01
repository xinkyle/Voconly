// src-tauri/src/paths.rs
//! 统一路径管理模块
//! 所有文件路径通过此模块管理，一处修改产品名即可全局切换

use std::path::PathBuf;

/// 应用根目录名称 - 统一入口
pub const APP_ROOT_NAME: &str = "Voconly";

/// Application 子目录名称 - 存放安装包分发的文件
pub const APPLICATION_DIR_NAME: &str = "Application";

/// User Data 子目录名称 - 存放用户运行时数据
pub const USER_DATA_DIR_NAME: &str = "User Data";

/// 获取应用根目录 (%LOCALAPPDATA%\Voconly)
pub fn app_root() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .ok_or_else(|| "无法获取 Local 数据目录".to_string())
        .map(|p| p.join(APP_ROOT_NAME))
}

/// 获取 Application 目录 (%LOCALAPPDATA%\Voconly\Application)
/// 存放安装包分发的文件：exe、python、resources、WebView
pub fn application_dir() -> Result<PathBuf, String> {
    app_root().map(|p| p.join(APPLICATION_DIR_NAME))
}

/// 获取 User Data 目录 (%LOCALAPPDATA%\Voconly\User Data)
/// 存放用户运行时数据：config、models、logs 等
pub fn user_data_dir() -> Result<PathBuf, String> {
    let path = app_root()?.join(USER_DATA_DIR_NAME);
    ensure_dir(&path)?;
    Ok(path)
}

/// 获取内置资源目录 (%LOCALAPPDATA%\Voconly\Application)
/// 用于存放打包内置资源：dll、onnx 模型等
pub fn bundle_resource_dir() -> Result<PathBuf, String> {
    application_dir()
}

/// 获取内置资源文件路径（带多路径搜索）
/// 搜索顺序：
/// 1. 开发模式：项目源目录 src-tauri/resources/...
/// 2. 安装模式：Application/resources/...
/// 3. Portable：exe 同级目录
/// 例如: "resources/models/silero_vad.onnx"
pub fn resolve_resource_path(relative_path: &str) -> Result<PathBuf, String> {
    use std::env;

    let candidates = [
        // 1. Development: relative to cwd (src-tauri/)
        PathBuf::from(relative_path),
        // 2. Installed: Application directory
        application_dir()
            .map(|d| d.join(relative_path))
            .unwrap_or_default(),
        // 3. Portable: next to executable
        env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.join(relative_path)))
            .unwrap_or_default(),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    // Default fallback: try Application directory
    application_dir()
        .map(|d| d.join(relative_path))
        .map_err(|_| format!("Resource not found: {}", relative_path))
}

/// 确保目录存在
pub fn ensure_dir(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    Ok(())
}

/// 获取模型存储目录 (User Data\models)
pub fn models_dir() -> Result<PathBuf, String> {
    let path = user_data_dir()?.join("models");
    ensure_dir(&path)?;
    Ok(path)
}

/// 获取配置目录 (User Data)
pub fn config_dir() -> Result<PathBuf, String> {
    user_data_dir()
}

/// 获取配置文件路径 (User Data\config.json)
pub fn config_file_path() -> Result<PathBuf, String> {
    Ok(user_data_dir()?.join("config.json"))
}

/// 获取历史记录文件路径 (User Data\history.json)
pub fn history_file_path() -> Result<PathBuf, String> {
    Ok(user_data_dir()?.join("history.json"))
}

/// 获取归档目录 (User Data\archive)
pub fn archive_dir() -> Result<PathBuf, String> {
    let path = user_data_dir()?.join("archive");
    ensure_dir(&path)?;
    Ok(path)
}

/// 获取临时文件目录 (User Data\tmp)
pub fn tmp_dir() -> Result<PathBuf, String> {
    let path = user_data_dir()?.join("tmp");
    ensure_dir(&path)?;
    Ok(path)
}

/// 获取日志目录 (User Data\logs)
pub fn logs_dir() -> Result<PathBuf, String> {
    let path = user_data_dir()?.join("logs");
    ensure_dir(&path)?;
    Ok(path)
}

/// 获取 LLM 模型存储目录 (User Data\llm_models)
pub fn llm_models_dir() -> Result<PathBuf, String> {
    let path = user_data_dir()?.join("llm_models");
    ensure_dir(&path)?;
    Ok(path)
}

/// 获取崩溃报告目录 (User Data\crash_reports)
pub fn crash_reports_dir() -> Result<PathBuf, String> {
    let path = user_data_dir()?.join("crash_reports");
    ensure_dir(&path)?;
    Ok(path)
}

/// 获取统计数据文件路径 (User Data\stats.json)
pub fn stats_file_path() -> Result<PathBuf, String> {
    Ok(user_data_dir()?.join("stats.json"))
}

/// 获取历史记录数据库路径 (User Data\history.db)
pub fn history_db_path() -> Result<PathBuf, String> {
    Ok(user_data_dir()?.join("history.db"))
}

/// 获取最后一次录音文件路径 (User Data/last_recording.wav)
/// 用于保存最近一次录音的完整音频，便于出问题时重新转录排查
pub fn last_recording_path() -> Result<PathBuf, String> {
    Ok(user_data_dir()?.join("last_recording.wav"))
}

/// 获取缓存目录 (User Data\cache)
pub fn cache_dir() -> Result<PathBuf, String> {
    let path = user_data_dir()?.join("cache");
    ensure_dir(&path)?;
    Ok(path)
}

/// 将相对路径转换为完整路径（带安全验证）
/// 验证路径不会逃逸出用户数据目录
/// 例如: "models/qwen3-asr-0.6-q4.gguf" → "Voconly\User Data\models\qwen3-asr-0.6-q4.gguf"
pub fn resolve_path(relative_path: &str) -> Result<PathBuf, String> {
    let root = user_data_dir()?;

    // 安全检查：不允许绝对路径和路径遍历
    if relative_path.starts_with('/') || relative_path.starts_with('\\') {
        return Err("不允许使用绝对路径".to_string());
    }

    // 正确的 Windows 驱动器路径检查（如 C:\、D:\）
    if relative_path.len() >= 2 && relative_path.chars().nth(1) == Some(':') {
        return Err("不允许使用绝对路径".to_string());
    }

    // 检查路径遍历攻击
    if relative_path.contains("..") {
        return Err("路径不允许包含父目录引用".to_string());
    }

    // 构建完整路径
    let full_path = root.join(relative_path);

    Ok(full_path)
}
