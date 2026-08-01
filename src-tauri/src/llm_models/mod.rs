//! LLM 模型管理模块
//! 管理 GGUF 模型预设和下载状态

mod presets;

pub use presets::{get_llm_model_presets, scan_available_llm_models, LlmModelPreset};
