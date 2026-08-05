//! Model catalog loaded from JSON configuration
//!
//! Provides model metadata including benchmark scores from `catalog.json`.
//! Scores are stored as 0-100 and converted to 0.0-1.0 for UI display.

use crate::utils::get_base_model_id;
use once_cell::sync::Lazy;
use serde::Deserialize;

/// Root catalog structure
#[derive(Deserialize)]
struct CatalogRoot {
    models: Vec<CatalogModel>,
}

/// Single model entry in the catalog
#[derive(Deserialize, Debug)]
pub struct CatalogModel {
    pub id: String,
    pub name: String,
    pub architecture: Option<String>,
    pub backend: Option<String>, // Backend type: Onnx or TranscribeCpp
    pub languages: Vec<String>,
    pub capabilities: CatalogCapabilities,
    /// Speed score (0-100, higher = faster)
    pub speed_score: Option<u32>,
    /// Accuracy score (0-100, higher = more accurate)
    pub accuracy_score: Option<u32>,
    pub description: Option<String>,
    pub size: Option<String>,
    pub download_urls: Option<Vec<DownloadSource>>,
    pub files: Option<Vec<CatalogFile>>, // GGUF multi-quantization variants
    pub default_quant: Option<String>,   // Default quantization version
}

/// Model capabilities
#[derive(Deserialize, Debug)]
pub struct CatalogCapabilities {
    pub streaming: bool,
    pub translate: bool,
    pub lang_detect: bool,
}

/// Download source for model downloads
#[derive(Deserialize, Debug, Clone)]
pub struct DownloadSource {
    pub name: String,
    pub url: String,
    pub is_china_accessible: bool,
    pub priority: u8,
}

/// GGUF file variant (for multi-quantization support)
#[derive(Deserialize, Debug, Clone)]
pub struct CatalogFile {
    pub filename: String,
    pub quant: String,
    pub size_bytes: u64,
}

/// Global catalog instance (loaded once at startup)
pub static CATALOG: Lazy<Vec<CatalogModel>> = Lazy::new(|| {
    let root: CatalogRoot = serde_json::from_str(include_str!("catalog.json"))
        .expect("catalog.json should be valid JSON");
    root.models
});

/// Find a model by ID (exact match only)
pub fn find_model(id: &str) -> Option<&CatalogModel> {
    CATALOG.iter().find(|m| m.id == id)
}

/// Find a model by ID, with fallback to base model ID.
///
/// First tries exact match, then tries matching with base model ID
/// (quantization suffix removed).
fn find_model_with_fallback(id: &str) -> Option<&CatalogModel> {
    // Try exact match first
    if let Some(model) = find_model(id) {
        return Some(model);
    }

    // Try base model ID match
    let base_id = get_base_model_id(id);
    CATALOG.iter().find(|m| m.id.to_lowercase() == base_id)
}

/// Get speed score (0-100 → 0.0-1.0)
///
/// Automatically extracts base model ID for matching.
/// E.g., "sensevoice-small-q8" will match "sensevoice-small" in catalog.
pub fn get_speed_score(id: &str) -> Option<f32> {
    find_model_with_fallback(id).and_then(|m| m.speed_score.map(|s| s as f32 / 100.0))
}

