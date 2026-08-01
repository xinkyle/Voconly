//! 用户词典 Tauri 命令

use crate::config::AppServices;
use crate::dictionary::{DictionaryEntry, UserDictionary};
use tauri::State;

/// 获取用户词典
#[tauri::command]
pub fn get_user_dictionary(services: State<'_, AppServices>) -> Result<UserDictionary, String> {
    let config = services
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;
    Ok(config.user_dictionary.clone())
}

/// 保存用户词典
#[tauri::command]
pub fn save_user_dictionary(
    services: State<'_, AppServices>,
    dictionary: UserDictionary,
) -> Result<(), String> {
    log::info!(
        "[Dictionary] Saving dictionary, enabled: {}, entries: {}",
        dictionary.enabled,
        dictionary.entries.len()
    );

    let mut config = services
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;
    config.user_dictionary = dictionary;

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content = serde_json::to_string_pretty(&*config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {}", e))?;

    log::info!("[Dictionary] Dictionary saved successfully");
    Ok(())
}

/// 添加词典词条
#[tauri::command]
pub fn add_dictionary_entry(
    services: State<'_, AppServices>,
    entry: DictionaryEntry,
) -> Result<(), String> {
    log::info!("[Dictionary] Adding entry: {}", entry.word);

    let mut config = services
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;

    // 检查是否已存在
    if config
        .user_dictionary
        .entries
        .iter()
        .any(|e| e.word == entry.word)
    {
        return Err(format!("Entry '{}' already exists", entry.word));
    }

    config.user_dictionary.entries.push(entry);

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content = serde_json::to_string_pretty(&*config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// 删除词典词条
#[tauri::command]
pub fn remove_dictionary_entry(
    services: State<'_, AppServices>,
    word: String,
) -> Result<(), String> {
    log::info!("[Dictionary] Removing entry: {}", word);

    let mut config = services
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;

    let original_len = config.user_dictionary.entries.len();
    config.user_dictionary.entries.retain(|e| e.word != word);

    if config.user_dictionary.entries.len() == original_len {
        return Err(format!("Entry '{}' not found", word));
    }

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content = serde_json::to_string_pretty(&*config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}
