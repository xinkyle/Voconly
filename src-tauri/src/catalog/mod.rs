//! Model catalog loaded from JSON configuration
//!
//! Provides model metadata including benchmark scores from `catalog.json`.
//! Scores are stored as 0-100 and converted to 0.0-1.0 for UI display.

use crate::backends::BackendType;
use crate::presets::{DownloadSourceInfo, ModelPreset};
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
    pub backend: Option<String>, // Backend type: TranscribeCpp
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

/// Quantization variant information for UI display
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantVariant {
    pub quant: String,
    pub filename: String,
    pub size_bytes: u64,
    pub is_recommended: bool,
}

impl CatalogModel {
    /// Get all quantization variants for this model
    /// Returns a list of (quant, filename, size_bytes) tuples
    pub fn get_quant_variants(&self) -> Vec<QuantVariant> {
        self.files
            .as_ref()
            .map(|files| {
                files
                    .iter()
                    .map(|f| QuantVariant {
                        quant: f.quant.clone(),
                        filename: f.filename.clone(),
                        size_bytes: f.size_bytes,
                        is_recommended: self.default_quant.as_ref() == Some(&f.quant),
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Parse backend type from catalog model
    fn parse_backend(&self) -> BackendType {
        match self.backend.as_deref() {
            Some("TranscribeCpp") | None => BackendType::TranscribeCpp,
            _ => BackendType::TranscribeCpp,
        }
    }

    /// Create a single ModelPreset from CatalogModel
    ///
    /// For GGUF models (with files):
    /// - Uses `default_quant` to select the file variant
    /// - Sets `filename` and `quant` fields
    /// - Falls back to Q5_K_M if no default specified
    pub fn to_preset(&self) -> ModelPreset {
        let backend = self.parse_backend();

        // Handle GGUF models with multiple quantization variants
        if let Some(files) = &self.files {
            // Determine default quantization (Q5_K_M if not specified)
            let default_quant = self
                .default_quant
                .as_ref()
                .unwrap_or(&"Q5_K_M".to_string())
                .clone();

            // Find the file info for default quantization
            let file_info = files.iter().find(|f| f.quant == default_quant);

            if let Some(f) = file_info {
                // Build complete download URLs with filename
                let download_urls = self
                    .download_urls
                    .as_ref()
                    .map(|urls| {
                        urls.iter()
                            .map(|u| DownloadSourceInfo {
                                name: u.name.clone(),
                                url: format!(
                                    "{}/{}",
                                    u.url.trim_end_matches('/'),
                                    f.filename
                                ),
                                is_china_accessible: u.is_china_accessible,
                                priority: u.priority,
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                return ModelPreset::asr_preset_with_filename(
                    self.id.clone(),
                    self.name.clone(),
                    format!("{}MB", f.size_bytes / 1024 / 1024),
                    backend,
                    download_urls,
                    self.languages.clone(),
                    self.description.clone(),
                    Some(self.capabilities.lang_detect),
                    Some(self.capabilities.streaming),
                    Some(self.capabilities.translate),
                    self.accuracy_score.map(|a| a as f32 / 100.0),
                    self.speed_score.map(|s| s as f32 / 100.0),
                    None, // path will be set by scanner
                    f.filename.clone(),
                    f.quant.clone(),
                );
            }

            // If default_quant not found in files, use the first file
            if let Some(f) = files.first() {
                let download_urls = self
                    .download_urls
                    .as_ref()
                    .map(|urls| {
                        urls.iter()
                            .map(|u| DownloadSourceInfo {
                                name: u.name.clone(),
                                url: format!(
                                    "{}/{}",
                                    u.url.trim_end_matches('/'),
                                    f.filename
                                ),
                                is_china_accessible: u.is_china_accessible,
                                priority: u.priority,
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                return ModelPreset::asr_preset_with_filename(
                    self.id.clone(),
                    self.name.clone(),
                    format!("{}MB", f.size_bytes / 1024 / 1024),
                    backend,
                    download_urls,
                    self.languages.clone(),
                    self.description.clone(),
                    Some(self.capabilities.lang_detect),
                    Some(self.capabilities.streaming),
                    Some(self.capabilities.translate),
                    self.accuracy_score.map(|a| a as f32 / 100.0),
                    self.speed_score.map(|s| s as f32 / 100.0),
                    None,
                    f.filename.clone(),
                    f.quant.clone(),
                );
            }
        }

        // Models without files
        ModelPreset::asr_preset(
            self.id.clone(),
            self.name.clone(),
            self.size.clone().unwrap_or_else(|| "未知大小".to_string()),
            backend,
            self.download_urls
                .as_ref()
                .map(|urls| {
                    urls.iter()
                        .map(|u| DownloadSourceInfo {
                            name: u.name.clone(),
                            url: u.url.clone(),
                            is_china_accessible: u.is_china_accessible,
                            priority: u.priority,
                        })
                        .collect()
                })
                .unwrap_or_default(),
            self.languages.clone(),
            self.description.clone(),
            Some(self.capabilities.lang_detect),
            Some(self.capabilities.streaming),
            Some(self.capabilities.translate),
            self.accuracy_score.map(|a| a as f32 / 100.0),
            self.speed_score.map(|s| s as f32 / 100.0),
        )
    }

    /// Get all quantization variant presets (deprecated)
    ///
    /// This method is kept for backward compatibility but now returns
    /// only the default preset (using default_quant).
    #[deprecated(note = "Use to_preset() instead. Multiple presets are no longer supported.")]
    pub fn to_presets(&self) -> Vec<ModelPreset> {
        vec![self.to_preset()]
    }
}

/// Global catalog instance (loaded once at startup)
pub static CATALOG: Lazy<Vec<CatalogModel>> = Lazy::new(|| {
    let root: CatalogRoot = serde_json::from_str(include_str!("catalog.json"))
        .expect("catalog.json should be valid JSON");
    root.models
});

/// Find a model by ID (case-insensitive match)
///
/// Note: Uses case-insensitive matching because `get_base_model_id` returns
/// lowercase IDs, but catalog.json preserves original case (e.g., "Qwen3-ASR-1.7B").
pub fn find_model(id: &str) -> Option<&CatalogModel> {
    let id_lower = id.to_lowercase();
    CATALOG.iter().find(|m| m.id.to_lowercase() == id_lower)
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
        // Original case
        assert!(find_model("Qwen3-ASR-1.7B").is_some());
        assert!(find_model("cohere-transcribe-03-2026").is_some());
        // Lowercase (from get_base_model_id)
        assert!(find_model("qwen3-asr-1.7b").is_some());
        assert!(find_model("parakeet-unified-en-0.6b").is_some());
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

    #[test]
    fn presets_generated_correctly() {
        let presets: Vec<_> = CATALOG
            .iter()
            .filter(|m| m.backend.as_deref() != Some("LLM"))
            .flat_map(|m| m.to_presets())
            .collect();

        assert!(!presets.is_empty(), "should generate presets");

        // 验证模型有分数
        let qwen = presets.iter().find(|p| p.id == "Qwen3-ASR-1.7B");
        assert!(qwen.is_some());
        let qwen = qwen.unwrap();
        assert!(qwen.accuracy_score.is_some());
        assert!(qwen.speed_score.is_some());
    }

    #[test]
    fn all_models_have_required_fields() {
        for model in CATALOG.iter() {
            assert!(!model.id.is_empty(), "model should have id");
            assert!(!model.name.is_empty(), "model should have name");
            assert!(!model.languages.is_empty(), "model should have languages");
        }
    }
}
