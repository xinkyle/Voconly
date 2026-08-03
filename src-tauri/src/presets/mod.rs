//! Unified Model Presets Module
//!
//! This module provides a unified `ModelPreset` structure that can represent both
//! ASR (Automatic Speech Recognition) and LLM (Large Language Model) presets.
//!
//! The design uses `Option<>` for backend-specific fields so one struct can
//! represent both types, maintaining backward compatibility with existing JSON configs.

mod asr;
mod asr_scanner;
mod llm;

use crate::backends::BackendType;
use serde::{Deserialize, Serialize};

pub use asr::get_asr_presets;
pub use asr_scanner::scan_available_asr_models;
pub use llm::get_llm_presets;

/// Download source information for model downloads
/// Unified structure used by both ASR and LLM models
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSourceInfo {
    /// Source name (e.g., "HuggingFace", "ModelScope", "HF-Mirror")
    pub name: String,
    /// Download URL
    pub url: String,
    /// Whether the source is accessible from China
    pub is_china_accessible: bool,
    /// Priority for source selection (lower = higher priority)
    pub priority: u8,
}

/// Model type enum to distinguish between ASR and LLM models
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelType {
    /// ASR (Automatic Speech Recognition) model
    Asr,
    /// LLM (Large Language Model) model
    Llm,
}

