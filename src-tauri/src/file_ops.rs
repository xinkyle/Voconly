// src-tauri/src/file_ops.rs
//! 统一文件操作 API
//! 前端通过这些命令操作文件，只需提供相对路径

use crate::paths::{ensure_dir, resolve_path};
use std::fs;

/// 读取文件内容（文本）
#[tauri::command]
pub fn read_text_file(relative_path: String) -> Result<String, String> {
    let full_path = resolve_path(&relative_path)?;
    if !full_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }
    fs::read_to_string(&full_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入文件内容（文本）
#[tauri::command]
pub fn write_text_file(relative_path: String, content: String) -> Result<(), String> {
    let full_path = resolve_path(&relative_path)?;
    if let Some(parent) = full_path.parent() {
        ensure_dir(&parent.to_path_buf())?;
    }
    fs::write(&full_path, content).map_err(|e| format!("写入文件失败: {}", e))
}

/// 读取文件内容（二进制）
#[tauri::command]
pub fn read_binary_file(relative_path: String) -> Result<Vec<u8>, String> {
    let full_path = resolve_path(&relative_path)?;
    if !full_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }
    fs::read(&full_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入文件内容（二进制）
#[tauri::command]
pub fn write_binary_file(relative_path: String, data: Vec<u8>) -> Result<(), String> {
    let full_path = resolve_path(&relative_path)?;
    if let Some(parent) = full_path.parent() {
        ensure_dir(&parent.to_path_buf())?;
    }
    fs::write(&full_path, data).map_err(|e| format!("写入文件失败: {}", e))
}

/// 检查文件是否存在
#[tauri::command]
pub fn file_exists(relative_path: String) -> Result<bool, String> {
    let full_path = resolve_path(&relative_path)?;
    Ok(full_path.exists())
}

/// 删除文件
#[tauri::command]
pub fn delete_file(relative_path: String) -> Result<(), String> {
    let full_path = resolve_path(&relative_path)?;
    if full_path.exists() {
        fs::remove_file(&full_path).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

/// 创建目录
#[tauri::command]
pub fn create_dir(relative_path: String) -> Result<(), String> {
    let full_path = resolve_path(&relative_path)?;
    ensure_dir(&full_path)?;
    Ok(())
}

/// 删除目录（递归）
#[tauri::command]
pub fn delete_dir(relative_path: String) -> Result<(), String> {
    let full_path = resolve_path(&relative_path)?;
    if full_path.exists() && full_path.is_dir() {
        fs::remove_dir_all(&full_path).map_err(|e| format!("删除目录失败: {}", e))?;
    }
    Ok(())
}

/// 列出目录内容
#[tauri::command]
pub fn list_dir(relative_path: String) -> Result<Vec<String>, String> {
    let full_path = resolve_path(&relative_path)?;
    if !full_path.exists() {
        return Ok(Vec::new());
    }
    if !full_path.is_dir() {
        return Err(format!("不是目录: {}", relative_path));
    }
    let entries = fs::read_dir(&full_path).map_err(|e| format!("读取目录失败: {}", e))?;
    let names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    Ok(names)
}

/// 获取完整路径（用于前端需要知道完整路径的场景）
#[tauri::command]
pub fn get_full_path(relative_path: String) -> Result<String, String> {
    let full_path = resolve_path(&relative_path)?;
    Ok(full_path.to_string_lossy().to_string())
}

/// 获取应用根目录路径
#[tauri::command]
pub fn get_app_root() -> Result<String, String> {
    let root = crate::paths::app_root()?;
    Ok(root.to_string_lossy().to_string())
}
