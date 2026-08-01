//! Provider 模型缓存模块
//! 提供 Provider 模型列表的本地缓存功能

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Provider 模型缓存条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderModelsCacheEntry {
    pub models: Vec<String>,
    pub updated_at: DateTime<Utc>,
}

/// 所有 Provider 的模型缓存
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderModelsCache {
    #[serde(flatten)]
    pub providers: HashMap<String, ProviderModelsCacheEntry>,
}

impl ProviderModelsCache {
    /// 获取缓存文件路径
    pub fn get_cache_path(data_dir: &PathBuf) -> PathBuf {
        data_dir.join("Voconly").join("llm_provider_models.json")
    }

    /// 从文件加载缓存
    pub fn load(data_dir: &PathBuf) -> Self {
        let path = Self::get_cache_path(data_dir);
        if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    /// 保存缓存到文件
    pub fn save(&self, data_dir: &PathBuf) -> Result<(), String> {
        let path = Self::get_cache_path(data_dir);
        let content =
            serde_json::to_string_pretty(self).map_err(|e| format!("序列化失败: {}", e))?;

        // 确保目录存在
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }

        std::fs::write(&path, content).map_err(|e| format!("写入文件失败: {}", e))?;
        Ok(())
    }

    /// 获取某个 provider 的缓存模型列表
    pub fn get_models(&self, provider_id: &str) -> Option<Vec<String>> {
        self.providers.get(provider_id).map(|e| e.models.clone())
    }

    /// 更新某个 provider 的模型列表
    pub fn update(&mut self, provider_id: &str, models: Vec<String>) {
        self.providers.insert(
            provider_id.to_string(),
            ProviderModelsCacheEntry {
                models,
                updated_at: Utc::now(),
            },
        );
    }
}
