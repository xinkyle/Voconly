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
use std::collections::HashMap;

pub use asr::get_asr_presets;
pub use asr_scanner::scan_available_asr_models;
pub use llm::get_llm_presets;

// Re-export get_base_model_id from utils for convenience
pub use crate::utils::get_base_model_id;

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
/// - `n_gpu_layers`: GPU layer count for local models (-1 = all layers)
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

    // Model quality metrics (user-friendly)
    /// Accuracy score (0.0-1.0, higher is better)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accuracy_score: Option<f32>,
    /// Speed score (0.0-1.0, higher is faster)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_score: Option<f32>,

    // LLM-specific fields (None for ASR models)
    /// GPU layer count for local models (-1 = all layers, 0 = CPU only)
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

    /// Actual filename for GGUF models (e.g., "Qwen3-ASR-1.7B-Q5_K_M.gguf")
    /// Only used for GGUF models with quantization variants
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,

    /// Quantization version (e.g., "Q5_K_M", "Q8_0")
    /// Only used for GGUF models with quantization variants
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quant: Option<String>,

    /// Downloaded quantization versions (from filesystem scan)
    /// Contains all quant variants found on disk for this model base ID
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub downloaded_quants: Vec<String>,

    /// Currently active quantization version
    /// Used for switching between downloaded variants
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_quant: Option<String>,

    /// Mapping from quantization version to file path
    /// key: quantization version (e.g., "Q8_0")
    /// value: model file path
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub quant_paths: HashMap<String, String>,
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
        accuracy_score: Option<f32>,
        speed_score: Option<f32>,
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
            accuracy_score,
            speed_score,
            n_gpu_layers: None,
            n_ctx: None,
            recommended: None,
            path: None,
            filename: None,
            quant: None,
            downloaded_quants: Vec::new(),
            active_quant: None,
            quant_paths: HashMap::new(),
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
        accuracy_score: Option<f32>,
        speed_score: Option<f32>,
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
            accuracy_score,
            speed_score,
            n_gpu_layers: None,
            n_ctx: None,
            recommended: None,
            path,
            filename: None,
            quant: None,
            downloaded_quants: Vec::new(),
            active_quant: None,
            quant_paths: HashMap::new(),
        }
    }

    /// Create an ASR model preset with filename and quantization
    pub fn asr_preset_with_filename(
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
        accuracy_score: Option<f32>,
        speed_score: Option<f32>,
        path: Option<String>,
        filename: String,
        quant: String,
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
            accuracy_score,
            speed_score,
            n_gpu_layers: None,
            n_ctx: None,
            recommended: None,
            path,
            filename: Some(filename),
            quant: Some(quant),
            downloaded_quants: Vec::new(),
            active_quant: None,
            quant_paths: HashMap::new(),
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
            accuracy_score: None,
            speed_score: None,
            n_gpu_layers: Some(n_gpu_layers),
            n_ctx: Some(n_ctx),
            recommended: Some(recommended),
            path: None,
            filename: None,
            quant: None,
            downloaded_quants: Vec::new(),
            active_quant: None,
            quant_paths: HashMap::new(),
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
            accuracy_score: None,
            speed_score: None,
            n_gpu_layers: Some(n_gpu_layers),
            n_ctx: Some(n_ctx),
            recommended: Some(recommended),
            path: None,
            filename: None,
            quant: None,
            downloaded_quants: Vec::new(),
            active_quant: None,
            quant_paths: HashMap::new(),
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

/// Get the backend type for a model (unified entry point)
///
/// Detection order:
/// 1. Exact match in ASR presets (case-insensitive)
/// 2. Base name match in ASR presets (removing quantization suffix, case-insensitive)
/// 3. LLM models default to TranscribeCpp (GGUF format)
/// 4. Unknown models: detect from file extension (.onnx → Onnx, others → TranscribeCpp)
pub fn get_model_backend(model_id: &str) -> BackendType {
    // Check ASR presets - exact match (case-insensitive)
    let model_id_lower = model_id.to_lowercase();
    for preset in get_asr_presets() {
        if preset.id.to_lowercase() == model_id_lower {
            if let Some(backend) = preset.backend {
                return backend;
            }
        }
    }

    // Check ASR presets - base name match (for different quantization variants, case-insensitive)
    let base_id = get_base_model_id(model_id);
    for preset in get_asr_presets() {
        let preset_base = get_base_model_id(&preset.id);
        if preset_base == base_id {
            if let Some(backend) = preset.backend {
                log::debug!(
                    "[get_model_backend] Matched '{}' to preset '{}' via base name '{}'",
                    model_id, preset.id, base_id
                );
                return backend;
            }
        }
    }

    // LLM models use TranscribeCpp backend (GGUF format)
    if is_llm_model(model_id) {
        return BackendType::TranscribeCpp;
    }

    // Unknown model: detect from file extension
    if model_id.contains(".onnx") {
        BackendType::Onnx
    } else {
        BackendType::TranscribeCpp
    }
}

/// Check if a model is an ASR model (exact match)
pub fn is_asr_model(model_id: &str) -> bool {
    get_asr_presets().iter().any(|p| p.id == model_id)
}

/// Check if a model is GGUF format (exact match first)
pub fn is_gguf_model(model_id: &str) -> bool {
    let backend = get_model_backend(model_id);
    backend == BackendType::TranscribeCpp
}

/// Check if a model is ONNX format (exact match first)
pub fn is_onnx_model(model_id: &str) -> bool {
    let backend = get_model_backend(model_id);
    backend == BackendType::Onnx
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
            Some(0.90),  // accuracy_score
            Some(0.85),  // speed_score
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
            Some(0.90),  // accuracy_score
            Some(0.85),  // speed_score
        );

        // Serialize to JSON
        let json = serde_json::to_string(&preset).expect("Serialization failed");

        // Should contain ASR-specific fields but not LLM-specific fields
        assert!(json.contains("\"backend\":\"Onnx\""));
        assert!(json.contains("\"languages\""));
        // Note: field names are in camelCase due to serde(rename_all = "camelCase")
        assert!(json.contains("\"supportsAutoDetect\":true"));
        assert!(json.contains("\"supportsStreaming\":false"));
        assert!(json.contains("\"supportsTranslation\":false"));
        assert!(!json.contains("\"nGpuLayers\""));
        assert!(!json.contains("\"nCtx\""));
        assert!(!json.contains("\"recommended\""));
        // Should not contain GGUF-specific fields (filename, quant)
        assert!(!json.contains("\"filename\""));
        assert!(!json.contains("\"quant\""));
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
        // Note: field names are in camelCase due to serde(rename_all = "camelCase")
        assert!(json.contains("\"nGpuLayers\":-1"));
        assert!(json.contains("\"nCtx\":4096"));
        assert!(json.contains("\"recommended\":false"));
        assert!(!json.contains("\"backend\""));
        assert!(!json.contains("\"languages\""));
        // Should not contain GGUF-specific fields (filename, quant)
        assert!(!json.contains("\"filename\""));
        assert!(!json.contains("\"quant\""));
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
            "modelType": "llm",
            "nGpuLayers": 0,
            "nCtx": 4096,
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

    #[test]
    fn test_base_model_id_extraction() {
        // Test quantization suffix stripping (uppercase)
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-Q5_K_M"),
            "parakeet-unified-en-0.6b"
        );
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-F16"),
            "parakeet-unified-en-0.6b"
        );
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-Q6_K"),
            "parakeet-unified-en-0.6b"
        );
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-Q8_0"),
            "parakeet-unified-en-0.6b"
        );
        // Test lowercase quantization suffix
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-q5_k_m"),
            "parakeet-unified-en-0.6b"
        );
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-f16"),
            "parakeet-unified-en-0.6b"
        );
        // With file extension
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-F16.gguf"),
            "parakeet-unified-en-0.6b"
        );
        assert_eq!(
            get_base_model_id("parakeet-unified-en-0.6b-f16.gguf"),
            "parakeet-unified-en-0.6b"
        );
        // Model without quantization suffix
        assert_eq!(
            get_base_model_id("sensevoice-small"),
            "sensevoice-small"
        );
        // qwen with lowercase
        assert_eq!(
            get_base_model_id("qwen3-asr-1.7b-q4_0"),
            "qwen3-asr-1.7b"
        );
        // qwen with uppercase (now returns lowercase for case-insensitive matching)
        assert_eq!(
            get_base_model_id("Qwen3-ASR-1.7B-Q4_0"),
            "qwen3-asr-1.7b"
        );
    }

    #[test]
    fn test_get_model_backend_base_name_match() {
        // Should match parakeet-unified-en-0.6b-F16 to parakeet-unified-en-0.6b-Q5_K_M preset
        let backend = get_model_backend("parakeet-unified-en-0.6b-F16");
        assert_eq!(backend, BackendType::TranscribeCpp);

        // Should match parakeet-unified-en-0.6b-F16.gguf to preset
        let backend = get_model_backend("parakeet-unified-en-0.6b-F16.gguf");
        assert_eq!(backend, BackendType::TranscribeCpp);
    }

    #[test]
    fn test_is_gguf_model_with_base_name_match() {
        // parakeet-unified-en-0.6b-F16 should be detected as GGUF
        // because its base name matches parakeet-unified-en-0.6b-Q5_K_M preset
        assert!(is_gguf_model("parakeet-unified-en-0.6b-F16"));
        assert!(is_gguf_model("parakeet-unified-en-0.6b-F16.gguf"));
    }
}
