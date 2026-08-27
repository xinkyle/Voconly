//! LLM Model Presets
//!
//! Hardcoded presets for LLM (Large Language Model) GGUF models.
//! These presets define the available models for download and their recommended settings.

use super::{DownloadSourceInfo, ModelPreset};

/// Get all LLM model presets
///
/// Returns a list of hardcoded LLM model presets (GGUF format) that the application supports.
/// These models are used for text post-processing and other LLM tasks.
pub fn get_llm_presets() -> Vec<ModelPreset> {
    vec![
        // Qwen3.5-9B Q4_K_M - GPU supported
        ModelPreset::llm_preset_with_description(
            "Qwen3.5-9B-Q4_K_M".to_string(),
            "Qwen3.5-9B Q4_K_M".to_string(),
            "~5.7GB".to_string(),
            "通义千问3.5 9B 模型，Q4_K_M量化，支持GPU加速".to_string(),
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/Qwen3.5-9B-Q4_K_M-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly-org/Qwen3.5-9B-Q4_K_M-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            -1,  // All layers to GPU
            4096,
            false,
        ),
        // Qwen3-4B-Instruct-2507 Q4_K_M - Recommended for GPU
        ModelPreset::llm_preset_with_description(
            "Qwen3-4B-Instruct-2507-Q4_K_M".to_string(),
            "Qwen3-4B-Instruct-2507 Q4_K_M".to_string(),
            "~2.5GB".to_string(),
            "通义千问3 4B 指令模型，Q4_K_M量化，支持GPU加速".to_string(),
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly-org/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            -1,  // All layers to GPU
            4096,
            true,
        ),
    ]
}

/// Get recommended LLM presets
pub fn get_recommended_llm_presets() -> Vec<ModelPreset> {
    get_llm_presets()
        .iter()
        .filter(|p| p.recommended == Some(true))
        .cloned()
        .collect()
}

/// Get GPU-recommended LLM presets (n_gpu_layers = -1)
pub fn get_gpu_llm_presets() -> Vec<ModelPreset> {
    get_llm_presets()
        .iter()
        .filter(|p| p.n_gpu_layers == Some(-1))
        .cloned()
        .collect()
}

/// Get CPU-only LLM presets (n_gpu_layers = 0)
pub fn get_cpu_llm_presets() -> Vec<ModelPreset> {
    get_llm_presets()
        .iter()
        .filter(|p| p.n_gpu_layers == Some(0))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::presets::ModelType;

    #[test]
    fn test_llm_presets_count() {
        let presets = get_llm_presets();
        // Should have 2 LLM presets
        assert_eq!(presets.len(), 2);
    }

    #[test]
    fn test_all_llm_presets_have_correct_type() {
        let presets = get_llm_presets();
        for preset in &presets {
            assert!(preset.is_llm());
            assert!(!preset.is_asr());
            assert!(preset.backend.is_none());
            assert!(preset.languages.is_empty());
        }
    }

    #[test]
    fn test_all_llm_presets_have_llm_fields() {
        let presets = get_llm_presets();
        for preset in &presets {
            assert!(preset.n_gpu_layers.is_some());
            assert!(preset.n_ctx.is_some());
            assert!(preset.recommended.is_some());
        }
    }

    #[test]
    fn test_recommended_presets() {
        let recommended = get_recommended_llm_presets();
        // Should have 1 recommended preset (Qwen3-4B)
        assert_eq!(recommended.len(), 1);

        for preset in &recommended {
            assert_eq!(preset.recommended, Some(true));
        }
    }

    #[test]
    fn test_gpu_presets() {
        let gpu_presets = get_gpu_llm_presets();
        // Both models use GPU (-1)
        assert_eq!(gpu_presets.len(), 2);
        for preset in &gpu_presets {
            assert_eq!(preset.n_gpu_layers, Some(-1));
        }
    }

    #[test]
    fn test_cpu_presets() {
        let cpu_presets = get_cpu_llm_presets();
        // No presets use CPU (0)
        assert_eq!(cpu_presets.len(), 0);
    }

    #[test]
    fn test_llm_preset_serialization_roundtrip() {
        let presets = get_llm_presets();
        for preset in &presets {
            let json = serde_json::to_string(preset).expect("Serialization failed");
            let decoded: ModelPreset = serde_json::from_str(&json).expect("Deserialization failed");
            assert_eq!(decoded.id, preset.id);
            assert_eq!(decoded.model_type, ModelType::Llm);
            assert_eq!(decoded.n_gpu_layers, preset.n_gpu_layers);
            assert_eq!(decoded.n_ctx, preset.n_ctx);
            assert_eq!(decoded.recommended, preset.recommended);
        }
    }

    #[test]
    fn test_llm_presets_have_download_urls() {
        let presets = get_llm_presets();
        for preset in &presets {
            assert!(preset.download_urls.len() >= 2);
        }
    }

    #[test]
    fn test_qwen3_has_both_sources() {
        let presets = get_llm_presets();
        let qwen3 = presets
            .iter()
            .find(|p| p.id == "Qwen3-4B-Instruct-2507-Q4_K_M");

        assert!(qwen3.is_some());
        let qwen3 = qwen3.unwrap();
        assert_eq!(qwen3.download_urls.len(), 2);

        // Check ModelScope is China accessible
        let modelscope = qwen3.download_urls.iter().find(|s| s.name == "ModelScope");
        assert!(modelscope.is_some());
        assert!(modelscope.unwrap().is_china_accessible);
    }

    #[test]
    fn test_qwen35_has_both_sources() {
        let presets = get_llm_presets();
        let qwen35 = presets
            .iter()
            .find(|p| p.id == "Qwen3.5-9B-Q4_K_M");

        assert!(qwen35.is_some());
        let qwen35 = qwen35.unwrap();
        assert_eq!(qwen35.download_urls.len(), 2);

        // Check ModelScope is China accessible
        let modelscope = qwen35.download_urls.iter().find(|s| s.name == "ModelScope");
        assert!(modelscope.is_some());
        assert!(modelscope.unwrap().is_china_accessible);
    }
}
