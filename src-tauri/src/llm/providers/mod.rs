//! LLM Providers 模块
//! 包含各种 LLM Provider 的实现

#[cfg(feature = "local_llm")]
pub mod llama_cpp;
mod openai_compatible;

#[cfg(feature = "local_llm")]
pub use llama_cpp::LlamaCppProvider;
pub use openai_compatible::OpenAiCompatibleProvider;
