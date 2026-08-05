//! ASR Model Presets
//!
//! Hardcoded presets for ASR (Automatic Speech Recognition) models.
//!
//! ⚠️ 职责说明（重构后）:
//! - 本文件的预设仅用于 Catalog UI 展示（下载前）
//! - 提供下载链接、展示名称、描述等信息
//! - 运行时能力（languages, supports_streaming 等）从 GGUF Header 读取
//! - 预设文件中的能力字段已废弃，仅用于 fallback 场景
//!
//! 架构原则：
//! - GGUF Header 是能力的唯一真实来源
//! - 预设文件仅用于 Catalog 展示（下载信息、展示名称）
//! - 运行时验证作为最终兜底
//!
//! 支持的模型包括：
//! - Qwen3-ASR (GGUF, Chinese SOTA)
//! - Cohere Transcribe (GGUF, HF Open ASR #1)
//! - Nemotron 3.5 ASR (GGUF, streaming, low latency)
//! - Parakeet TDT v3 (GGUF, European languages)
//! - Parakeet Unified EN (GGUF, English optimized)
//! - Whisper Large v3 Turbo (GGUF, 100+ languages)
//! - SenseVoice Small (ONNX, Chinese/Cantonese optimized)
//! - Parakeet V3 (ONNX, European languages)

use super::{DownloadSourceInfo, ModelPreset};
use crate::backends::BackendType;
use crate::catalog::{get_accuracy_score, get_speed_score, CATALOG};

/// Get all ASR model presets (从 catalog.json 动态生成)
pub fn get_asr_presets() -> Vec<ModelPreset> {
    CATALOG
        .iter()
        .filter(|m| m.backend.as_deref() != Some("LLM"))
        .flat_map(|m| m.to_presets())
        .collect()
}

/// Get ASR preset by backend type
pub fn get_asr_presets_by_backend(backend: BackendType) -> Vec<ModelPreset> {
    get_asr_presets()
        .iter()
        .filter(|p| p.backend == Some(backend))
        .cloned()
        .collect()
}

/// Get ASR preset by language support
pub fn get_asr_presets_by_language(language: &str) -> Vec<ModelPreset> {
    get_asr_presets()
        .iter()
        .filter(|p| p.languages.contains(&language.to_string()))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::presets::ModelType;

    #[test]
    fn test_asr_presets_count() {
        let presets = get_asr_presets();
        // Should have 8 ASR presets (6 GGUF + 2 ONNX)
        assert_eq!(presets.len(), 8);
    }

    #[test]
    fn test_all_asr_presets_have_backend() {
        let presets = get_asr_presets();
        for preset in &presets {
            assert!(preset.is_asr());
            assert!(preset.backend.is_some());
            assert!(preset.n_gpu_layers.is_none());
            assert!(preset.n_ctx.is_none());
            assert!(preset.recommended.is_none());
        }
    }

    #[test]
    fn test_gguf_presets() {
        let gguf_presets = get_asr_presets_by_backend(BackendType::TranscribeCpp);
        // 6 GGUF models
        assert_eq!(gguf_presets.len(), 6);

        // Qwen3-ASR should support Chinese
        let qwen3 = gguf_presets
            .iter()
            .find(|p| p.id == "Qwen3-ASR-1.7B-Q5_K_M");
        assert!(qwen3.is_some());
        let qwen3 = qwen3.unwrap();
        assert!(qwen3.languages.contains(&"zh".to_string()));
        assert!(qwen3.supports_streaming == Some(false)); // Qwen3-ASR 不支持流式

        // Whisper Turbo should support translation
        let whisper = gguf_presets
            .iter()
            .find(|p| p.id == "whisper-large-v3-turbo-Q5_K_M");
        assert!(whisper.is_some());
        let whisper = whisper.unwrap();
        assert!(whisper.supports_translation == Some(true));
    }

    #[test]
    fn test_onnx_presets() {
        let onnx_presets = get_asr_presets_by_backend(BackendType::Onnx);
        assert_eq!(onnx_presets.len(), 2);

        // SenseVoice should support Chinese and Cantonese
        let sensevoice = onnx_presets.iter().find(|p| p.id == "sensevoice-small");
        assert!(sensevoice.is_some());
        let sensevoice = sensevoice.unwrap();
        assert!(sensevoice.languages.contains(&"zh".to_string()));
        assert!(sensevoice.languages.contains(&"zh-yue".to_string()));

        // Parakeet should support English and European languages
        let parakeet = onnx_presets.iter().find(|p| p.id == "parakeet-v3");
        assert!(parakeet.is_some());
        let parakeet = parakeet.unwrap();
        assert!(parakeet.languages.contains(&"en".to_string()));
        assert!(parakeet.languages.contains(&"de".to_string()));
    }

    #[test]
    fn test_language_filtering() {
        let zh_presets = get_asr_presets_by_language("zh");
        // Qwen3-ASR, Cohere, Nemotron, Whisper Turbo, SenseVoice support Chinese (5 GGUF + 1 ONNX)
        assert_eq!(zh_presets.len(), 5);

        let en_presets = get_asr_presets_by_language("en");
        // All 8 presets support English
        assert_eq!(en_presets.len(), 8);

        let de_presets = get_asr_presets_by_language("de");
        // Qwen3-ASR, Cohere, Nemotron, Parakeet TDT, Whisper Turbo, Parakeet V3 (ONNX)
        assert!(de_presets.len() >= 5);
    }

    #[test]
    fn test_asr_preset_serialization_roundtrip() {
        let presets = get_asr_presets();
        for preset in &presets {
            let json = serde_json::to_string(preset).expect("Serialization failed");
            let decoded: ModelPreset = serde_json::from_str(&json).expect("Deserialization failed");
            assert_eq!(decoded.id, preset.id);
            assert_eq!(decoded.model_type, ModelType::Asr);
        }
    }
}
