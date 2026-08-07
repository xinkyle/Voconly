// Utils module

pub mod downloader;
pub mod hf_cache;
pub mod quant;

pub use quant::{
    extract_quant_from_filename, higher_quant, is_valid_quant, quant_priority,
};

/// Extract base model ID by removing quantization suffix.
///
/// Quantization markers: -Q, _Q, -F, _F, -IQ, _IQ (and lowercase variants)
///
/// # Examples
/// ```
/// assert_eq!(get_base_model_id("sensevoice-small-q8"), "sensevoice-small");
/// assert_eq!(get_base_model_id("parakeet-unified-en-0.6b-F16"), "parakeet-unified-en-0.6b");
/// assert_eq!(get_base_model_id("Qwen3-ASR-1.7B-Q5_K_M"), "qwen3-asr-1.7b");
/// ```
pub fn get_base_model_id(model_id: &str) -> String {
    // Remove file extension first if present
    let name = model_id
        .strip_suffix(".gguf")
        .or_else(|| model_id.strip_suffix(".bin"))
        .or_else(|| model_id.strip_suffix(".onnx"))
        .unwrap_or(model_id);

    // Find quantization marker from right side (case-insensitive)
    // Quantization markers: -Q, _Q, -F, _F, -IQ, _IQ (and lowercase variants)
    let name_lower = name.to_lowercase();
    for marker in ["-q", "_q", "-f", "_f", "-iq", "_iq"] {
        if let Some(pos) = name_lower.rfind(marker) {
            return name[..pos].to_lowercase();
        }
    }
    name.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base_model_id_extraction() {
        // Quantization suffixes
        assert_eq!(get_base_model_id("sensevoice-small-q8"), "sensevoice-small");
        assert_eq!(get_base_model_id("parakeet-unified-en-0.6b-F16"), "parakeet-unified-en-0.6b");
        assert_eq!(get_base_model_id("Qwen3-ASR-1.7B-Q5_K_M"), "qwen3-asr-1.7b");
        assert_eq!(get_base_model_id("model-iq4_xs"), "model");
        assert_eq!(get_base_model_id("model_q8_0"), "model");

        // File extensions
        assert_eq!(get_base_model_id("sensevoice-small-q8.gguf"), "sensevoice-small");
        assert_eq!(get_base_model_id("model-q4.bin"), "model");

        // No quantization suffix
        assert_eq!(get_base_model_id("sensevoice-small"), "sensevoice-small");
        assert_eq!(get_base_model_id("SenseVoice-Small"), "sensevoice-small");
    }
}