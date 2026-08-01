//! GGUF Model Capabilities Detection
//!
//! Provides capabilities detection for GGUF ASR models based on file metadata.
//! Used for UI display and model selection.
//!
//! # Detection Strategy
//!
//! 1. **Primary**: Parse GGUF header metadata (general.architecture, stt.capability.*)
//! 2. **Fallback**: Infer from filename pattern matching
//!
//! # Supported Architectures
//!
//! GGUF ASR models support various architectures including:
//! - whisper: OpenAI Whisper (supports translation)
//! - qwen3_asr: Qwen3 Audio models (supports streaming)
//! - parakeet: NVIDIA Parakeet models
//! - voxtral: Mistral Voxtral models
//! - sensevoice: Alibaba SenseVoice
//! - canary: NVIDIA Canary (supports translation)
//! - moonshine: Moonshine ASR
//! - gigaam: NVIDIA GigaAM
//! - cohere: Cohere audio models

use serde::{Deserialize, Serialize};
use std::path::Path;

use super::gguf_meta::{self, GgufError, GgufMetadata};

/// Architecture strings transcribe-cpp can load — the `.name` of each arch under
/// its `src/arch/`, which is exactly the value stored in `general.architecture`.
/// Keep this in sync with transcribe-cpp; an arch absent here still parses, it's
/// just surfaced as [`Compatibility::MaybeIncompatible`] rather than promised.
pub const KNOWN_ARCHES: &[&str] = &[
    "whisper",
    "parakeet",
    "qwen3_asr",
    "voxtral",
    "voxtral_realtime",
    "cohere",
    "cohere_asr",
    "canary",
    "canary_qwen",
    "moonshine",
    "moonshine_streaming",
    "sensevoice",
    "gigaam",
    "granite",
    "granite_speech",
    "granite_nar",
    "granite_speech_nar",
    "funasr_nano",
    "medasr",
    "nemotron",
];

// GGUF metadata keys transcribe-cpp writes for ASR models.
const KEY_ARCH: &str = "general.architecture";
const KEY_NAME: &str = "general.name";
const KEY_VARIANT: &str = "stt.variant";
const KEY_LANGUAGES: &str = "general.languages";
const KEY_CAP_STREAMING: &str = "stt.capability.streaming";
const KEY_CAP_TRANSLATE: &str = "stt.capability.translate";
const KEY_CAP_LANG_DETECT: &str = "stt.capability.lang_detect";
const PROBE_KEYS: &[&str] = &[
    KEY_ARCH,
    KEY_NAME,
    KEY_VARIANT,
    KEY_LANGUAGES,
    KEY_CAP_STREAMING,
    KEY_CAP_TRANSLATE,
    KEY_CAP_LANG_DETECT,
];

/// Compatibility verdict for GGUF ASR models
///
/// Indicates whether a model is compatible with the transcribe-cpp backend.
/// Used for UI display and runtime decision making.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Compatibility {
    /// Known architecture, fully supported
    Compatible,
    /// Unknown architecture, may not be compatible
    MaybeIncompatible,
    /// Unsupported architecture
    Unsupported,
}

impl Default for Compatibility {
    fn default() -> Self {
        Self::MaybeIncompatible
    }
}

/// GGUF model capabilities
///
/// Describes the capabilities of a GGUF ASR model for UI display
/// and runtime behavior configuration.
///
/// Fields use `Option` to indicate "unknown" status when GGUF header
/// parsing fails or returns incomplete information.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GgufCapabilities {
    /// Compatibility verdict for this model
    pub verdict: Compatibility,

    /// Model architecture identifier (e.g., "qwen3_asr", "whisper")
    /// None means unknown architecture
    pub architecture: Option<String>,

    /// Whether the model supports streaming transcription
    /// None means unknown
    pub supports_streaming: Option<bool>,

    /// Whether the model supports translation to English
    /// None means unknown
    pub supports_translation: Option<bool>,

    /// Whether the model supports automatic language detection
    /// None means unknown
    pub supports_language_detect: Option<bool>,

    /// Supported language codes (e.g., ["zh", "en", "ja", "ko"])
    /// None means unknown, empty list means multilingual support
    pub languages: Option<Vec<String>>,
}

impl Default for GgufCapabilities {
    fn default() -> Self {
        Self {
            verdict: Compatibility::MaybeIncompatible,
            architecture: None,
            supports_streaming: None,
            supports_translation: None,
            supports_language_detect: None,
            languages: None,
        }
    }
}