/// Get accuracy score (0-100 → 0.0-1.0)
///
/// Automatically extracts base model ID for matching.
/// E.g., "sensevoice-small-q8" will match "sensevoice-small" in catalog.
pub fn get_accuracy_score(id: &str) -> Option<f32> {
    find_model_with_fallback(id).and_then(|m| m.accuracy_score.map(|a| a as f32 / 100.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_loads_successfully() {
        assert!(!CATALOG.is_empty(), "catalog should contain models");
    }

    #[test]
    fn scores_are_valid() {
        for model in CATALOG.iter() {
            if let Some(speed) = model.speed_score {
                assert!((0..=100).contains(&speed), "speed_score should be 0-100");
            }
            if let Some(acc) = model.accuracy_score {
                assert!((0..=100).contains(&acc), "accuracy_score should be 0-100");
            }
        }
    }

    #[test]
    fn can_find_models() {
        assert!(find_model("Qwen3-ASR-1.7B-Q5_K_M").is_some());
        assert!(find_model("cohere-transcribe-03-2026-Q5_K_M").is_some());
    }

    #[test]
    fn score_conversion_works() {
        // Qwen3-ASR should have speed 63 and accuracy 87
        assert_eq!(get_speed_score("Qwen3-ASR-1.7B-Q5_K_M"), Some(0.63));
        assert_eq!(get_accuracy_score("Qwen3-ASR-1.7B-Q5_K_M"), Some(0.87));
    }

    #[test]
    fn score_lookup_with_quant_suffix() {
        // sensevoice-small-q8 should match sensevoice-small
        assert_eq!(get_speed_score("sensevoice-small-q8"), Some(0.85));
        assert_eq!(get_accuracy_score("sensevoice-small-q8"), Some(0.90));

        // Qwen3-ASR with different quant should match
        assert_eq!(get_speed_score("Qwen3-ASR-1.7B-Q8_0"), Some(0.63));
        assert_eq!(get_accuracy_score("Qwen3-ASR-1.7B-q4"), Some(0.87));

        // Unknown model should return None
        assert_eq!(get_speed_score("unknown-model-q8"), None);
        assert_eq!(get_accuracy_score("unknown-model-q8"), None);
    }

    #[test]
    fn deserialize_new_fields() {
        // Test deserialization with new fields (backend, size, download_urls, files, default_quant)
        let json_data = r#"{
            "id": "test-model",
            "name": "Test Model",
            "backend": "TranscribeCpp",
            "languages": ["zh", "en"],
            "capabilities": {
                "streaming": true,
                "translate": false,
                "lang_detect": true
            },
            "size": "1.7B",
            "download_urls": [
                {
                    "name": "HuggingFace",
                    "url": "https://huggingface.co/test/model",
                    "is_china_accessible": false,
                    "priority": 1
                }
            ],
            "files": [
                {
                    "filename": "model-q5_k_m.gguf",
                    "quant": "Q5_K_M",
                    "size_bytes": 1700000000
                }
            ],
            "default_quant": "Q5_K_M",
            "speed_score": 85,
            "accuracy_score": 90
        }"#;

        let model: CatalogModel =
            serde_json::from_str(json_data).expect("Should deserialize model with new fields");

        assert_eq!(model.id, "test-model");
        assert_eq!(model.backend, Some("TranscribeCpp".to_string()));
        assert_eq!(model.size, Some("1.7B".to_string()));
        assert!(model.download_urls.is_some());
        assert!(model.files.is_some());
        assert_eq!(model.default_quant, Some("Q5_K_M".to_string()));

        let urls = model.download_urls.unwrap();
        assert_eq!(urls.len(), 1);
        assert_eq!(urls[0].name, "HuggingFace");
        assert_eq!(urls[0].priority, 1);

        let files = model.files.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].quant, "Q5_K_M");
        assert_eq!(files[0].size_bytes, 1700000000);
    }

    #[test]
    fn backward_compatibility() {
        // Test that models without new fields still work
        let json_data = r#"{
            "id": "legacy-model",
            "name": "Legacy Model",
            "languages": ["zh"],
            "capabilities": {
                "streaming": false,
                "translate": false,
                "lang_detect": true
            }
        }"#;

        let model: CatalogModel = serde_json::from_str(json_data)
            .expect("Should deserialize legacy model without new fields");

        assert_eq!(model.id, "legacy-model");
        assert_eq!(model.backend, None);
        assert_eq!(model.size, None);
        assert!(model.download_urls.is_none());
        assert!(model.files.is_none());
        assert_eq!(model.default_quant, None);
    }
}
