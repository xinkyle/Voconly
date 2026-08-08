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
//! # Language Information Source
//!
//! **重要变更**：语言信息优先从 GGUF Header 读取，实现零配置自动发现。
//! - GGUF Header 中的 `general.languages` 是能力的唯一真实来源
//! - 预设文件仅用于 Catalog 展示（下载信息、展示名称）
//! - 如果 GGUF 缺失语言列表，使用预设文件的值作为 fallback
//! - 如果预设也不存在，使用默认值 ['zh', 'en']
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
    /// Create capabilities for Whisper architecture
    ///
    /// Whisper supports translation to English and is multilingual.
    /// It also supports automatic language detection.
    /// 注意：Whisper 不支持流式转录（offline only）。
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    /// 默认语言列表：中英文（实际支持更多语言）。
    pub fn whisper() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("whisper".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(true),
            supports_language_detect: Some(true),
            languages: get_default_languages("whisper"),
        }
    }

    /// Create capabilities for Qwen3-ASR architecture
    ///
    /// Qwen3-ASR does NOT support streaming transcription (offline only).
    /// Supports Chinese, English, Japanese, Korean with auto language detection.
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn qwen3_asr() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("qwen3_asr".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: get_default_languages("qwen3_asr"),
        }
    }

    /// Create capabilities for Parakeet architecture
    ///
    /// NVIDIA Parakeet supports streaming, optimized for European languages.
    /// 支持25种欧洲语言，支持自动语言检测。
    /// 注意：streaming 能力取决于具体模型，Parakeet Unified EN 支持流式，Parakeet TDT 不支持。
    /// 这里统一设置为支持流式，Parakeet TDT 的非流式设置由预设文件处理。
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn parakeet() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("parakeet".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: get_default_languages("parakeet"),
        }
    }

    /// Create capabilities for Voxtral architecture
    ///
    /// Mistral Voxtral supports streaming transcription.
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn voxtral() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("voxtral".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: get_default_languages("voxtral"),
        }
    }

    /// Create capabilities for SenseVoice architecture
    ///
    /// Alibaba SenseVoice supports Chinese, Cantonese, and major Asian languages.
    /// 支持5种语言：中文、英文、粤语、日文、韩文
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn sensevoice() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("sensevoice".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: get_default_languages("sensevoice"),
        }
    }

    /// Create capabilities for Canary architecture
    ///
    /// NVIDIA Canary supports streaming and translation.
    /// 默认使用 Canary 1B v2 的25种欧洲语言列表。
    /// 注意：Canary 180M Flash 只支持4种语言，需要根据具体模型区分。
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn canary() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("canary".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(true),
            supports_language_detect: Some(true),
            languages: get_default_languages("canary"),
        }
    }

    /// Create capabilities for Moonshine architecture
    ///
    /// Moonshine is optimized for English transcription.
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn moonshine() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("moonshine".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(false),
            languages: get_default_languages("moonshine"),
        }
    }

    /// Create capabilities for GigaAM architecture
    ///
    /// NVIDIA GigaAM supports streaming, optimized for Russian.
    /// 仅支持俄语
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn gigaam() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("gigaam".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(false),
            supports_language_detect: Some(false),
            languages: get_default_languages("gigaam"),
        }
    }

    /// Create capabilities for Cohere architecture
    ///
    /// Cohere audio models do NOT support streaming transcription (offline only).
    /// Cohere Transcribe 03-2026 需要指定语言，不支持自动语言检测。
    /// 支持14种语言
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn cohere() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("cohere".to_string()),
            supports_streaming: Some(false),
            supports_translation: Some(false),
            supports_language_detect: Some(false),
            languages: get_default_languages("cohere"),
        }
    }

    /// Create capabilities for Nemotron architecture
    ///
    /// NVIDIA Nemotron ASR models support streaming and auto language detection.
    /// Nemotron Streaming 系列支持流式处理。
    ///
    /// 注意：此函数仅用于文件名推断的 fallback，不用于 GGUF Header 解析。
    pub fn nemotron() -> Self {
        Self {
            verdict: Compatibility::Compatible,
            architecture: Some("nemotron".to_string()),
            supports_streaming: Some(true),
            supports_translation: Some(false),
            supports_language_detect: Some(true),
            languages: get_default_languages("nemotron"),
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
    /// 对于所有架构（包括已知架构），优先使用 GGUF Header 的能力信息。
    /// 实现零配置自动发现，GGUF Header 是能力的唯一真实来源。
    ///
    /// 注意：GGUF 中的架构名可能是大小写混合（如 "Cohere"），
    /// 需要转换为小写后再匹配 KNOWN_ARCHES。
    ///
    /// 如果 GGUF Header 缺失某些能力字段，使用架构默认值作为 fallback。
    pub fn from_metadata(meta: &GgufMetadata) -> Self {
        let architecture = meta.get_str(KEY_ARCH).map(str::to_string);

        // 对于已知架构，仍然从 GGUF Header 读取能力，但使用默认值作为 fallback
        if let Some(ref arch) = architecture {
            let arch_lower = arch.to_lowercase();
            if KNOWN_ARCHES.contains(&arch_lower.as_str()) {
                // ✅ 新逻辑：从 GGUF Header 读取所有能力
                // 如果 GGUF 缺失某些字段，使用架构默认值作为 fallback
                return GgufCapabilities {
                    verdict: Compatibility::Compatible,
                    architecture: Some(arch_lower.clone()),
                    supports_streaming: meta.get_bool(KEY_CAP_STREAMING)
                        .or_else(|| get_default_streaming(&arch_lower)),
                    supports_translation: meta.get_bool(KEY_CAP_TRANSLATE)
                        .or_else(|| get_default_translation(&arch_lower)),
                    supports_language_detect: meta.get_bool(KEY_CAP_LANG_DETECT)
                        .or_else(|| get_default_lang_detect(&arch_lower)),
                    languages: meta.get_string_array(KEY_LANGUAGES)
                        .or_else(|| get_default_languages(&arch_lower)),
                };
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
        // 注意：只有特定模型支持流式，这里按架构统一处理
        if supports_streaming.is_none() {
            if let Some(ref arch) = architecture {
                supports_streaming = match arch.as_str() {
                    // Architectures known to support streaming
                    "parakeet" | "voxtral" | "voxtral_realtime" | "canary" | "gigaam"
                    | "nemotron" => Some(true),
                    // Architectures known to NOT support streaming
                    "whisper" | "qwen3_asr" | "sensevoice" | "moonshine" | "cohere"
                    | "cohere_asr" => Some(false),
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
        Ok(meta) => {
            // 输出 GGUF header 原始能力数据，用于调试
            log::info!(
                "[GGUF Header] {:?} -> architecture={:?}, name={:?}, variant={:?}, languages={:?}, streaming={:?}, translate={:?}, lang_detect={:?}",
                path.file_name().unwrap_or_default(),
                meta.get_str(KEY_ARCH),
                meta.get_str(KEY_NAME),
                meta.get_str(KEY_VARIANT),
                meta.get_string_array(KEY_LANGUAGES),
                meta.get_bool(KEY_CAP_STREAMING),
                meta.get_bool(KEY_CAP_TRANSLATE),
                meta.get_bool(KEY_CAP_LANG_DETECT)
            );
            Some(GgufCapabilities::from_metadata(&meta))
        }
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
    // 所有 Parakeet 模型统一使用 parakeet() 能力，语言列表从预设读取
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

// ============================================================================
// 架构默认能力辅助函数
// ============================================================================

/// Get default streaming capability for an architecture
///
/// Used as fallback when GGUF header doesn't contain streaming capability.
pub fn get_default_streaming(arch: &str) -> Option<bool> {
    match arch {
        "parakeet" | "voxtral" | "voxtral_realtime" | "canary" | "canary_qwen" | "gigaam" | "nemotron" => Some(true),
        "whisper" | "qwen3_asr" | "sensevoice" | "moonshine" | "moonshine_streaming" | "cohere" | "cohere_asr" => Some(false),
        _ => None,
    }
}

/// Get default translation capability for an architecture
///
/// Used as fallback when GGUF header doesn't contain translation capability.
pub fn get_default_translation(arch: &str) -> Option<bool> {
    match arch {
        "whisper" | "canary" | "canary_qwen" => Some(true),
        "parakeet" | "qwen3_asr" | "voxtral" | "voxtral_realtime" | "sensevoice" | "moonshine" | "moonshine_streaming" | "gigaam" | "cohere" | "cohere_asr" | "nemotron" => Some(false),
        _ => None,
    }
}

/// Get default language detection capability for an architecture
///
/// Used as fallback when GGUF header doesn't contain language detection capability.
pub fn get_default_lang_detect(arch: &str) -> Option<bool> {
    match arch {
        "whisper" | "qwen3_asr" | "voxtral" | "voxtral_realtime" | "sensevoice" | "canary" | "canary_qwen" | "nemotron" => Some(true),
        "parakeet" | "moonshine" | "moonshine_streaming" | "gigaam" | "cohere" | "cohere_asr" => Some(false),
        _ => None,
    }
}

/// Get default language list for an architecture
///
/// Used as fallback when GGUF header doesn't contain language list.
/// Returns None if the architecture is unknown or has no known default languages.
fn get_default_languages(arch: &str) -> Option<Vec<String>> {
    match arch {
        "whisper" => Some(vec!["zh".to_string(), "en".to_string()]), // Whisper 支持多语言，默认返回中英文
        "qwen3_asr" => Some(vec!["zh".to_string(), "en".to_string(), "ja".to_string(), "ko".to_string()]),
        "parakeet" => Some(vec!["en".to_string()]), // Parakeet 默认欧洲语言
        "voxtral" | "voxtral_realtime" => Some(vec!["en".to_string(), "zh".to_string()]), // Voxtral 支持多语言
        "sensevoice" => Some(vec!["zh".to_string(), "en".to_string(), "yue".to_string(), "ja".to_string(), "ko".to_string()]),
        "canary" | "canary_qwen" => Some(vec!["en".to_string()]), // Canary 默认欧洲语言
        "moonshine" | "moonshine_streaming" => Some(vec!["en".to_string()]),
        "gigaam" => Some(vec!["ru".to_string()]),
        "cohere" | "cohere_asr" => Some(vec!["en".to_string()]), // Cohere 支持多语言
        "nemotron" => Some(vec!["en".to_string()]), // Nemotron 支持多语言
        _ => None,
    }
}

/// Get architecture-specific capabilities
///
/// Returns the predefined capabilities for a known architecture.
/// Returns unknown capabilities for unsupported architectures.
///
/// 注意：此函数仅用于文件名推断的 fallback 场景，不用于 GGUF Header 解析。
/// GGUF Header 解析使用 `from_metadata()` 函数。
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
        // 语言列表使用默认值（中英文）
        assert!(caps.languages.is_some());
        let langs = caps.languages.unwrap();
        assert!(langs.contains(&"zh".to_string()));
        assert!(langs.contains(&"en".to_string()));
    }

    #[test]
    fn test_qwen3_asr_capabilities() {
        let caps = GgufCapabilities::qwen3_asr();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("qwen3_asr".to_string()));
        assert_eq!(caps.supports_streaming, Some(false));
        assert_eq!(caps.supports_translation, Some(false));
        // 语言列表使用默认值
        assert!(caps.languages.is_some());
        let langs = caps.languages.unwrap();
        assert!(langs.contains(&"zh".to_string()));
        assert!(langs.contains(&"en".to_string()));
        assert!(langs.contains(&"ja".to_string()));
        assert!(langs.contains(&"ko".to_string()));
    }

    #[test]
    fn test_parakeet_capabilities() {
        let caps = GgufCapabilities::parakeet();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("parakeet".to_string()));
        assert_eq!(caps.supports_streaming, Some(true));
        assert_eq!(caps.supports_translation, Some(false));
        assert_eq!(caps.supports_language_detect, Some(true));
        // 语言列表使用默认值
        assert!(caps.languages.is_some());
        let langs = caps.languages.unwrap();
        assert!(langs.contains(&"en".to_string()));
    }

    #[test]
    fn test_sensevoice_capabilities() {
        let caps = GgufCapabilities::sensevoice();
        assert_eq!(caps.verdict, Compatibility::Compatible);
        assert_eq!(caps.architecture, Some("sensevoice".to_string()));
        assert_eq!(caps.supports_streaming, Some(false));
        assert_eq!(caps.supports_translation, Some(false));
        // 语言列表使用默认值
        assert!(caps.languages.is_some());
        let langs = caps.languages.unwrap();
        assert!(langs.contains(&"zh".to_string()));
        assert!(langs.contains(&"en".to_string()));
        assert!(langs.contains(&"yue".to_string()));
        assert!(langs.contains(&"ja".to_string()));
        assert!(langs.contains(&"ko".to_string()));
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
        assert_eq!(caps.supports_language_detect, Some(true));
        // 语言列表使用默认值
        assert!(caps.languages.is_some());
        let langs = caps.languages.unwrap();
        assert!(langs.contains(&"en".to_string()));
    }

    #[test]
    fn test_probe_parakeet_unified_en_filename() {
        // parakeet-unified-en 是英语专用模型
        let path = PathBuf::from("parakeet-unified-en-0.6b-F16.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.architecture, Some("parakeet".to_string()));
        assert_eq!(caps.supports_streaming, Some(true));
        assert_eq!(caps.supports_language_detect, Some(true));
        // 语言列表使用默认值
        assert!(caps.languages.is_some());
        let langs = caps.languages.unwrap();
        assert!(langs.contains(&"en".to_string()));
    }

    #[test]
    fn test_probe_parakeet_unified_en_lowercase() {
        // 测试小写文件名
        let path = PathBuf::from("parakeet-unified-en-0.6b-q5_k_m.gguf");
        let caps = probe_from_filename(&path);
        assert_eq!(caps.architecture, Some("parakeet".to_string()));
        assert_eq!(caps.supports_language_detect, Some(true));
        // 语言列表使用默认值
        assert!(caps.languages.is_some());
        let langs = caps.languages.unwrap();
        assert!(langs.contains(&"en".to_string()));
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

    // ========== 新增：测试 GGUF Header 优先级和 fallback 机制 ==========

    #[test]
    fn test_default_streaming_function() {
        // 测试支持流式的架构
        assert_eq!(get_default_streaming("parakeet"), Some(true));
        assert_eq!(get_default_streaming("voxtral"), Some(true));
        assert_eq!(get_default_streaming("canary"), Some(true));
        assert_eq!(get_default_streaming("gigaam"), Some(true));
        assert_eq!(get_default_streaming("nemotron"), Some(true));

        // 测试不支持流式的架构
        assert_eq!(get_default_streaming("whisper"), Some(false));
        assert_eq!(get_default_streaming("qwen3_asr"), Some(false));
        assert_eq!(get_default_streaming("sensevoice"), Some(false));
        assert_eq!(get_default_streaming("moonshine"), Some(false));
        assert_eq!(get_default_streaming("cohere"), Some(false));

        // 测试未知架构
        assert_eq!(get_default_streaming("unknown_arch"), None);
    }

    #[test]
    fn test_default_translation_function() {
        // 测试支持翻译的架构
        assert_eq!(get_default_translation("whisper"), Some(true));
        assert_eq!(get_default_translation("canary"), Some(true));

        // 测试不支持翻译的架构
        assert_eq!(get_default_translation("qwen3_asr"), Some(false));
        assert_eq!(get_default_translation("parakeet"), Some(false));
        assert_eq!(get_default_translation("voxtral"), Some(false));
        assert_eq!(get_default_translation("sensevoice"), Some(false));
        assert_eq!(get_default_translation("moonshine"), Some(false));
        assert_eq!(get_default_translation("gigaam"), Some(false));
        assert_eq!(get_default_translation("cohere"), Some(false));
        assert_eq!(get_default_translation("nemotron"), Some(false));

        // 测试未知架构
        assert_eq!(get_default_translation("unknown_arch"), None);
    }

    #[test]
    fn test_default_lang_detect_function() {
        // 测试支持语言检测的架构
        assert_eq!(get_default_lang_detect("whisper"), Some(true));
        assert_eq!(get_default_lang_detect("qwen3_asr"), Some(true));
        assert_eq!(get_default_lang_detect("voxtral"), Some(true));
        assert_eq!(get_default_lang_detect("sensevoice"), Some(true));
        assert_eq!(get_default_lang_detect("canary"), Some(true));
        assert_eq!(get_default_lang_detect("nemotron"), Some(true));

        // 测试不支持语言检测的架构
        assert_eq!(get_default_lang_detect("parakeet"), Some(false));
        assert_eq!(get_default_lang_detect("moonshine"), Some(false));
        assert_eq!(get_default_lang_detect("gigaam"), Some(false));
        assert_eq!(get_default_lang_detect("cohere"), Some(false));
        assert_eq!(get_default_lang_detect("cohere_asr"), Some(false));

        // 测试未知架构
        assert_eq!(get_default_lang_detect("unknown_arch"), None);
    }

    #[test]
    fn test_default_languages_function() {
        // 测试已知架构的默认语言列表
        let whisper_langs = get_default_languages("whisper").unwrap();
        assert!(whisper_langs.contains(&"zh".to_string()));
        assert!(whisper_langs.contains(&"en".to_string()));

        let qwen_langs = get_default_languages("qwen3_asr").unwrap();
        assert!(qwen_langs.contains(&"zh".to_string()));
        assert!(qwen_langs.contains(&"en".to_string()));
        assert!(qwen_langs.contains(&"ja".to_string()));
        assert!(qwen_langs.contains(&"ko".to_string()));

        let sensevoice_langs = get_default_languages("sensevoice").unwrap();
        assert!(sensevoice_langs.contains(&"zh".to_string()));
        assert!(sensevoice_langs.contains(&"en".to_string()));
        assert!(sensevoice_langs.contains(&"yue".to_string()));
        assert!(sensevoice_langs.contains(&"ja".to_string()));
        assert!(sensevoice_langs.contains(&"ko".to_string()));

        // 测试未知架构
        assert_eq!(get_default_languages("unknown_arch"), None);
    }

    #[test]
    fn test_architecture_functions_return_default_languages() {
        // 测试架构函数返回默认语言列表（不再是 None）
        let caps = GgufCapabilities::whisper();
        assert!(caps.languages.is_some());

        let caps = GgufCapabilities::qwen3_asr();
        assert!(caps.languages.is_some());

        let caps = GgufCapabilities::parakeet();
        assert!(caps.languages.is_some());

        let caps = GgufCapabilities::sensevoice();
        assert!(caps.languages.is_some());
    }
}