impl GgufCapabilities {
    /// Whisper 语言列表（99种语言，空列表表示多语言支持）
    /// 参考 Handy model.rs 的预设值
    const WHISPER_LANGUAGES: &[&str] = &[
        "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca", "nl", "ar", "sv",
        "it", "id", "hi", "fi", "vi", "he", "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no",
        "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk", "te", "fa", "lv", "bn", "sr",
        "az", "sl", "kn", "et", "mk", "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw",
        "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc", "ka", "be", "tg", "sd", "gu",
        "am", "yi", "lo", "uz", "fo", "ht", "ps", "tk", "nn", "mt", "sa", "lb", "my", "bo", "tl",
        "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su", "yue",
    ];

    /// Create capabilities for Whisper architecture
    ///
    /// Whisper supports translation to English and is multilingual.
    /// It also supports automatic language detection.
    pub fn whisper() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("whisper".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(true),
            supports_language_detect: Some(true),
            languages: Some(vec![]), // Empty = multilingual (支持99种语言)
        }
    }

    /// Create capabilities for Qwen3-ASR architecture
    ///
    /// Qwen3-ASR does NOT support streaming transcription (offline only).
    /// Supports Chinese, English, Japanese, Korean with auto language detection.
    pub fn qwen3_asr() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("qwen3_asr".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: Some(vec![
                "zh".to_string(),
                "en".to_string(),
                "ja".to_string(),
                "ko".to_string(),
            ]),
        }
    }

    /// Parakeet V3 语言列表（25种欧洲语言）
    /// 参考 Handy model.rs 的预设值
    const PARAKEET_LANGUAGES: &[&str] = &[
        "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt",
        "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
    ];

    /// Create capabilities for Parakeet architecture
    ///
    /// NVIDIA Parakeet supports streaming, optimized for European languages.
    /// 支持25种欧洲语言。
    pub fn parakeet() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("parakeet".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(false),
            supports_language_detect: Some(false),
            languages: Some(
                Self::PARAKEET_LANGUAGES
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            ),
        }
    }

    /// Create capabilities for Voxtral architecture
    ///
    /// Mistral Voxtral supports streaming transcription.
    pub fn voxtral() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("voxtral".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: Some(vec!["en".to_string(), "zh".to_string()]),
        }
    }

    /// SenseVoice 语言列表（5种语言）
    /// 参考 Handy model.rs 的预设值
    const SENSEVOICE_LANGUAGES: &[&str] = &["zh", "en", "yue", "ja", "ko"];

    /// Create capabilities for SenseVoice architecture
    ///
    /// Alibaba SenseVoice supports Chinese, Cantonese, and major Asian languages.
    /// 支持5种语言：中文、英文、粤语、日文、韩文
    pub fn sensevoice() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("sensevoice".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: Some(
                Self::SENSEVOICE_LANGUAGES
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            ),
        }
    }

    /// Canary 180M Flash 语言列表（4种语言）
    const CANARY_180M_LANGUAGES: &[&str] = &["en", "de", "es", "fr"];

    /// Canary 1B v2 语言列表（25种欧洲语言，与 Parakeet V3 相同）
    const CANARY_1B_LANGUAGES: &[&str] = &[
        "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt",
        "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
    ];

    /// Create capabilities for Canary architecture
    ///
    /// NVIDIA Canary supports streaming and translation.
    /// 默认使用 Canary 1B v2 的25种欧洲语言列表。
    /// 注意：Canary 180M Flash 只支持4种语言，需要根据具体模型区分。
    pub fn canary() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("canary".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(true),
            supports_language_detect: Some(true),
            // 默认使用更大的语言列表，具体模型可能需要调整
            languages: Some(
                Self::CANARY_1B_LANGUAGES
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            ),
        }
    }

    /// Create capabilities for Moonshine architecture
    ///
    /// Moonshine is optimized for English transcription.
    pub fn moonshine() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("moonshine".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(false),
            languages: Some(vec!["en".to_string()]),
        }
    }

    /// Create capabilities for GigaAM architecture
    ///
    /// NVIDIA GigaAM supports streaming, optimized for Russian.
    /// 仅支持俄语
    pub fn gigaam() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("gigaam".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(false),
            supports_language_detect: Some(false),
            languages: Some(vec!["ru".to_string()]),
        }
    }

    /// Cohere 语言列表（14种语言）
    /// 参考 Handy model.rs 的预设值
    const COHERE_LANGUAGES: &[&str] = &[
        "en", "fr", "de", "it", "es", "pt", "el", "nl", "pl", "zh", "ja", "ko", "vi", "ar",
    ];

    /// Create capabilities for Cohere architecture
    ///
    /// Cohere audio models do NOT support streaming transcription (offline only).
    /// 支持14种语言
    pub fn cohere() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("cohere".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: Some(
                Self::COHERE_LANGUAGES
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
            ),
        }
    }

    /// Create capabilities for Nemotron architecture
    ///
    /// NVIDIA Nemotron ASR models support English only.
    /// Streaming capability depends on transcribe-cpp runtime detection.
    pub fn nemotron() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("nemotron".to_string()),
            supports_streaming: Some(false), // Conservative, depends on runtime detection
            supports_translation: Some(false),
            supports_language_detect: Some(false),
            languages: Some(vec!["en".to_string()]), // Only supports English
        }
    }

    /// Create capabilities for an unknown/unsupported architecture
    ///
    /// Used when the model architecture cannot be determined.
    pub fn unknown() -> Self {
        Self {
            verdict: Compatibility::MaybeIncompatible,
            architecture: None,
            supports_streaming: None,
            supports_translation: None,
            supports_language_detect: None,
            languages: None,
        }
    }

    /// Build capabilities from parsed GGUF metadata.
    ///
    /// 对于已知架构，使用预设的能力值（包括语言列表），不信任 GGUF 读取的值。
    /// 只有未知架构才使用 GGUF 自己的值。
    ///
    /// 注意：GGUF 中的架构名可能是大小写混合（如 "Cohere"），
    /// 需要转换为小写后再匹配 KNOWN_ARCHES。
    ///
    /// Streaming for the parakeet family is *inferred* by transcribe-cpp's
    /// native loader from encoder hparams rather than a flat bool.
    /// When the explicit `stt.capability.streaming` key is absent, we check
    /// if the architecture is known to support streaming (parakeet, voxtral, etc.)
    /// and use the preset value instead of returning None.
    pub fn from_metadata(meta: &GgufMetadata) -> Self {
        let architecture = meta.get_str(KEY_ARCH).map(str::to_string);

        // 对于已知架构，使用预设能力
        // 注意：GGUF 中的架构名可能是大小写混合（如 "Cohere"），需要转换为小写后匹配
        if let Some(ref arch) = architecture {
            let arch_lower = arch.to_lowercase();
            if KNOWN_ARCHES.contains(&arch_lower.as_str()) {
                // 使用预设能力，包括语言列表
                return get_architecture_capabilities(&arch_lower);
            }
        }

        // 未知架构，使用 GGUF 元数据的值
        let verdict = Compatibility::MaybeIncompatible;

        // Read explicit metadata values
        let mut supports_streaming = meta.get_bool(KEY_CAP_STREAMING);
        let supports_translation = meta.get_bool(KEY_CAP_TRANSLATE);
        let supports_language_detect = meta.get_bool(KEY_CAP_LANG_DETECT);
        let languages = meta.get_string_array(KEY_LANGUAGES);

        // If streaming capability is not in metadata, infer from architecture
        // This handles parakeet, voxtral, etc. where streaming is inferred from encoder hparams
        if supports_streaming.is_none() {
            if let Some(ref arch) = architecture {
                supports_streaming = match arch.as_str() {
                    // Architectures known to support streaming
                    "parakeet" | "voxtral" | "voxtral_realtime" | "canary" | "gigaam" => Some(true),
                    // Architectures known to NOT support streaming
                    "whisper" | "qwen3_asr" | "sensevoice" | "moonshine" | "cohere"
                    | "cohere_asr" | "nemotron" => Some(false),
                    // Unknown architectures - keep None
                    _ => None,
                };
            }
        }

        GgufCapabilities {
            verdict,
            architecture,
            supports_streaming,
            supports_translation,
            supports_language_detect,
            languages,
        }
    }

    /// Check if the model supports a specific language
    ///
    /// Returns:
    /// - `Some(true)` if the language is supported
    /// - `Some(false)` if the language is not supported
    /// - `None` if language support is unknown
    pub fn supports_language(&self, lang: &str) -> Option<bool> {
        self.languages.as_ref().map(|langs| {
            // Empty languages list means multilingual support
            if langs.is_empty() {
                return true;
            }
            langs.iter().any(|l| l == lang)
        })
    }

    /// Check if language is definitely supported (returns true or assumes supported if unknown)
    pub fn language_is_supported(&self, lang: &str) -> bool {
        self.supports_language(lang).unwrap_or(true)
    }

    /// Get display-friendly architecture name
    ///
    /// Returns "Unknown" if architecture is not set.
    pub fn display_name(&self) -> String {
        match self.architecture.as_deref() {
            Some("whisper") => "Whisper".to_string(),
            Some("qwen3_asr") => "Qwen3-ASR".to_string(),
            Some("parakeet") => "Parakeet".to_string(),
            Some("voxtral") => "Voxtral".to_string(),
            Some("sensevoice") => "SenseVoice".to_string(),
            Some("canary") => "Canary".to_string(),
            Some("moonshine") => "Moonshine".to_string(),
            Some("gigaam") => "GigaAM".to_string(),
            Some("cohere") => "Cohere".to_string(),
            Some("nemotron") => "Nemotron".to_string(),
            Some(arch) => arch.to_string(),
            None => "Unknown".to_string(),
        }
    }
}

