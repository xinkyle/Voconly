//! Model catalog loaded from JSON configuration
//!
//! Provides model metadata including benchmark scores from `catalog.json`.
//! Scores are stored as 0-100 and converted to 0.0-1.0 for UI display.

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
    pub languages: Vec<String>,
    pub capabilities: CatalogCapabilities,
    /// Speed score (0-100, higher = faster)
    pub speed_score: Option<u32>,
    /// Accuracy score (0-100, higher = more accurate)
    pub accuracy_score: Option<u32>,
    pub description: Option<String>,
}

/// Model capabilities
#[derive(Deserialize, Debug)]
pub struct CatalogCapabilities {
    pub streaming: bool,
    pub translate: bool,
    pub lang_detect: bool,
}

/// Global catalog instance (loaded once at startup)
pub static CATALOG: Lazy<Vec<CatalogModel>> = Lazy::new(|| {
    let root: CatalogRoot = serde_json::from_str(include_str!("catalog.json"))
        .expect("catalog.json should be valid JSON");
    root.models
});

/// Find a model by ID
pub fn find_model(id: &str) -> Option<&CatalogModel> {
    CATALOG.iter().find(|m| m.id == id)
}

/// Get speed score (0-100 → 0.0-1.0)
pub fn get_speed_score(id: &str) -> Option<f32> {
    find_model(id).and_then(|m| m.speed_score.map(|s| s as f32 / 100.0))
}

/// Get accuracy score (0-100 → 0.0-1.0)
pub fn get_accuracy_score(id: &str) -> Option<f32> {
    find_model(id).and_then(|m| m.accuracy_score.map(|a| a as f32 / 100.0))
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
}