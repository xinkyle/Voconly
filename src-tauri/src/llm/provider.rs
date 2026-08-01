//! LLM Provider 模块
//! 定义 LLM Provider trait 和响应结构

use async_trait::async_trait;
use serde::Serialize;
use tokio::sync::mpsc::Sender;

use super::config::LlmConfig;
use super::progress::LlmProgressEvent;

/// LLM 响应结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmResponse {
    pub success: bool,
    pub text: String,
    pub error: Option<String>,
    pub tokens_used: Option<u32>,
}

/// LLM Provider Trait - 所有实现必须遵循此接口
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// 检查服务是否可用
    async fn health_check(&self) -> Result<bool, String>;

    /// 获取可用模型列表
    async fn list_models(&self) -> Result<Vec<String>, String>;

    /// 发送文本处理请求（无进度）
    async fn process_text(&self, text: &str, config: &LlmConfig) -> Result<LlmResponse, String>;

    /// 发送文本处理请求（带进度）
    /// progress_tx: 可选的进度事件发送通道
    /// 默认实现：直接调用无进度版本，其他 Provider 无需改动
    async fn process_text_with_progress(
        &self,
        text: &str,
        config: &LlmConfig,
        _progress_tx: Option<Sender<LlmProgressEvent>>,
    ) -> Result<LlmResponse, String> {
        // 默认实现：忽略进度通道，直接调用无进度版本
        // 这样其他 Provider（如 OpenAI 兼容）无需改动
        self.process_text(text, config).await
    }
}
