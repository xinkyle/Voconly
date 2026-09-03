//! LLM 配置模块
//! 定义 LLM 后处理相关的配置结构

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

/// 认证类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuthType {
    Bearer,  // OpenAI, DeepSeek, Groq, Custom...
    XApiKey, // Anthropic
    None,    // Ollama
}

impl Default for AuthType {
    fn default() -> Self {
        Self::None
    }
}

/// Provider 元数据（硬编码列表）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMeta {
    pub id: String,       // "ollama", "openai", "deepseek"...
    pub label: String,    // "Ollama", "OpenAI", "DeepSeek"...
    pub icon: String,     // 图标标识
    pub base_url: String, // 默认 API 地址
    pub allow_base_url_edit: bool,
    pub requires_api_key: bool,
    pub auth_type: AuthType,
    pub popular: bool,       // 是否常用（默认显示）
    pub description: String, // 描述信息
}

/// Provider 实例配置（用户配置）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderInstance {
    pub meta_id: String, // 对应 ProviderMeta.id
    pub enabled: bool,
    pub base_url: String, // 用户自定义或默认
    pub api_key: Option<String>,
    pub default_model: Option<String>,
    /// GPU 层数（已废弃，保留向后兼容）
    #[serde(default)]
    pub n_gpu_layers: Option<i32>,
    /// 上下文长度限制（仅本地 Provider 有效，影响模型加载参数和文本长度检查）
    /// 默认值：本地 Provider 为 4096，在线 Provider 为 None（不限制）
    #[serde(default)]
    pub context_limit: Option<u32>,
    /// 最大输出 tokens（None 表示不限制，本地模型默认 1024）
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

impl Default for LlmProviderInstance {
    fn default() -> Self {
        Self {
            meta_id: "ollama".to_string(),
            enabled: true,
            base_url: "http://localhost:11434/v1".to_string(),
            api_key: None,
            default_model: None,
            n_gpu_layers: None,
            context_limit: None,
            max_tokens: Some(1024), // 本地模型默认 1024
        }
    }
}

/// 获取硬编码的 Provider 元数据列表
pub fn get_provider_meta_list() -> Vec<ProviderMeta> {
    vec![
        ProviderMeta {
            id: "ollama".to_string(),
            label: "Ollama".to_string(),
            icon: "🦙".to_string(),
            base_url: "http://localhost:11434/v1".to_string(),
            allow_base_url_edit: true,
            requires_api_key: false,
            auth_type: AuthType::None,
            popular: true,
            description: "Local LLM, no API key required, supports many open-source models"
                .to_string(),
        },
        ProviderMeta {
            id: "openai".to_string(),
            label: "OpenAI".to_string(),
            icon: "🟢".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "GPT-4, GPT-3.5 and other cloud models".to_string(),
        },
        ProviderMeta {
            id: "deepseek".to_string(),
            label: "DeepSeek".to_string(),
            icon: "🔮".to_string(),
            base_url: "https://api.deepseek.com/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "High-performance model with excellent Chinese support".to_string(),
        },
        ProviderMeta {
            id: "gemini".to_string(),
            label: "Gemini".to_string(),
            icon: "💎".to_string(),
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "Google multimodal models".to_string(),
        },
        ProviderMeta {
            id: "glm".to_string(),
            label: "GLM".to_string(),
            icon: "🧠".to_string(),
            base_url: "https://open.bigmodel.cn/api/paas/v4".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "Zhipu AI GLM series models".to_string(),
        },
        ProviderMeta {
            id: "minimax".to_string(),
            label: "Minimax".to_string(),
            icon: "🚀".to_string(),
            base_url: "https://api.minimax.chat/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "Hailuo AI large language models".to_string(),
        },
        ProviderMeta {
            id: "kimi".to_string(),
            label: "Kimi".to_string(),
            icon: "🌙".to_string(),
            base_url: "https://api.moonshot.cn/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "Moonshot AI with long context window".to_string(),
        },
        ProviderMeta {
            id: "qwen".to_string(),
            label: "Qwen".to_string(),
            icon: "🤖".to_string(),
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "Alibaba Cloud Qwen series models".to_string(),
        },
        ProviderMeta {
            id: "claude".to_string(),
            label: "Claude".to_string(),
            icon: "🟣".to_string(),
            base_url: "https://api.anthropic.com/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::XApiKey,
            popular: true,
            description: "Anthropic Claude models".to_string(),
        },
        ProviderMeta {
            id: "groq".to_string(),
            label: "Groq".to_string(),
            icon: "⚡".to_string(),
            base_url: "https://api.groq.com/openai/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: true,
            description: "High-speed inference platform".to_string(),
        },
        // 更多 Provider
        ProviderMeta {
            id: "openrouter".to_string(),
            label: "OpenRouter".to_string(),
            icon: "🔀".to_string(),
            base_url: "https://openrouter.ai/api/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: false,
            description: "Multi-model aggregation platform".to_string(),
        },
        ProviderMeta {
            id: "cerebras".to_string(),
            label: "Cerebras".to_string(),
            icon: "🎯".to_string(),
            base_url: "https://api.cerebras.ai/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: false,
            description: "Ultra-fast inference".to_string(),
        },
        ProviderMeta {
            id: "yi".to_string(),
            label: "Yi".to_string(),
            icon: "🌟".to_string(),
            base_url: "https://api.lingyiwanwu.com/v1".to_string(),
            allow_base_url_edit: false,
            requires_api_key: true,
            auth_type: AuthType::Bearer,
            popular: false,
            description: "01.AI Yi series models".to_string(),
        },
        ProviderMeta {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            icon: "⚙️".to_string(),
            base_url: "".to_string(),
            allow_base_url_edit: true,
            requires_api_key: false,
            auth_type: AuthType::Bearer,
            popular: false,
            description: "Custom API endpoint".to_string(),
        },
    ]
}

