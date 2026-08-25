// Utils module

pub mod downloader;
pub mod hf_cache;
pub mod quant;

pub use quant::{
    extract_quant_from_filename, extract_quant_suffix, higher_quant, is_valid_quant, quant_priority,
};

/// Extract base model ID by removing quantization suffix.
///
/// Uses the known quantization suffix list to match exactly.
///
/// # Examples
/// ```
/// assert_eq!(get_base_model_id("sensevoice-small-q8_0"), "sensevoice-small");
/// assert_eq!(get_base_model_id("parakeet-unified-en-0.6b-F16"), "parakeet-unified-en-0.6b");
/// assert_eq!(get_base_model_id("Qwen3-ASR-1.7B-Q5_K_M"), "qwen3-asr-1.7b");
/// assert_eq!(get_base_model_id("cohere-transcribe-03-2026-BF16"), "cohere-transcribe-03-2026");
/// ```
pub fn get_base_model_id(model_id: &str) -> String {
    // Remove file extension first if present
    let name = model_id
        .strip_suffix(".gguf")
        .or_else(|| model_id.strip_suffix(".bin"))
        .or_else(|| model_id.strip_suffix(".onnx"))
        .unwrap_or(model_id);

    let name_lower = name.to_lowercase();

    // Find all separator positions and check from right to left
    // This handles cases like "q8_0" where the quant suffix contains '_'
    let mut pos = name_lower.len();
    while pos > 0 {
        // Find the next separator from right
        let next_sep = name_lower[..pos]
            .chars()
            .rev()
            .position(|c| c == '-' || c == '_')
            .map(|i| pos - i - 1);

        match next_sep {
            Some(sep_pos) => {
                let potential_quant = &name_lower[sep_pos + 1..];
                if is_valid_quant(potential_quant) {
                    return name[..sep_pos].to_lowercase();
                }
                pos = sep_pos;
            }
            None => break,
        }
    }

    name.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base_model_id_extraction() {
        // Valid quantization suffixes (from is_valid_quant)
        assert_eq!(get_base_model_id("sensevoice-small-q8_0"), "sensevoice-small");
        assert_eq!(get_base_model_id("parakeet-unified-en-0.6b-F16"), "parakeet-unified-en-0.6b");
        assert_eq!(get_base_model_id("Qwen3-ASR-1.7B-Q5_K_M"), "qwen3-asr-1.7b");
        assert_eq!(get_base_model_id("model_q8_0"), "model");
        assert_eq!(get_base_model_id("cohere-transcribe-03-2026-BF16"), "cohere-transcribe-03-2026");
        assert_eq!(get_base_model_id("cohere-transcribe-03-2026-bf16"), "cohere-transcribe-03-2026");

        // File extensions
        assert_eq!(get_base_model_id("sensevoice-small-q8_0.gguf"), "sensevoice-small");
        assert_eq!(get_base_model_id("model-q4_0.bin"), "model");
        assert_eq!(get_base_model_id("cohere-transcribe-03-2026-BF16.gguf"), "cohere-transcribe-03-2026");

        // No quantization suffix (or unknown suffix)
        assert_eq!(get_base_model_id("sensevoice-small"), "sensevoice-small");
        assert_eq!(get_base_model_id("SenseVoice-Small"), "sensevoice-small");
        assert_eq!(get_base_model_id("model-q8"), "model-q8"); // q8 is not valid, only q8_0
    }
}