/// Probe GGUF model capabilities from file path
///
/// Attempts to determine model capabilities based on:
/// 1. GGUF file header metadata (general.architecture field)
/// 2. Filename pattern matching (fallback)
///
/// # Arguments
///
/// * `path` - Path to the GGUF file
///
/// # Returns
///
/// Returns `GgufCapabilities` with detected or inferred capabilities.
/// If detection fails, returns default capabilities with "unknown" architecture.
pub fn probe_gguf_capabilities(path: &Path) -> GgufCapabilities {
    // 1. 尝试从 GGUF header 元数据解析
    if let Some(caps) = probe_from_gguf_header(path) {
        let lang_info = match &caps.languages {
            Some(langs) if langs.is_empty() => "预设(多语言)".to_string(),
            Some(langs) => format!("预设({}种)", langs.len()),
            None => "未知".to_string(),
        };
        log::info!(
            "[GGUF] 从 header 检测到架构: {} (语言: {}), {:?}",
            caps.display_name(),
            lang_info,
            path
        );
        return caps;
    }

    // 2. 回退到文件名推断
    let caps = probe_from_filename(path);
    log::info!(
        "[GGUF] 从文件名推断架构: {} (语言: 预设), {:?}",
        caps.display_name(),
        path
    );
    caps
}

