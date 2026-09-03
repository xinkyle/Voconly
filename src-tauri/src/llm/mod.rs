//! LLM 后处理模块
//! 提供文本整理和润色功能，支持多种 LLM Provider

mod config;
mod progress;
mod provider;
mod provider_models_cache;
mod providers;

pub use config::{
    get_provider_meta_list, LlmConfig, LlmProfile, LlmProviderConfig, LlmProviderInstance,
    LlmProviderType, ProviderMeta, UserPromptPresets,
};
pub use progress::LlmProgressEvent;
pub use provider::{LlmProvider, LlmResponse};
pub use provider_models_cache::ProviderModelsCache;
pub use providers::OpenAiCompatibleProvider;

use std::sync::Arc;
use tokio::sync::mpsc::Sender;

/// LLM 服务 - 统一入口
pub struct LlmService {
    provider: Arc<dyn LlmProvider>,
    config: LlmConfig,
}

impl LlmService {
    /// 从旧的 LlmConfig 创建服务（向后兼容）
    pub fn new(config: LlmConfig) -> Result<Self, String> {
        // 查找对应的 ProviderMeta
        let provider_id = match config.provider.provider_type {
            LlmProviderType::Ollama => "ollama",
            LlmProviderType::OpenAI => "openai",
            LlmProviderType::DeepSeek => "deepseek",
            LlmProviderType::Gemini => "gemini",
            LlmProviderType::Custom => "custom",
        };

        // 从硬编码列表中获取 Provider 元数据
        let meta = get_provider_meta_list()
            .into_iter()
            .find(|m| m.id == provider_id)
            .ok_or_else(|| format!("未找到 Provider 元数据: {}", provider_id))?;

        // 创建 ProviderInstance
        let instance = LlmProviderInstance {
            meta_id: provider_id.to_string(),
            enabled: true,
            base_url: config.provider.base_url.clone(),
            api_key: config.provider.api_key.clone(),
            default_model: Some(config.provider.model.clone()),
            n_gpu_layers: None,
            context_limit: None,
            max_tokens: None,
        };

        // 使用 OpenAI 兼容 Provider
        let provider: Arc<dyn LlmProvider> =
            Arc::new(OpenAiCompatibleProvider::new(meta, instance));

        Ok(Self { provider, config })
    }

    /// 从 ProviderInstance 创建服务（新架构）
    pub fn from_provider_instance(
        config: LlmConfig,
        meta: ProviderMeta,
        instance: LlmProviderInstance,
    ) -> Result<Self, String> {
        let provider: Arc<dyn LlmProvider> =
            Arc::new(OpenAiCompatibleProvider::new(meta, instance));
        Ok(Self { provider, config })
    }

    /// 检查 LLM 服务状态
    pub async fn health_check(&self) -> Result<bool, String> {
        self.provider.health_check().await
    }

    /// 获取可用模型列表
    pub async fn list_models(&self) -> Result<Vec<String>, String> {
        self.provider.list_models().await
    }

    /// 处理文本
    pub async fn process_text(&self, text: &str) -> Result<LlmResponse, String> {
        if !self.config.enabled {
            return Ok(LlmResponse {
                success: true,
                text: text.to_string(),
                error: None,
                tokens_used: None,
            });
        }

        self.provider.process_text(text, &self.config).await
    }

    /// 处理文本（带进度）
    /// progress_tx: 可选的进度事件发送通道
    pub async fn process_text_with_progress(
        &self,
        text: &str,
        progress_tx: Option<Sender<LlmProgressEvent>>,
    ) -> Result<LlmResponse, String> {
        if !self.config.enabled {
            return Ok(LlmResponse {
                success: true,
                text: text.to_string(),
                error: None,
                tokens_used: None,
            });
        }

        self.provider
            .process_text_with_progress(text, &self.config, progress_tx)
            .await
    }
}