/// Provider 类型枚举（保留向后兼容）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LlmProviderType {
    Ollama,
    OpenAI,
    DeepSeek,
    Gemini,
    Custom,
}

impl Default for LlmProviderType {
    fn default() -> Self {
        Self::Ollama
    }
}

impl LlmProviderType {
    /// 转换为 provider_id 字符串
    pub fn to_provider_id(&self) -> String {
        match self {
            LlmProviderType::Ollama => "ollama".to_string(),
            LlmProviderType::OpenAI => "openai".to_string(),
            LlmProviderType::DeepSeek => "deepseek".to_string(),
            LlmProviderType::Gemini => "gemini".to_string(),
            LlmProviderType::Custom => "custom".to_string(),
        }
    }

    /// 从 provider_id 字符串解析
    pub fn from_provider_id(s: &str) -> Self {
        match s {
            "ollama" => LlmProviderType::Ollama,
            "openai" => LlmProviderType::OpenAI,
            "deepseek" => LlmProviderType::DeepSeek,
            "gemini" => LlmProviderType::Gemini,
            _ => LlmProviderType::Custom,
        }
    }
}

impl std::str::FromStr for LlmProviderType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self::from_provider_id(s))
    }
}

/// Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderConfig {
    pub provider_type: LlmProviderType,
    pub enabled: bool,
    pub base_url: String,        // API 地址
    pub api_key: Option<String>, // API Key (Ollama 不需要)
    pub model: String,           // 模型名称
    pub timeout_secs: u64,       // 超时时间
}

impl Default for LlmProviderConfig {
    fn default() -> Self {
        Self {
            provider_type: LlmProviderType::Ollama,
            enabled: true,
            base_url: "http://localhost:11434/v1".to_string(),
            api_key: None,
            model: "qwen2.5:3b".to_string(),
            timeout_secs: 10,
        }
    }
}

/// LLM 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmConfig {
    pub enabled: bool, // 是否启用 LLM 后处理
    pub provider: LlmProviderConfig,
    pub user_prompt_template: String, // 用户提示词模板，{text} 为占位符
    pub max_tokens: u32,              // 最大输出 token
    pub temperature: f32,             // 温度参数
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: LlmProviderConfig::default(),
            user_prompt_template: "{text}".to_string(),
            max_tokens: 1024,
            temperature: 0.1,
        }
    }
}

/// LLM Profile - 场景级配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProfile {
    pub id: String,
    pub scene_id: String,            // 关联的场景 ID
    pub enabled: bool,               // 是否启用 LLM 后处理
    pub provider_id: Option<String>, // Provider ID，如 "ollama", "openai" 等
    pub model: String,               // 模型名称
    /// 用户提示词类型：内置类型为 "polish", "translate", "summarize"
    /// 自定义预设为预设名称（如 "正式表达", "会议秘书"）
    pub user_prompt_type: String,
    pub user_prompt_custom: String, // 自定义预设的提示词内容
    pub max_tokens: u32,
    pub temperature: f32,
}

impl Default for LlmProfile {
    fn default() -> Self {
        Self {
            id: String::new(),
            scene_id: String::new(),
            enabled: false,
            provider_id: None,
            model: "qwen2.5:3b".to_string(),
            user_prompt_type: "polish".to_string(),
            user_prompt_custom: String::new(),
            max_tokens: 1024,
            temperature: 0.1,
        }
    }
}

/// 全局提示词预设
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPromptPresets {
    /// 预设：轻度润色
    pub light_polish: String,
    /// 预设：翻译
    pub translate: String,
    /// 预设：专业润色
    pub professional_polish: String,
    /// 预设：会议秘书
    pub meeting_secretary: String,
    /// 用户自定义预设（key 为分类名称，value 为提示词模板）
    /// 使用 IndexMap 保持插入顺序
    #[serde(default, skip_serializing_if = "IndexMap::is_empty")]
    pub custom_presets: IndexMap<String, String>,
}

impl Default for UserPromptPresets {
    /// 默认值返回空字符串（默认值由前端 i18n 提供）
    fn default() -> Self {
        Self {
            light_polish: String::new(),
            translate: String::new(),
            professional_polish: String::new(),
            meeting_secretary: String::new(),
            custom_presets: IndexMap::new(),
        }
    }
}