/// Probe capabilities from GGUF file header metadata
///
/// Reads the GGUF file header and extracts the `general.architecture` metadata field.
/// This is the preferred method as it provides accurate architecture information.
fn probe_from_gguf_header(path: &Path) -> Option<GgufCapabilities> {
    match read_header_metadata(path) {
        Ok(meta) => Some(GgufCapabilities::from_metadata(&meta)),
        Err(e) => {
            log::warn!("[GGUF] 无法解析 header: {} ({:?})", e, path);
            None
        }
    }
}

/// Read just enough of `path` to parse its GGUF metadata header, without ever
/// loading the (potentially multi-GB) tensor data. Grows the prefix
/// geometrically if a header is unusually large.
fn read_header_metadata(path: &Path) -> Result<GgufMetadata, GgufError> {
    // The KV metadata block precedes the tensor-info table. Shipping ASR models
    // place all of it well within the first 64 KiB, so that's the common-case
    // read. Older / community GGUFs may carry it deeper, so the loop grows the
    // prefix geometrically (jumping straight to the size the parser reports it
    // needs) up to a hard cap.
    const INITIAL_PREFIX: usize = 64 << 10; // 64 KiB
    const MAX_PREFIX: usize = 16 << 20; // 16 MiB

    /// Read up to `size` bytes from the start of `path`, tolerating short reads.
    fn read_prefix(path: &Path, size: usize) -> std::io::Result<Vec<u8>> {
        use std::io::Read;
        let mut file = std::fs::File::open(path)?;
        let mut buf = vec![0u8; size];
        let mut filled = 0;
        while filled < buf.len() {
            match file.read(&mut buf[filled..]) {
                Ok(0) => break,
                Ok(n) => filled += n,
                Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(e) => return Err(e),
            }
        }
        buf.truncate(filled);
        Ok(buf)
    }

    let mut size = INITIAL_PREFIX;
    loop {
        let buf = read_prefix(path, size).map_err(|_| GgufError::Malformed("cannot read file"))?;
        let read_len = buf.len();
        match gguf_meta::parse_header(&buf, PROBE_KEYS) {
            Ok(meta) => return Ok(meta),
            Err(GgufError::Truncated { needed }) => {
                if read_len < size {
                    // Hit EOF and still truncated → file shorter than its header.
                    return Err(GgufError::Malformed("file shorter than its header"));
                }
                let next = needed.max(size.saturating_mul(2)).min(MAX_PREFIX);
                if next <= size {
                    return Err(GgufError::Truncated { needed });
                }
                size = next;
            }
            Err(e) => return Err(e),
        }
    }
}