/// Unified model preset structure for both ASR and LLM models
///
/// This structure uses `Option<>` for backend-specific fields to support
/// both ASR and LLM presets in a single type while maintaining backward
/// compatibility with existing JSON serialization.
///
/// # Common Fields (all models)
/// - `id`: Unique identifier (used for filename/storage)
/// - `name`: Display name
/// - `size`: Size description (e.g., "75MB", "~2.5GB")
/// - `description`: Model description
/// - `download_urls`: Available download sources
/// - `model_type`: ASR or LLM type
///
/// # ASR-specific Fields (None for LLM models)
/// - `backend`: Backend type (Onnx/TranscribeCpp)
/// - `languages`: Supported language codes
/// - `supports_auto_detect`: Whether the model supports automatic language detection
///
/// # LLM-specific Fields (None for ASR models)
/// - `n_gpu_layers`: GPU layer count for llama.cpp (-1 = all layers)
/// - `n_ctx`: Context window size
/// - `recommended`: Whether this model is recommended
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreset {
    /// Unique preset ID (used for download filename, without extension)
    pub id: String,
    /// Display name
    pub name: String,
    /// File size description (e.g., "75MB", "~2.5GB")
    pub size: String,
    /// Model description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Available download sources
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub download_urls: Vec<DownloadSourceInfo>,
    /// Model type (ASR or LLM)
    #[serde(default = "default_model_type_asr")]
    pub model_type: ModelType,

    // ASR-specific fields (None for LLM models)
    /// Backend type for ASR models (Onnx/TranscribeCpp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend: Option<BackendType>,
    /// Supported language codes (ASR only)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub languages: Vec<String>,
    /// Whether the model supports automatic language detection (ASR only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_auto_detect: Option<bool>,
    /// Whether the model supports streaming transcription (ASR only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_streaming: Option<bool>,
    /// Whether the model supports translation to English (ASR only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_translation: Option<bool>,

    // LLM-specific fields (None for ASR models)
    /// GPU layer count for llama.cpp (-1 = all layers, 0 = CPU only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_gpu_layers: Option<i32>,
    /// Context window size
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n_ctx: Option<u32>,
    /// Whether this model is recommended
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended: Option<bool>,

    /// Model file/directory path (set by scanner for discovered models)
    /// 扫描发现的模型实际路径（包括自定义目录中的模型）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

fn default_model_type_asr() -> ModelType {
    ModelType::Asr
}

impl ModelPreset {
    /// Create an ASR model preset
    pub fn asr_preset(
        id: String,
        name: String,
        size: String,
        backend: BackendType,
        download_urls: Vec<DownloadSourceInfo>,
        languages: Vec<String>,
        description: Option<String>,
        supports_auto_detect: Option<bool>,
        supports_streaming: Option<bool>,
        supports_translation: Option<bool>,
    ) -> Self {
        Self {
            id,
            name,
            size,
            description,
            download_urls,
            model_type: ModelType::Asr,
            backend: Some(backend),
            languages,
            supports_auto_detect,
            supports_streaming,
            supports_translation,
            n_gpu_layers: None,
            n_ctx: None,
            recommended: None,
            path: None,
        }
    }

    /// Create an ASR model preset with path
    pub fn asr_preset_with_path(
        id: String,
        name: String,
        size: String,
        backend: BackendType,
        download_urls: Vec<DownloadSourceInfo>,
        languages: Vec<String>,
        description: Option<String>,
        supports_auto_detect: Option<bool>,
        supports_streaming: Option<bool>,
        supports_translation: Option<bool>,
        path: Option<String>,
    ) -> Self {
        Self {
            id,
            name,
            size,
            description,
            download_urls,
            model_type: ModelType::Asr,
            backend: Some(backend),
            languages,
            supports_auto_detect,
            supports_streaming,
            supports_translation,
            n_gpu_layers: None,
            n_ctx: None,
            recommended: None,
            path,
        }
    }

    /// Create an LLM model preset
    pub fn llm_preset(
        id: String,
        name: String,
        size: String,
        download_urls: Vec<DownloadSourceInfo>,
        n_gpu_layers: i32,
        n_ctx: u32,
        recommended: bool,
    ) -> Self {
        let description = format!("LLM model: {}", name);
        Self {
            id,
            name,
            size,
            description: Some(description),
            download_urls,
            model_type: ModelType::Llm,
            backend: None,
            languages: Vec::new(),
            supports_auto_detect: None,
            supports_streaming: None,
            supports_translation: None,
            n_gpu_layers: Some(n_gpu_layers),
            n_ctx: Some(n_ctx),
            recommended: Some(recommended),
            path: None,
        }
    }

    /// Create an LLM model preset with full description
    pub fn llm_preset_with_description(
        id: String,
        name: String,
        size: String,
        description: String,
        download_urls: Vec<DownloadSourceInfo>,
        n_gpu_layers: i32,
        n_ctx: u32,
        recommended: bool,
    ) -> Self {
        Self {
            id,
            name,
            size,
            description: Some(description),
            download_urls,
            model_type: ModelType::Llm,
            backend: None,
            languages: Vec::new(),
            supports_auto_detect: None,
            supports_streaming: None,
            supports_translation: None,
            n_gpu_layers: Some(n_gpu_layers),
            n_ctx: Some(n_ctx),
            recommended: Some(recommended),
            path: None,
        }
    }

    /// Check if this is an ASR model preset
    pub fn is_asr(&self) -> bool {
        self.model_type == ModelType::Asr
    }

    /// Check if this is an LLM model preset
    pub fn is_llm(&self) -> bool {
        self.model_type == ModelType::Llm
    }

    /// Get backend type (only valid for ASR models)
    pub fn get_backend(&self) -> Option<BackendType> {
        self.backend
    }
}

/// Get all presets (both ASR and LLM)
pub fn get_all_presets() -> Vec<ModelPreset> {
    let mut presets = Vec::new();
    presets.extend(get_asr_presets());
    presets.extend(get_llm_presets());
    presets
}

/// Find a preset by ID
pub fn find_preset_by_id(id: &str) -> Option<ModelPreset> {
    get_all_presets().iter().find(|p| p.id == id).cloned()
}

/// Find ASR preset by ID
pub fn find_asr_preset_by_id(id: &str) -> Option<ModelPreset> {
    get_asr_presets().iter().find(|p| p.id == id).cloned()
}

/// Find LLM preset by ID
pub fn find_llm_preset_by_id(id: &str) -> Option<ModelPreset> {
    get_llm_presets().iter().find(|p| p.id == id).cloned()
}

/// Check if a model ID refers to a LLM model
/// Uses preset definitions as the authoritative source for model type classification
/// Returns true only if the model is defined in LLM presets, false otherwise
pub fn is_llm_model(model_id: &str) -> bool {
    // Only models in LLM presets are treated as LLM models
    let llm_presets = get_llm_presets();
    llm_presets.iter().any(|p| p.id == model_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asr_preset_creation() {
        let preset = ModelPreset::asr_preset(
            "sensevoice-small".to_string(),
            "SenseVoice Small".to_string(),
            "229MB".to_string(),
            BackendType::Onnx,
            vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/savagexy23/sensevoice/resolve/main/sensevoice-small.zip".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
            ],
            vec!["zh".to_string(), "en".to_string()],
            Some("Chinese/Cantonese optimized".to_string()),
            Some(true),  // supports_auto_detect
            Some(false), // supports_streaming
            Some(false), // supports_translation
        );

        assert!(preset.is_asr());
        assert!(!preset.is_llm());
        assert_eq!(preset.id, "sensevoice-small");
        assert_eq!(preset.backend, Some(BackendType::Onnx));
        assert!(preset.languages.contains(&"zh".to_string()));
        assert!(preset.n_gpu_layers.is_none());
        assert_eq!(preset.supports_auto_detect, Some(true));
        assert_eq!(preset.supports_streaming, Some(false));
        assert_eq!(preset.supports_translation, Some(false));
    }

    #[test]
    fn test_llm_preset_creation() {
        let preset = ModelPreset::llm_preset_with_description(
            "qwen2.5-1.5b-instruct-q4_0".to_string(),
            "Qwen2.5-1.5B-Instruct Q4_0".to_string(),
            "~934MB".to_string(),
            "Qwen 1.5B instruct model".to_string(),
            vec![
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
            ],
            0,
            4096,
            true,
        );

        assert!(!preset.is_asr());
        assert!(preset.is_llm());
        assert_eq!(preset.id, "qwen2.5-1.5b-instruct-q4_0");
        assert!(preset.backend.is_none());
        assert_eq!(preset.n_gpu_layers, Some(0));
        assert_eq!(preset.n_ctx, Some(4096));
        assert_eq!(preset.recommended, Some(true));
    }

    #[test]
    fn test_asr_preset_serialization() {
        let preset = ModelPreset::asr_preset(
            "sensevoice-small".to_string(),
            "SenseVoice Small".to_string(),
            "229MB".to_string(),
            BackendType::Onnx,
            vec![DownloadSourceInfo {
                name: "ModelScope".to_string(),
                url: "https://modelscope.cn/test".to_string(),
                is_china_accessible: true,
                priority: 0,
            }],
            vec!["zh".to_string()],
            Some("Test description".to_string()),
            Some(true),  // supports_auto_detect
            Some(false), // supports_streaming
            Some(false), // supports_translation
        );

        // Serialize to JSON
        let json = serde_json::to_string(&preset).expect("Serialization failed");

        // Should contain ASR-specific fields but not LLM-specific fields
        assert!(json.contains("\"backend\":\"Onnx\""));
        assert!(json.contains("\"languages\""));
        assert!(json.contains("\"supports_auto_detect\":true"));
        assert!(json.contains("\"supports_streaming\":false"));
        assert!(json.contains("\"supports_translation\":false"));
        assert!(!json.contains("\"n_gpu_layers\""));
        assert!(!json.contains("\"n_ctx\""));
        assert!(!json.contains("\"recommended\""));
    }

    #[test]
    fn test_llm_preset_serialization() {
        let preset = ModelPreset::llm_preset_with_description(
            "test-llm".to_string(),
            "Test LLM".to_string(),
            "1GB".to_string(),
            "Test description".to_string(),
            vec![],
            -1,
            4096,
            false,
        );

        // Serialize to JSON
        let json = serde_json::to_string(&preset).expect("Serialization failed");

        // Should contain LLM-specific fields but not ASR-specific fields
        assert!(json.contains("\"n_gpu_layers\":-1"));
        assert!(json.contains("\"n_ctx\":4096"));
        assert!(json.contains("\"recommended\":false"));
        assert!(!json.contains("\"backend\""));
        assert!(!json.contains("\"languages\""));
    }

    #[test]
    fn test_asr_preset_deserialization() {
        let json = r#"{
            "id": "sensevoice-small",
            "name": "SenseVoice Small",
            "size": "229MB",
            "description": "Chinese optimized",
            "download_urls": [
                {
                    "name": "ModelScope",
                    "url": "https://modelscope.cn/test",
                    "is_china_accessible": true,
                    "priority": 0
                }
            ],
            "model_type": "asr",
            "backend": "Onnx",
            "languages": ["zh", "en"]
        }"#;

        let preset: ModelPreset = serde_json::from_str(json).expect("Deserialization failed");

        assert!(preset.is_asr());
        assert_eq!(preset.id, "sensevoice-small");
        assert_eq!(preset.backend, Some(BackendType::Onnx));
        assert_eq!(preset.languages, vec!["zh".to_string(), "en".to_string()]);
        assert!(preset.n_gpu_layers.is_none());
    }

    #[test]
    fn test_llm_preset_deserialization() {
        let json = r#"{
            "id": "qwen2.5-1.5b-instruct-q4_0",
            "name": "Qwen2.5-1.5B-Instruct Q4_0",
            "size": "~934MB",
            "description": "Qwen 1.5B instruct",
            "download_urls": [],
            "model_type": "llm",
            "n_gpu_layers": 0,
            "n_ctx": 4096,
            "recommended": true
        }"#;

        let preset: ModelPreset = serde_json::from_str(json).expect("Deserialization failed");

        assert!(preset.is_llm());
        assert_eq!(preset.id, "qwen2.5-1.5b-instruct-q4_0");
        assert!(preset.backend.is_none());
        assert_eq!(preset.n_gpu_layers, Some(0));
        assert_eq!(preset.n_ctx, Some(4096));
        assert_eq!(preset.recommended, Some(true));
        assert!(preset.languages.is_empty());
    }

    #[test]
    fn test_backward_compatibility_asr_without_model_type() {
        // Test that ASR presets without model_type field still deserialize correctly
        // (default is ASR)
        let json = r#"{
            "id": "sensevoice-small",
            "name": "SenseVoice Small",
            "size": "236MB",
            "backend": "Onnx",
            "languages": ["zh"]
        }"#;

        let preset: ModelPreset = serde_json::from_str(json).expect("Deserialization failed");

        assert!(preset.is_asr());
        assert_eq!(preset.model_type, ModelType::Asr);
    }

    #[test]
    fn test_find_preset_by_id() {
        // Should find at least one ASR preset
        let asr_preset = find_asr_preset_by_id("sensevoice-small");
        assert!(asr_preset.is_some());
        assert!(asr_preset.unwrap().is_asr());

        // Should find at least one LLM preset
        let llm_preset = find_llm_preset_by_id("Qwen3-4B-Instruct-2507-Q4_K_M");
        assert!(llm_preset.is_some());
        assert!(llm_preset.unwrap().is_llm());
    }
}
