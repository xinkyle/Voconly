//! LLM 进度事件模块
//! 定义 LLM 处理过程中的进度事件结构

use serde::Serialize;

/// LLM 处理进度阶段
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LlmStage {
    /// 模型加载（仅本地模型）
    Loading,
    /// 输入分词
    Tokenizing,
    /// 解码输入 tokens
    Decoding,
    /// 生成输出 tokens
    Generating,
    /// 完成
    Complete,
}

/// LLM 进度事件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProgressEvent {
    /// 当前阶段
    pub stage: LlmStage,
    /// 当前进度值（如已生成 tokens 数）
    pub current: u32,
    /// 总量（如 max_tokens）
    pub total: u32,
    /// 百分比 (0-100)
    pub percentage: u8,
    /// 实时速度（tokens/秒，仅生成阶段有效）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_per_sec: Option<f64>,
    /// 预估剩余时间（秒，仅生成阶段有效）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_remaining_secs: Option<f64>,
    /// 已用时间（秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elapsed_secs: Option<f64>,
}

impl LlmProgressEvent {
    /// 创建加载阶段进度
    pub fn loading() -> Self {
        log::info!("[LlmProgress] Stage: loading");
        Self {
            stage: LlmStage::Loading,
            current: 0,
            total: 100,
            percentage: 0,
            tokens_per_sec: None,
            estimated_remaining_secs: None,
            elapsed_secs: None,
        }
    }

    /// 创建分词阶段进度
    pub fn tokenizing(tokens_count: u32) -> Self {
        log::info!(
            "[LlmProgress] Stage: tokenizing, tokens_count={}",
            tokens_count
        );
        Self {
            stage: LlmStage::Tokenizing,
            current: tokens_count,
            total: tokens_count,
            percentage: 100,
            tokens_per_sec: None,
            estimated_remaining_secs: None,
            elapsed_secs: None,
        }
    }

    /// 创建解码阶段进度
    pub fn decoding(input_tokens: u32) -> Self {
        log::info!(
            "[LlmProgress] Stage: decoding, input_tokens={}",
            input_tokens
        );
        Self {
            stage: LlmStage::Decoding,
            current: input_tokens,
            total: input_tokens,
            percentage: 100,
            tokens_per_sec: None,
            estimated_remaining_secs: None,
            elapsed_secs: None,
        }
    }

    /// 创建生成阶段进度
    pub fn generating(current: u32, total: u32, elapsed_secs: f64) -> Self {
        let percentage = if total > 0 {
            ((current as f64 / total as f64) * 100.0).min(100.0) as u8
        } else {
            0
        };

        let tokens_per_sec = if elapsed_secs > 0.0 && current > 0 {
            Some(current as f64 / elapsed_secs)
        } else {
            None
        };

        let remaining_tokens = total.saturating_sub(current);
        let estimated_remaining_secs = if let Some(tps) = tokens_per_sec {
            if tps > 0.0 && remaining_tokens > 0 {
                Some(remaining_tokens as f64 / tps)
            } else {
                None
            }
        } else {
            None
        };

        log::debug!(
            "[LlmProgress] Stage: generating, current={}, total={}, percentage={}%, tokens_per_sec={:?}, elapsed={:.2}s",
            current, total, percentage, tokens_per_sec, elapsed_secs
        );

        Self {
            stage: LlmStage::Generating,
            current,
            total,
            percentage,
            tokens_per_sec,
            estimated_remaining_secs,
            elapsed_secs: Some(elapsed_secs),
        }
    }

    /// 创建完成事件
    pub fn complete(total_tokens: u32, elapsed_secs: f64) -> Self {
        let tokens_per_sec = if elapsed_secs > 0.0 && total_tokens > 0 {
            Some(total_tokens as f64 / elapsed_secs)
        } else {
            None
        };

        log::info!(
            "[LlmProgress] Stage: complete, total_tokens={}, elapsed={:.2}s, tokens_per_sec={:?}",
            total_tokens,
            elapsed_secs,
            tokens_per_sec
        );

        Self {
            stage: LlmStage::Complete,
            current: total_tokens,
            total: total_tokens,
            percentage: 100,
            tokens_per_sec,
            estimated_remaining_secs: Some(0.0),
            elapsed_secs: Some(elapsed_secs),
        }
    }
}