/// Probe capabilities from filename pattern
///
/// Infers model architecture from filename patterns. This is a fallback
/// when GGUF header parsing is not available or fails.
///
/// # Common Patterns
///
/// - `qwen3-asr-*.gguf` → qwen3_asr
/// - `whisper-*.gguf` or `ggml-*.gguf` → whisper
/// - `parakeet-*.gguf` → parakeet
/// - `voxtral-*.gguf` → voxtral
/// - `sensevoice-*.gguf` → sensevoice
/// - `canary-*.gguf` → canary
/// - `moonshine-*.gguf` → moonshine
/// - `gigaam-*.gguf` → gigaam
fn probe_from_filename(path: &Path) -> GgufCapabilities {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 按已知架构匹配文件名模式
    // 优先级：特定架构 > whisper (最常见) > unknown

    // Qwen3-ASR 模型命名格式：qwen3-asr-{size}-q{quantization}.gguf
    if filename.contains("qwen3-asr")
        || filename.contains("qwen3_asr")
        || filename.contains("qwen3-audio")
    {
        return GgufCapabilities::qwen3_asr();
    }

    // Parakeet 模型命名格式：parakeet-{version}.gguf
    if filename.contains("parakeet") {
        return GgufCapabilities::parakeet();
    }

    // Voxtral 模型命名格式：voxtral-{size}.gguf
    if filename.contains("voxtral") {
        return GgufCapabilities::voxtral();
    }

    // SenseVoice 模型命名格式：sensevoice-{size}.gguf
    if filename.contains("sensevoice") {
        return GgufCapabilities::sensevoice();
    }

    // Canary 模型命名格式：canary-{version}.gguf
    if filename.contains("canary") {
        return GgufCapabilities::canary();
    }

    // Moonshine 模型命名格式：moonshine-{size}.gguf
    if filename.contains("moonshine") {
        return GgufCapabilities::moonshine();
    }

    // GigaAM 模型命名格式：gigaam-{size}.gguf
    if filename.contains("gigaam") {
        return GgufCapabilities::gigaam();
    }

    // Cohere 模型命名格式：cohere-audio-*.gguf
    if filename.contains("cohere") {
        return GgufCapabilities::cohere();
    }

    // Nemotron ASR 模型命名格式：nemotron-*-asr*.gguf
    // 例如：nemotron-3.5-asr-streaming-0.6b-q4_0.gguf
    if filename.contains("nemotron") {
        return GgufCapabilities::nemotron();
    }

    // Whisper 模型命名格式：
    // - ggml-whisper-{model}.gguf (GGUF 格式)
    // - whisper-{model}.gguf
    // - ggml-{model}.bin (GGML 格式，如 ggml-turbo.bin, ggml-small.bin)
    // - ggml-{model}.gguf
    if filename.contains("whisper") || filename.starts_with("ggml-") {
        return GgufCapabilities::whisper();
    }

    // 无法识别的架构，返回默认能力
    log::warn!("[GGUF] 无法识别的模型文件名: {}", filename);
    GgufCapabilities::unknown()
}

