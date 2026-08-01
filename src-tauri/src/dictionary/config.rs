//! 用户词典配置结构

use serde::{Deserialize, Serialize};

/// 单个词典词条
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryEntry {
    /// 词汇
    pub word: String,
    /// 别名/变体（可选，用于匹配时优先考虑）
    #[serde(default)]
    pub aliases: Vec<String>,
}

/// 用户词典配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDictionary {
    /// 是否启用词典修正
    #[serde(default)]
    pub enabled: bool,
    /// 词典词条列表
    #[serde(default)]
    pub entries: Vec<DictionaryEntry>,
    /// 匹配阈值 (0.0-1.0)，越小越严格
    #[serde(default = "default_threshold")]
    pub threshold: f32,
    /// 原始输入文本（用于前端展示，保留用户格式）
    #[serde(default)]
    pub raw_text: Option<String>,
}

fn default_threshold() -> f32 {
    0.13
}

impl Default for UserDictionary {
    fn default() -> Self {
        Self {
            enabled: false,
            entries: Vec::new(),
            threshold: default_threshold(),
            raw_text: None,
        }
    }
}
