//! ASR Model Presets
//!
//! Hardcoded presets for ASR (Automatic Speech Recognition) models.
//! These presets define the available models and their download sources.

use super::{DownloadSourceInfo, ModelPreset};
use crate::backends::BackendType;

/// Get all ASR model presets
///
/// Returns a list of hardcoded ASR model presets that the application supports.
/// These models include:
/// - Qwen3-ASR (GGUF, Chinese SOTA)
/// - Cohere Transcribe (GGUF, HF Open ASR #1)
/// - Nemotron 3.5 ASR (GGUF, streaming, low latency)
/// - Parakeet TDT v3 (GGUF, European languages)
/// - Parakeet Unified EN (GGUF, English optimized)
/// - Whisper Large v3 Turbo (GGUF, 100+ languages)
/// - SenseVoice Small (ONNX, Chinese/Cantonese optimized)
/// - Parakeet V3 (ONNX, European languages)
pub fn get_asr_presets() -> Vec<ModelPreset> {
    vec![
        // ========== GGUF Models (TranscribeCpp Backend) ==========

        // Qwen3-ASR-1.7B - Chinese SOTA performance, supports streaming and dialects
        ModelPreset::asr_preset(
            "Qwen3-ASR-1.7B-Q5_K_M".to_string(),
            "Qwen3-ASR-1.7B Q5_K_M".to_string(),
            "~1.5GB".to_string(),
            BackendType::TranscribeCpp,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/Qwen3-ASR-1.7B-gguf/resolve/main/Qwen3-ASR-1.7B-Q5_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/Qwen3-ASR-1.7B-gguf/resolve/main/Qwen3-ASR-1.7B-Q5_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            vec!["zh".to_string(), "zh-yue".to_string(), "en".to_string(), "ar".to_string(), "de".to_string(), "fr".to_string(), "es".to_string(), "pt".to_string(), "id".to_string(), "it".to_string(), "ko".to_string(), "ru".to_string(), "th".to_string(), "vi".to_string(), "ja".to_string(), "tr".to_string(), "hi".to_string(), "ms".to_string(), "nl".to_string(), "sv".to_string(), "da".to_string(), "fi".to_string(), "pl".to_string(), "cs".to_string(), "fil".to_string(), "fa".to_string(), "el".to_string(), "hu".to_string(), "mk".to_string(), "ro".to_string()],
            Some("中文/英文混合识别，支持30种语言+22种中文方言，中文WER 5.2%".to_string()),
            Some(true),  // supports_auto_detect
            Some(true),  // supports_streaming
            Some(false), // supports_translation
        ),

        // Cohere Transcribe 03-2026 - HF Open ASR Leaderboard #1
        ModelPreset::asr_preset(
            "cohere-transcribe-03-2026-Q5_K_M".to_string(),
            "Cohere Transcribe 03-2026 Q5_K_M".to_string(),
            "~1.7GB".to_string(),
            BackendType::TranscribeCpp,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/cohere-transcribe-03-2026-gguf/resolve/main/cohere-transcribe-03-2026-Q5_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/cohere-transcribe-03-2026-gguf/resolve/main/cohere-transcribe-03-2026-Q5_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            vec!["zh".to_string(), "en".to_string(), "ja".to_string(), "ko".to_string(), "de".to_string(), "fr".to_string(), "es".to_string(), "it".to_string(), "pt".to_string(), "el".to_string(), "nl".to_string(), "pl".to_string(), "vi".to_string(), "ar".to_string()],
            Some("HuggingFace Open ASR排行榜#1，WER 5.42%，14种语言支持".to_string()),
            Some(true),  // supports_auto_detect
            Some(false), // supports_streaming
            Some(false), // supports_translation
        ),

        // Nemotron 3.5 ASR Streaming 0.6B - Low latency, CPU friendly
        ModelPreset::asr_preset(
            "nemotron-3.5-asr-streaming-0.6b-Q5_K_M".to_string(),
            "Nemotron 3.5 ASR Streaming 0.6B Q5_K_M".to_string(),
            "~534MB".to_string(),
            BackendType::TranscribeCpp,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q5_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/nemotron-3.5-asr-streaming-0.6b-Q5_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            vec!["ar".to_string(), "bg".to_string(), "cs".to_string(), "da".to_string(), "de".to_string(), "el".to_string(), "en".to_string(), "es".to_string(), "et".to_string(), "fi".to_string(), "fr".to_string(), "he".to_string(), "hi".to_string(), "hr".to_string(), "hu".to_string(), "it".to_string(), "ja".to_string(), "ko".to_string(), "lt".to_string(), "lv".to_string(), "nb".to_string(), "nl".to_string(), "nn".to_string(), "pl".to_string(), "pt".to_string(), "ro".to_string(), "ru".to_string(), "sk".to_string(), "sl".to_string(), "sv".to_string(), "th".to_string(), "tr".to_string(), "uk".to_string(), "vi".to_string(), "zh".to_string()],
            Some("流式处理，80ms超低延迟，39种语言，纯CPU可运行".to_string()),
            Some(true),  // supports_auto_detect
            Some(true),  // supports_streaming
            Some(false), // supports_translation
        ),

        // Parakeet TDT 0.6B v3 - High throughput European languages
        ModelPreset::asr_preset(
            "parakeet-tdt-0.6b-v3-Q5_K_M".to_string(),
            "Parakeet TDT 0.6B v3 Q5_K_M".to_string(),
            "~524MB".to_string(),
            BackendType::TranscribeCpp,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q5_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q5_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            vec!["en".to_string(), "fr".to_string(), "es".to_string(), "de".to_string(), "it".to_string(), "pt".to_string(), "nl".to_string(), "bg".to_string(), "hr".to_string(), "cs".to_string(), "da".to_string(), "et".to_string(), "fi".to_string(), "el".to_string(), "hu".to_string(), "lv".to_string(), "lt".to_string(), "mt".to_string(), "pl".to_string(), "ro".to_string(), "sk".to_string(), "sl".to_string(), "sv".to_string(), "ru".to_string(), "uk".to_string()],
            Some("TDT架构，约48倍Whisper吞吐量，25种欧洲语言，自动语言检测".to_string()),
            Some(true),  // supports_auto_detect
            Some(true),  // supports_streaming
            Some(false), // supports_translation
        ),

        // Parakeet Unified EN 0.6B - English specialized
        ModelPreset::asr_preset(
            "parakeet-unified-en-0.6b-Q5_K_M".to_string(),
            "Parakeet Unified EN 0.6B Q5_K_M".to_string(),
            "~516MB".to_string(),
            BackendType::TranscribeCpp,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/parakeet-unified-en-0.6b-gguf/resolve/main/parakeet-unified-en-0.6b-Q5_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/parakeet-unified-en-0.6b-gguf/resolve/main/parakeet-unified-en-0.6b-Q5_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            vec!["en".to_string()],
            Some("英语专项优化，统一离线/流式推理，最低160ms延迟".to_string()),
            Some(false), // supports_auto_detect (single language model)
            Some(true),  // supports_streaming
            Some(false), // supports_translation
        ),

        // Whisper Large v3 Turbo - 100+ languages, 8x faster than Large v3
        ModelPreset::asr_preset(
            "whisper-large-v3-turbo-Q5_K_M".to_string(),
            "Whisper Large v3 Turbo Q5_K_M".to_string(),
            "~591MB".to_string(),
            BackendType::TranscribeCpp,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/whisper-large-v3-turbo-gguf/resolve/main/whisper-large-v3-turbo-Q5_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/whisper-large-v3-turbo-gguf/resolve/main/whisper-large-v3-turbo-Q5_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            vec!["af".to_string(), "am".to_string(), "ar".to_string(), "as".to_string(), "az".to_string(), "ba".to_string(), "be".to_string(), "bg".to_string(), "bn".to_string(), "bo".to_string(), "br".to_string(), "bs".to_string(), "ca".to_string(), "cs".to_string(), "cy".to_string(), "da".to_string(), "de".to_string(), "el".to_string(), "en".to_string(), "es".to_string(), "et".to_string(), "eu".to_string(), "fa".to_string(), "fi".to_string(), "fo".to_string(), "fr".to_string(), "gl".to_string(), "gu".to_string(), "ha".to_string(), "he".to_string(), "hi".to_string(), "hr".to_string(), "ht".to_string(), "hu".to_string(), "hy".to_string(), "id".to_string(), "is".to_string(), "it".to_string(), "ja".to_string(), "jv".to_string(), "ka".to_string(), "kk".to_string(), "km".to_string(), "kn".to_string(), "ko".to_string(), "ky".to_string(), "la".to_string(), "lo".to_string(), "lt".to_string(), "lv".to_string(), "mg".to_string(), "mk".to_string(), "ml".to_string(), "mn".to_string(), "mr".to_string(), "ms".to_string(), "mt".to_string(), "my".to_string(), "ne".to_string(), "nl".to_string(), "nn".to_string(), "no".to_string(), "oc".to_string(), "or".to_string(), "pa".to_string(), "pl".to_string(), "ps".to_string(), "pt".to_string(), "ro".to_string(), "ru".to_string(), "sa".to_string(), "sd".to_string(), "si".to_string(), "sk".to_string(), "sl".to_string(), "so".to_string(), "sq".to_string(), "sr".to_string(), "su".to_string(), "sv".to_string(), "sw".to_string(), "ta".to_string(), "te".to_string(), "tg".to_string(), "th".to_string(), "tk".to_string(), "tl".to_string(), "tr".to_string(), "tt".to_string(), "uk".to_string(), "ur".to_string(), "uz".to_string(), "vi".to_string(), "wo".to_string(), "xh".to_string(), "yi".to_string(), "yo".to_string(), "zh".to_string(), "zu".to_string()],
            Some("99种语言覆盖，相比Large v3约8倍速度提升，支持翻译".to_string()),
            Some(true),  // supports_auto_detect
            Some(true),  // supports_streaming
            Some(true),  // supports_translation
        ),

        // ========== ONNX Models (Onnx Backend) ==========

        // SenseVoice Small - Chinese/Cantonese optimized with emotion detection
        // ONNX版本不支持流式转录和翻译
        ModelPreset::asr_preset(
            "sensevoice-small".to_string(),
            "SenseVoice Small".to_string(),
            "229MB".to_string(),
            BackendType::Onnx,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/sensevoice-small/resolve/main/sensevoice-small.zip".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/sensevoice-small/resolve/main/sensevoice-small.zip".to_string(),
                    is_china_accessible: false,
                    priority: 2,
                },
            ],
            vec!["zh".to_string(), "zh-yue".to_string(), "en".to_string(), "ja".to_string(), "ko".to_string()],
            Some("中文/粤语识别优于 Whisper，支持情绪识别".to_string()),
            Some(true),  // supports_auto_detect: SenseVoice supports automatic language detection
            Some(false), // supports_streaming: ONNX version does not support streaming
            Some(false), // supports_translation: SenseVoice does not support translation to English
        ),

        // Parakeet V3 - NVIDIA high-speed ASR for European languages
        // ONNX版本支持流式转录
        ModelPreset::asr_preset(
            "parakeet-v3".to_string(),
            "Parakeet V3".to_string(),
            "640MB".to_string(),
            BackendType::Onnx,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/parakeet-v3/resolve/main/parakeet-v3.zip".to_string(),
                    is_china_accessible: true,
                    priority: 1,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly/parakeet-v3/resolve/main/parakeet-v3.zip".to_string(),
                    is_china_accessible: false,
                    priority: 2,
                },
            ],
            vec!["en".to_string(), "fr".to_string(), "es".to_string(), "de".to_string(), "it".to_string(), "pt".to_string(), "nl".to_string(), "bg".to_string(), "hr".to_string(), "cs".to_string(), "da".to_string(), "et".to_string(), "fi".to_string(), "el".to_string(), "hu".to_string(), "lv".to_string(), "lt".to_string(), "mt".to_string(), "pl".to_string(), "ro".to_string(), "sk".to_string(), "sl".to_string(), "sv".to_string(), "ru".to_string(), "uk".to_string()],
            Some("NVIDIA 高速语音识别，平均 WER 6.05%，支持25种欧洲语言".to_string()),
            Some(false), // supports_auto_detect: Parakeet does NOT support automatic language detection
            Some(true),  // supports_streaming: Parakeet ONNX version supports streaming
            Some(false), // supports_translation: Parakeet does not support translation to English
        ),
    ]
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
        assert!(qwen3.supports_streaming == Some(true));

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
