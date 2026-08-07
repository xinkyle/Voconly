//! Quantization version utilities
//!
//! Provides utilities for handling GGUF quantization versions.
//! Used for:
//! - Determining which quantization version to use when multiple are available
//! - Ordering quantization versions by quality

/// Get the priority of a quantization version.
///
/// Higher values indicate higher quality (and usually larger file size).
/// Returns 0 for unknown quantization versions.
///
/// Priority ordering (from highest to lowest):
/// ```
/// F32 > F16 > BF16 > Q8_0 > Q6_K > Q5_K_M > Q5_K_S > Q5_0 > Q4_K_M > Q4_K_S > Q4_0 > Q3_K_M > Q3_K_L > Q3_K_S > Q2_K
/// ```
pub fn quant_priority(quant: &str) -> u8 {
    let quant_lower = quant.to_lowercase();
    match quant_lower.as_str() {
        "q8_0" => 80,
        "q6_k" => 70,
        "q5_k_m" => 65,
        "q5_k_s" => 64,
        "q5_0" => 60,
        "q4_k_m" => 55,
        "q4_k_s" => 54,
        "q4_0" => 50,
        "q3_k_m" => 45,
        "q3_k_l" => 44,
        "q3_k_s" => 43,
        "q2_k" => 30,
        "f32" => 100,
        "f16" => 90,
        "bf16" => 85,
        _ => 0, // Unknown quantization version
    }
}

/// Compare two quantization versions and return the higher quality one.
///
/// # Examples
/// ```
/// assert_eq!(higher_quant("Q5_K_M", "Q4_0"), "Q5_K_M");
/// assert_eq!(higher_quant("Q8_0", "Q5_K_M"), "Q8_0");
/// ```
pub fn higher_quant<'a>(a: &'a str, b: &'a str) -> &'a str {
    if quant_priority(a) >= quant_priority(b) {
        a
    } else {
        b
    }
}

/// Check if a quantization version is valid.
///
/// Valid quantization versions:
/// - Q8_0, Q6_K, Q5_K_M, Q5_K_S, Q5_0, Q4_K_M, Q4_K_S, Q4_0, Q3_K_M, Q3_K_L, Q3_K_S, Q2_K
/// - F32, F16, BF16
pub fn is_valid_quant(quant: &str) -> bool {
    let quant_lower = quant.to_lowercase();
    matches!(
        quant_lower.as_str(),
        "q8_0" | "q6_k" | "q5_k_m" | "q5_k_s" | "q5_0" | "q4_k_m" | "q4_k_s" | "q4_0"
            | "q3_k_m" | "q3_k_l" | "q3_k_s" | "q2_k" | "f32" | "f16" | "bf16"
    )
}

/// Extract quantization version from a filename.
///
/// Only supports standard format: `<model-name>-<quant>.gguf`
///
/// # Examples
/// ```
/// assert_eq!(extract_quant_from_filename("qwen3-asr-1.7b-q5_k_m.gguf"), Some("Q5_K_M".to_string()));
/// assert_eq!(extract_quant_from_filename("model.gguf"), None);  // Invalid format
/// assert_eq!(extract_quant_from_filename("my-model-v1.gguf"), None);  // Unknown quantization
/// ```
pub fn extract_quant_from_filename(filename: &str) -> Option<String> {
    // Remove extension
    let name = filename
        .strip_suffix(".gguf")
        .or_else(|| filename.strip_suffix(".bin"))?;

    // Find the last '-' and extract potential quantization version
    let last_dash = name.rfind('-')?;
    let potential_quant = &name[last_dash + 1..];

    // Validate if it's a known quantization version
    if is_valid_quant(potential_quant) {
        // Normalize to uppercase (e.g., "q5_k_m" -> "Q5_K_M")
        Some(potential_quant.to_uppercase())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quant_priority() {
        assert!(quant_priority("Q8_0") > quant_priority("Q5_K_M"));
        assert!(quant_priority("Q5_K_M") > quant_priority("Q4_0"));
        assert!(quant_priority("F16") > quant_priority("Q8_0"));
        assert_eq!(quant_priority("UNKNOWN"), 0);
    }

    #[test]
    fn test_higher_quant() {
        assert_eq!(higher_quant("Q5_K_M", "Q4_0"), "Q5_K_M");
        assert_eq!(higher_quant("Q4_0", "Q5_K_M"), "Q5_K_M");
        assert_eq!(higher_quant("Q8_0", "Q5_K_M"), "Q8_0");
    }

    #[test]
    fn test_is_valid_quant() {
        assert!(is_valid_quant("Q5_K_M"));
        assert!(is_valid_quant("q5_k_m")); // Case insensitive
        assert!(is_valid_quant("F16"));
        assert!(!is_valid_quant("UNKNOWN"));
    }

    #[test]
    fn test_extract_quant_from_filename() {
        assert_eq!(
            extract_quant_from_filename("qwen3-asr-1.7b-q5_k_m.gguf"),
            Some("Q5_K_M".to_string())
        );
        assert_eq!(
            extract_quant_from_filename("parakeet-tdt-1.1b-q8_0.gguf"),
            Some("Q8_0".to_string())
        );
        assert_eq!(
            extract_quant_from_filename("whisper-large-v3-q5_0.gguf"),
            Some("Q5_0".to_string())
        );
        assert_eq!(extract_quant_from_filename("model.gguf"), None); // No quantization
        assert_eq!(extract_quant_from_filename("my-model-v1.gguf"), None); // Unknown quantization
    }
}