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

#[cfg(feature = "local_llm")]
pub use providers::LlamaCppProvider;

#[cfg(feature = "local_llm")]
pub use providers::llama_cpp::get_cached_llm_model_info;

#[cfg(feature = "local_llm")]
pub use providers::llama_cpp::clear_model_cache;

#[cfg(feature = "local_llm")]
use crate::llm_models::get_llm_model_presets;
#[cfg(feature = "local_llm")]
use crate::utils::downloader::get_llm_model_path;

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
            LlmProviderType::LlamaCpp => "llama_cpp",
        };

        // 特殊处理 llama.cpp Provider
        #[cfg(feature = "local_llm")]
        if provider_id == "llama_cpp" {
            let model_id = &config.provider.model;

            // 尝试在预设列表中找到匹配的模型
            let preset = get_llm_model_presets()
                .into_iter()
                .find(|p| p.id == *model_id);

            // 如果没有预设，检查文件是否存在
            let (model_path, n_gpu_layers, n_ctx) = if let Some(p) = preset {
                // 有预设，使用预设配置
                let path = get_llm_model_path(&p.id)?;
                (path, p.n_gpu_layers as i32, p.n_ctx)
            } else {
                // 没有预设，检查文件是否存在
                let model_path = get_llm_model_path(model_id)?;
                if !model_path.exists() {
                    return Err(format!("模型文件不存在: {}", model_id));
                }
                // 使用默认配置（CPU 模式）
                (model_path, 0, 4096)
            };

            let provider: Arc<dyn LlmProvider> =
                Arc::new(LlamaCppProvider::new(model_path, n_gpu_layers, n_ctx));

            return Ok(Self { provider, config });
        }

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
        // 特殊处理 llama.cpp Provider
        #[cfg(feature = "local_llm")]
        if meta.id == "llama_cpp" {
            let model_id = &config.provider.model;
            log::info!(
                "[LlmService] Creating llama.cpp provider for model: {}",
                model_id
            );

            // 尝试在预设列表中找到匹配的模型
            let preset = get_llm_model_presets()
                .into_iter()
                .find(|p| p.id == *model_id);

            // 如果没有预设，检查文件是否存在
            let (model_path, default_gpu_layers, n_ctx) = if let Some(p) = preset {
                // 有预设，使用预设配置
                let path = get_llm_model_path(&p.id)?;
                log::info!(
                    "[LlmService] Using preset config: n_gpu_layers={}, n_ctx={}",
                    p.n_gpu_layers,
                    p.n_ctx
                );
                (path, p.n_gpu_layers as i32, p.n_ctx)
            } else {
                // 没有预设，检查文件是否存在
                let model_path = get_llm_model_path(model_id)?;
                if !model_path.exists() {
                    return Err(format!("模型文件不存在: {}", model_id));
                }
                log::info!("[LlmService] No preset found, using defaults: n_gpu_layers=-1 (GPU), n_ctx=4096");
                // 使用默认配置（GPU 模式，-1 表示全部层加载到 GPU）
                (model_path, -1, 4096)
            };

            // 使用用户配置的 GPU 层数，或默认值
            // -1 表示全部层加载到 GPU（自动检测）
            // 默认使用 GPU (-1)，让 llama.cpp 自己处理 GPU 不可用的情况
            let n_gpu_layers = instance.n_gpu_layers.unwrap_or_else(|| {
                // 如果用户没有配置，默认使用 GPU
                // 注意：default_gpu_layers 可能来自 preset 或默认值
                if default_gpu_layers == 0 {
                    // 只有当 preset 明确设置为 CPU (0) 时才使用 CPU
                    // 否则默认使用 GPU (-1)
                    -1
                } else {
                    default_gpu_layers
                }
            });

            log::info!(
                "[LlmService] Final GPU config: n_gpu_layers={} (from instance: {:?})",
                n_gpu_layers,
                instance.n_gpu_layers
            );

            // 获取 context_limit：
            // 1. 用户配置优先（instance.context_limit）
            // 2. 本地 Provider（llama.cpp）默认 4096
            // 注意：preset 中的 n_ctx 仅在用户未配置时作为参考
            let n_ctx = instance.context_limit.unwrap_or(4096);

            log::info!(
                "[LlmService] Context limit: n_ctx={} (from instance: {:?})",
                n_ctx,
                instance.context_limit
            );

            let provider: Arc<dyn LlmProvider> = Arc::new(LlamaCppProvider::new(
                model_path.clone(),
                n_gpu_layers,
                n_ctx,
            ));

            log::info!(
                "[LlmService] LlamaCppProvider created with path: {:?}",
                model_path
            );

            // 使用 instance.max_tokens 覆盖全局配置（本地模型默认 1024）
            let max_tokens = instance.max_tokens.unwrap_or(1024);
            let config = LlmConfig {
                max_tokens,
                ..config
            };
            log::info!(
                "[LlmService] max_tokens: {} (from instance: {:?})",
                max_tokens,
                instance.max_tokens
            );

            return Ok(Self { provider, config });
        }

        #[cfg(not(feature = "local_llm"))]
        if meta.id == "llama_cpp" {
            return Err("local_llm feature 未启用，请重新编译启用该功能".to_string());
        }

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
