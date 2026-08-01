use crate::paths::logs_dir;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU8, Ordering};

/// 从前端接收日志消息
#[tauri::command]
pub fn log_from_frontend(level: String, message: String) -> Result<(), String> {
    match level.as_str() {
        "trace" => log::trace!("{}", message),
        "debug" => log::debug!("{}", message),
        "info" => log::info!("{}", message),
        "warn" => log::warn!("{}", message),
        "error" => log::error!("{}", message),
        _ => log::info!("[{}] {}", level, message),
    }
    Ok(())
}

/// 日志级别枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Trace = 1,
    Debug = 2,
    Info = 3,
    Warn = 4,
    Error = 5,
}

impl Default for LogLevel {
    fn default() -> Self {
        LogLevel::Debug
    }
}

impl LogLevel {
    /// 从字符串解析日志级别
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "trace" => Some(LogLevel::Trace),
            "debug" => Some(LogLevel::Debug),
            "info" => Some(LogLevel::Info),
            "warn" => Some(LogLevel::Warn),
            "error" => Some(LogLevel::Error),
            _ => None,
        }
    }

    /// 转换为 log::LevelFilter
    pub fn to_level_filter(self) -> log::LevelFilter {
        match self {
            LogLevel::Trace => log::LevelFilter::Trace,
            LogLevel::Debug => log::LevelFilter::Debug,
            LogLevel::Info => log::LevelFilter::Info,
            LogLevel::Warn => log::LevelFilter::Warn,
            LogLevel::Error => log::LevelFilter::Error,
        }
    }
}

/// 从 u8 转换为 log::LevelFilter
pub fn level_filter_from_u8(level: u8) -> log::LevelFilter {
    match level {
        1 => log::LevelFilter::Trace,
        2 => log::LevelFilter::Debug,
        3 => log::LevelFilter::Info,
        4 => log::LevelFilter::Warn,
        5 => log::LevelFilter::Error,
        _ => log::LevelFilter::Debug,
    }
}

/// 全局原子变量存储文件日志级别
pub static FILE_LOG_LEVEL: AtomicU8 = AtomicU8::new(log::LevelFilter::Debug as u8);

/// 获取当前日志目录路径
#[tauri::command]
pub fn get_log_dir_path() -> Result<String, String> {
    let log_dir = logs_dir()?;
    Ok(log_dir.to_string_lossy().to_string())
}

/// 在文件管理器中打开日志目录
#[tauri::command]
pub fn open_log_dir() -> Result<(), String> {
    let log_dir = logs_dir()?;

    // 在文件管理器中打开
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&log_dir)
            .spawn()
            .map_err(|e| format!("Failed to open log directory: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&log_dir)
            .spawn()
            .map_err(|e| format!("Failed to open log directory: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&log_dir)
            .spawn()
            .map_err(|e| format!("Failed to open log directory: {}", e))?;
    }

    Ok(())
}

/// 获取当前日志级别
#[tauri::command]
pub fn get_log_level() -> String {
    let level = FILE_LOG_LEVEL.load(Ordering::Relaxed);
    match level {
        1 => "trace".to_string(),
        2 => "debug".to_string(),
        3 => "info".to_string(),
        4 => "warn".to_string(),
        5 => "error".to_string(),
        _ => "debug".to_string(),
    }
}

/// 设置日志级别
#[tauri::command]
pub fn set_log_level(level: String) -> Result<(), String> {
    let log_level =
        LogLevel::from_str(&level).ok_or_else(|| format!("Invalid log level: {}", level))?;

    // 更新全局原子变量（立即生效）
    FILE_LOG_LEVEL.store(log_level.to_level_filter() as u8, Ordering::Relaxed);

    log::info!("[set_log_level] Log level changed to: {:?}", log_level);

    // 持久化到配置文件
    let config_path = crate::config::get_config_path()?;
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        let mut config: serde_json::Value =
            serde_json::from_str(&content).unwrap_or(serde_json::json!({}));

        config["log_level"] = serde_json::json!(level);
        let updated = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        std::fs::write(&config_path, updated)
            .map_err(|e| format!("Failed to write config: {}", e))?;
    }

    Ok(())
}