/// Get architecture-specific capabilities
///
/// Returns the predefined capabilities for a known architecture.
/// Returns unknown capabilities for unsupported architectures.
pub fn get_architecture_capabilities(arch: &str) -> GgufCapabilities {
    match arch {
        "whisper" => GgufCapabilities::whisper(),
        "qwen3_asr" | "qwen3-audio" => GgufCapabilities::qwen3_asr(),
        "parakeet" => GgufCapabilities::parakeet(),
        "voxtral" | "voxtral_realtime" => GgufCapabilities::voxtral(),
        "sensevoice" => GgufCapabilities::sensevoice(),
        "canary" | "canary_qwen" => GgufCapabilities::canary(),
        "moonshine" | "moonshine_streaming" => GgufCapabilities::moonshine(),
        "gigaam" => GgufCapabilities::gigaam(),
        "cohere" | "cohere_asr" => GgufCapabilities::cohere(),
        "nemotron" => GgufCapabilities::nemotron(),
        _ => GgufCapabilities::unknown(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_known_arches_constant() {
        assert!(KNOWN_ARCHES.contains(&"whisper"));
        assert!(KNOWN_ARCHES.contains(&"qwen3_asr"));
        assert!(KNOWN_ARCHES.contains(&"parakeet"));
        assert!(KNOWN_ARCHES.contains(&"voxtral"));
        assert!(KNOWN_ARCHES.contains(&"sensevoice"));
        assert!(KNOWN_ARCHES.contains(&"canary"));
        assert!(KNOWN_ARCHES.contains(&"moonshine"));
        assert!(KNOWN_ARCHES.contains(&"gigaam"));
        assert!(KNOWN_ARCHES.contains(&"cohere"));
    }

    #[test]
    fn test_whisper_capabilities() {
        let caps = GgufCapabilities::whisper();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("whisper".to_string()));
        assert_eq!(caps.supports_streaming, Some(false));
        assert_eq!(caps.supports_translation, Some(true));
        assert_eq!(caps.supports_language_detect, Some(true));
        assert!(caps.languages.as_ref().unwrap().is_empty()); // Multilingual
        assert_eq!(caps.supports_language("zh"), Some(true));
        assert_eq!(caps.supports_language("en"), Some(true));
        assert_eq!(caps.supports_language("ja"), Some(true));
    }

    #[test]
    fn test_qwen3_asr_capabilities() {
        let caps = GgufCapabilities::qwen3_asr();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("qwen3_asr".to_string()));
        assert_eq!(caps.supports_streaming, Some(false));
        assert_eq!(caps.supports_translation, Some(false));
        assert_eq!(caps.supports_language("zh"), Some(true));
        assert_eq!(caps.supports_language("en"), Some(true));
        assert_eq!(caps.supports_language("ja"), Some(true));
        assert_eq!(caps.supports_language("ko"), Some(true));
        assert_eq!(caps.supports_language("de"), Some(false));
    }

    #[test]
    fn test_parakeet_capabilities() {
        let caps = GgufCapabilities::parakeet();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("parakeet".to_string()));
        assert_eq!(caps.supports_streaming, Some(true));
        assert_eq!(caps.supports_translation, Some(false));
        assert_eq!(caps.supports_language("en"), Some(true));
        assert_eq!(caps.supports_language("de"), Some(true));
        assert_eq!(caps.supports_language("fr"), Some(true));
        assert_eq!(caps.supports_language("zh"), Some(false));
    }

    #[test]
    fn test_sensevoice_capabilities() {
        let caps = GgufCapabilities::sensevoice();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("sensevoice".to_string()));
        assert_eq!(caps.supports_streaming, Some(false));
        assert_eq!(caps.supports_translation, Some(false));
        assert_eq!(caps.supports_language("zh"), Some(true));
        assert_eq!(caps.supports_language("yue"), Some(true)); // 粤语
        assert_eq!(caps.supports_language("ja"), Some(true));
        assert_eq!(caps.supports_language("de"), Some(false));
    }

    #[test]
    fn test_canary_capabilities() {
        let caps = GgufCapabilities::canary();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("canary".to_string()));
        assert_eq!(caps.supports_streaming, Some(true));
        assert_eq!(caps.supports_translation, Some(true));
    }

    #[test]
    fn test_probe_qwen3_asr_filename() {
        let path = PathBuf::from("qwen3-asr-0.6b-q4_0.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.architecture, Some("qwen3_asr".to_string()));
        assert_eq!(caps.supports_streaming, Some(false));
    }

    #[test]
    fn test_probe_qwen3_asr_alternate_filename() {
        // 测试其他 Qwen3-ASR 命名格式
        let variants = [
            "qwen3_asr-1.7b-q8_0.gguf",
            "qwen3-audio-0.6b.gguf",
            "Qwen3-ASR-0.6B-Q4_0.GGUF", // 大小写混合
        ];

        for filename in variants {
            let path = PathBuf::from(filename);
            let caps = probe_from_filename(&path);
            assert_eq!(
                caps.architecture,
                Some("qwen3_asr".to_string()),
                "Failed for: {}",
                filename
            );
        }
    }

    #[test]
    fn test_probe_whisper_filename() {
        let path = PathBuf::from("whisper-large-v3.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.architecture, Some("whisper".to_string()));
        assert_eq!(caps.supports_translation, Some(true));
    }

    #[test]
    fn test_probe_parakeet_filename() {
        let path = PathBuf::from("parakeet-tdt-1.1b.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.architecture, Some("parakeet".to_string()));
        assert_eq!(caps.supports_streaming, Some(true));
    }

    #[test]
    fn test_probe_sensevoice_filename() {
        let path = PathBuf::from("sensevoice-small.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.architecture, Some("sensevoice".to_string()));
        assert_eq!(caps.supports_streaming, Some(false));
    }

    #[test]
    fn test_probe_voxtral_filename() {
        let path = PathBuf::from("voxtral-mini.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.architecture, Some("voxtral".to_string()));
        assert_eq!(caps.supports_streaming, Some(true));
    }

    #[test]
    fn test_probe_unknown_filename() {
        let path = PathBuf::from("custom-model.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.verdict, Compatibility::MaybeIncompatible);
        assert_eq!(caps.architecture, None);
        assert_eq!(caps.supports_streaming, None);
        assert_eq!(caps.supports_translation, None);
        assert_eq!(caps.languages, None);
    }

    #[test]
    fn test_get_architecture_capabilities() {
        let caps = get_architecture_capabilities("qwen3_asr");
        assert_eq!(caps.architecture, Some("qwen3_asr".to_string()));
        assert_eq!(caps.verdict, Compatibility::Compatible);

        let caps = get_architecture_capabilities("unknown_arch");
        assert_eq!(caps.architecture, None);
        assert_eq!(caps.verdict, Compatibility::MaybeIncompatible);
    }

    #[test]
    fn test_display_name() {
        let caps = GgufCapabilities::qwen3_asr();
        assert_eq!(caps.display_name(), "Qwen3-ASR");

        let caps = GgufCapabilities::whisper();
        assert_eq!(caps.display_name(), "Whisper");

        let caps = GgufCapabilities::default();
        assert_eq!(caps.display_name(), "Unknown");

        let caps = GgufCapabilities::unknown();
        assert_eq!(caps.display_name(), "Unknown");
    }

    #[test]
    fn test_capabilities_serialization() {
        let caps = GgufCapabilities::qwen3_asr();
        let json = serde_json::to_string(&caps).unwrap();
        assert!(json.contains("\"verdict\":\"Compatible\""));
        assert!(json.contains("\"architecture\":\"qwen3_asr\""));
        assert!(json.contains("\"supports_streaming\":false"));

        let decoded: GgufCapabilities = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, caps);
    }

    #[test]
    fn test_capabilities_default() {
        let caps = GgufCapabilities::default();
        assert_eq!(caps.verdict, Compatibility::MaybeIncompatible);
        assert_eq!(caps.architecture, None);
        assert_eq!(caps.supports_streaming, None);
        assert_eq!(caps.supports_translation, None);
        assert_eq!(caps.languages, None);
        // Unknown capabilities should return None for language check
        assert_eq!(caps.supports_language("zh"), None);
        assert_eq!(caps.supports_language("en"), None);
        // language_is_supported should assume supported when unknown
        assert!(caps.language_is_supported("zh"));
        assert!(caps.language_is_supported("en"));
    }

    #[test]
    fn test_compatibility_enum() {
        assert_eq!(Compatibility::default(), Compatibility::MaybeIncompatible);

        let compatible = Compatibility::Compatible;
        let maybe = Compatibility::MaybeIncompatible;
        let unsupported = Compatibility::Unsupported;

        assert_ne!(compatible, maybe);
        assert_ne!(compatible, unsupported);
        assert_ne!(maybe, unsupported);
    }

    #[test]
    fn test_unknown_capabilities() {
        let caps = GgufCapabilities::unknown();
        assert_eq!(caps.verdict, Compatibility::MaybeIncompatible);
        assert_eq!(caps.architecture, None);
        assert_eq!(caps.supports_streaming, None);
        assert_eq!(caps.supports_translation, None);
        assert_eq!(caps.supports_language_detect, None);
        assert_eq!(caps.languages, None);
    }
}
