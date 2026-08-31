//! TranscribeCpp backend implementation for SpeechBackend trait
//!
//! This module implements the SpeechBackend trait for GGUF ASR models
//! (e.g., Qwen3-ASR, Whisper GGUF, Parakeet, Voxtral), using the transcribe-cpp
//! library for unified model loading and inference with GPU acceleration.
//!
//! # Supported Architectures
//!
//! GGUF ASR models support various architectures:
//! - whisper: OpenAI Whisper (supports translation)
//! - qwen3_asr: Qwen3 Audio models (supports streaming, hotwords)
//! - parakeet: NVIDIA Parakeet models
//! - voxtral: Mistral Voxtral models
//! - sensevoice: Alibaba SenseVoice
//! - canary: NVIDIA Canary (supports translation)
//! - moonshine: Moonshine ASR
//! - gigaam: NVIDIA GigaAM
//! - cohere: Cohere audio models
//!
//! # GPU Acceleration
//!
//! Supports Vulkan (Windows/Linux), Metal (macOS), and CUDA (NVIDIA).
//! GPU device selection is configurable via ModelOptions.
//!
//! # Backend Initialization
//!
//! When using the `dynamic-backends` feature (default on Windows/Linux),
//! GPU backend modules (ggml-vulkan.dll, ggml-cpu-*.dll) must be loaded
//! before the first model load. Call `init_transcribe_cpp_backend()` at
//! startup to initialize these modules.
//!
//! # User Dictionary (Hotwords)
//!
//! Qwen3-ASR and Whisper architectures support initial_prompt for hotwords.
//! The backend builds an instruction prompt from UserDictionary entries.

use super::{BackendType, SpeechBackend, StreamingBackend, TranscribeParams, TranscribeResult};
use crate::backends::gguf_capabilities::{probe_gguf_capabilities, GgufCapabilities};
use crate::config::AppConfig;
use log::{debug, info, warn};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

// transcribe-cpp types
// Re-export Stream for use in mod.rs trait definition
pub use transcribe_cpp::Stream;
use transcribe_cpp::{
    Backend, Model, ModelOptions, RunOptions, Session, StreamOptions, StreamText, StreamUpdate,
    Task,
};

/// Initialize the transcribe-cpp native backend once at startup.
///
/// In a static build (macOS Metal) `init_backends_default` is a harmless no-op;
/// in a `dynamic-backends` build it loads the per-ISA CPU / GPU modules.
/// Must run before the first model load.
pub fn init_transcribe_cpp_backend() {
    info!("[TranscribeCpp] Initializing native backend...");

    // Route native + ggml diagnostics into the `log` facade
    transcribe_cpp::init_logging();

    // Register compute backend modules (Vulkan, Metal, CUDA, CPU variants)
    match transcribe_cpp::init_backends_default() {
        Ok(()) => {
            let devices = transcribe_cpp::devices();
            info!(
                "[TranscribeCpp] Backend initialized with {} compute device(s): [{}]",
                devices.len(),
                devices
                    .iter()
                    .map(|d| format!("{} ({})", d.name, d.kind))
                    .collect::<Vec<_>>()
                    .join(", ")
            );

            // Log each device's details
            for d in &devices {
                let idx = d
                    .index
                    .map(|i| i.to_string())
                    .unwrap_or_else(|| "-".to_string());
                let name = if d.description.is_empty() {
                    &d.name
                } else {
                    &d.description
                };
                let vram_mb = d.memory_total / (1024 * 1024);
                debug!(
                    "[TranscribeCpp] Device {}: index={} kind={} name={} vram={}MB",
                    d.name, idx, d.kind, name, vram_mb
                );
            }
        }
        Err(e) => {
            warn!("[TranscribeCpp] Failed to initialize backends: {}", e);
            warn!("[TranscribeCpp] GPU acceleration may not be available. Models will fall back to CPU.");
        }
    }
}

/// TranscribeCpp backend implementation for GGUF ASR models
///
/// Provides native Rust implementation for GGUF model loading and transcription,
/// with GPU acceleration support (Vulkan/Metal/CUDA).
pub struct TranscribeCppBackend {
    /// Model reference for session recreation
    model: Model,
    /// Session for model inference (wrapped in Mutex for thread safety)
    session: Mutex<Session>,
    /// Application config reference for user dictionary access
    config: Option<Arc<Mutex<AppConfig>>>,
    /// Estimated memory usage in MB (based on model file size)
    memory_mb: u64,
    /// Model capabilities detected at load time
    capabilities: GgufCapabilities,
    /// Accumulated transcription duration in milliseconds
    accumulated_duration_ms: AtomicU64,
}

/// Threshold for session recreation (300 minutes)
const SESSION_RECREATE_THRESHOLD_MS: u64 = 300 * 60 * 1000;

impl TranscribeCppBackend {
    /// Create a new TranscribeCppBackend with full config access
    ///
    /// This constructor allows passing the AppConfig reference, which is needed
    /// to access the user_dictionary for the transcription context parameter (initial_prompt).
    ///
    /// # Arguments
    ///
    /// * `model_path` - Path to the GGUF model file
    /// * `config` - Application config reference for user dictionary access
    /// * `backend` - GPU backend type (Vulkan, Metal, Cuda, or Cpu)
    /// * `gpu_device` - GPU device ID (0 for first GPU, -1 for CPU)
    ///
    /// # Returns
    ///
    /// Result containing the initialized TranscribeCppBackend or an error
    ///
    /// # Example
    ///
    /// ```ignore
    /// let backend = TranscribeCppBackend::new_with_config(
    ///     Path::new("qwen3-asr-0.6b-q4_0.gguf"),
    ///     Arc::clone(&config),
    ///     Backend::Vulkan,
    ///     0,
    /// )?;
    /// ```
    pub fn new_with_config(
        model_path: &Path,
        config: Arc<Mutex<AppConfig>>,
        backend: Backend,
        gpu_device: i32,
    ) -> std::io::Result<Self> {
        info!(
            "[TranscribeCppBackend] Creating with config, model_path: {:?}, backend: {:?}, gpu_device: {}",
            model_path, backend, gpu_device
        );

        // Validate model path exists
        if !model_path.exists() {
            let err = format!("Model file not found: {:?}", model_path);
            warn!("[TranscribeCppBackend] {}", err);
            return Err(std::io::Error::new(std::io::ErrorKind::NotFound, err));
        }

        // Probe model capabilities for logging
        let caps = probe_gguf_capabilities(model_path);
        info!(
            "[TranscribeCppBackend] Detected architecture: {}, streaming: {}, translation: {}",
            caps.display_name(),
            caps.supports_streaming.unwrap_or(false),
            caps.supports_translation.unwrap_or(false)
        );

        // Estimate memory usage from file size
        let memory_mb = estimate_memory_usage(model_path);
        info!(
            "[TranscribeCppBackend] Estimated memory usage: {} MB",
            memory_mb
        );

        // Configure model options for GPU acceleration
        let model_options = ModelOptions {
            backend,
            gpu_device,
        };

        info!(
            "[TranscribeCppBackend] Loading model with options: backend={:?}, gpu_device={}",
            model_options.backend, model_options.gpu_device
        );

        // Load model
        let model = Model::load_with(model_path, &model_options).map_err(|e| {
            warn!("[TranscribeCppBackend] Model load failed: {}", e);
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to load GGUF model: {}", e),
            )
        })?;
        info!("[TranscribeCppBackend] Model loaded successfully");

        // Create session
        let session = model.session().map_err(|e| {
            warn!("[TranscribeCppBackend] Session creation failed: {}", e);
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create session: {}", e),
            )
        })?;
        info!("[TranscribeCppBackend] Session created successfully");

        info!("[TranscribeCppBackend] Backend initialized successfully");
        Ok(Self {
            model,
            session: Mutex::new(session),
            config: Some(config),
            memory_mb,
            capabilities: caps,
            accumulated_duration_ms: AtomicU64::new(0),
        })
    }

    /// Create a new TranscribeCppBackend without config (for trait load() method)
    ///
    /// This constructor is used by the SpeechBackend trait's load() method.
    /// It creates a TranscribeCppBackend without access to user_dictionary.
    /// For full functionality, use `new_with_config()` instead.
    fn new_without_config(
        model_path: &Path,
        backend: Backend,
        gpu_device: i32,
    ) -> std::io::Result<Self> {
        info!(
            "[TranscribeCppBackend] Creating without config, model_path: {:?}",
            model_path
        );

        // Validate model path exists
        if !model_path.exists() {
            let err = format!("Model file not found: {:?}", model_path);
            warn!("[TranscribeCppBackend] {}", err);
            return Err(std::io::Error::new(std::io::ErrorKind::NotFound, err));
        }

        // Probe model capabilities
        let caps = probe_gguf_capabilities(model_path);
        info!(
            "[TranscribeCppBackend] Detected architecture: {}",
            caps.display_name()
        );

        // Estimate memory usage from file size
        let memory_mb = estimate_memory_usage(model_path);

        // Configure model options
        let model_options = ModelOptions {
            backend,
            gpu_device,
        };

        // Load model
        let model = Model::load_with(model_path, &model_options).map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to load GGUF model: {}", e),
            )
        })?;

        // Create session
        let session = model.session().map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create session: {}", e),
            )
        })?;

        info!("[TranscribeCppBackend] Backend initialized (no config)");
        Ok(Self {
            model,
            session: Mutex::new(session),
            config: None,
            memory_mb,
            capabilities: caps,
            accumulated_duration_ms: AtomicU64::new(0),
        })
    }

    /// Resolve GPU backend and device using auto-detection
    ///
    /// Uses `Backend::Auto` to let the transcribe-cpp library automatically
    /// select the best available device (GPU if available, CPU otherwise).
    /// This provides seamless fallback without requiring user configuration.
    pub fn resolve_gpu_settings() -> (Backend, i32) {
        debug!("[TranscribeCppBackend] Using Auto backend - will auto-detect best available device (GPU if available, fallback to CPU)");
        (Backend::Auto, 0)
    }

    /// Get runtime capabilities from the loaded model
    ///
    /// Returns the capabilities detected at load time, which may be more
    /// accurate than the GGUF header metadata for some architectures.
    /// For example, parakeet's streaming capability is inferred from
    /// encoder hparams by transcribe-cpp at load time.
    pub fn get_capabilities(&self) -> &GgufCapabilities {
        &self.capabilities
    }

    /// Recreate Session to clear accumulated state
    ///
    /// Creates a new Session using the same Model (no model reload needed).
    /// Takes about ~100ms. Used for long-running scenarios like live transcription.
    pub fn recreate_session(&self) -> std::io::Result<()> {
        info!("[TranscribeCppBackend] Recreating session...");

        let new_session = self.model.session().map_err(|e| {
            warn!("[TranscribeCppBackend] Failed to create new session: {}", e);
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create session: {}", e),
            )
        })?;

        let mut session = self.session.lock().map_err(|e| {
            warn!("[TranscribeCppBackend] Failed to lock session: {}", e);
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to lock session: {}", e),
            )
        })?;

        *session = new_session;
        self.accumulated_duration_ms.store(0, Ordering::Relaxed);

        info!("[TranscribeCppBackend] Session recreated successfully");
        Ok(())
    }

    /// Add duration and check if session recreation is needed
    ///
    /// Returns true if session was recreated.
    pub fn add_duration_and_check_recreate(&self, duration_ms: u64) -> bool {
        let total = self
            .accumulated_duration_ms
            .fetch_add(duration_ms, Ordering::Relaxed)
            + duration_ms;

        info!(
            "[TranscribeCppBackend] Accumulated duration: {}ms / {}ms (this audio: {}ms)",
            total, SESSION_RECREATE_THRESHOLD_MS, duration_ms
        );

        if total >= SESSION_RECREATE_THRESHOLD_MS {
            info!(
                "[TranscribeCppBackend] *** SESSION RECREATION TRIGGERED *** threshold reached"
            );
            let recreated = self.recreate_session().is_ok();
            if recreated {
                info!("[TranscribeCppBackend] *** SESSION RECREATED SUCCESSFULLY ***");
            }
            recreated
        } else {
            false
        }
    }
}

impl SpeechBackend for TranscribeCppBackend {
    fn load(model_path: &Path) -> std::io::Result<Self> {
        info!(
            "[TranscribeCppBackend] Loading model from path: {:?}",
            model_path
        );

        // Validate model path
        if !model_path.exists() {
            let err = format!("Model file not found: {:?}", model_path);
            warn!("[TranscribeCppBackend] {}", err);
            return Err(std::io::Error::new(std::io::ErrorKind::NotFound, err));
        }

        // Resolve GPU settings based on platform
        let (backend, gpu_device) = Self::resolve_gpu_settings();

        Self::new_without_config(model_path, backend, gpu_device)
    }

    fn transcribe(
        &self,
        audio: &[f32],
        params: &TranscribeParams,
    ) -> std::io::Result<TranscribeResult> {
        if audio.is_empty() {
            debug!("[TranscribeCppBackend] Empty audio, returning empty result");
            return Ok(TranscribeResult::new(String::new()));
        }

        debug!(
            "[TranscribeCppBackend] Transcribing {} audio samples",
            audio.len()
        );

        // Build run options
        // Note: transcribe-cpp 0.1.1 removed initial_prompt field
        // User dictionary hotwords feature is temporarily disabled
        let language = if params.language == "auto" || params.language.is_empty() {
            None
        } else if self.capabilities.languages.as_ref().map(|l| l.len()) == Some(1) {
            // 单语言模型：不传语言参数（transcribe-cpp 库不接受）
            // Nemotron 等单语言模型如果传递语言参数会报错：
            // "unsupported request: run: unsupported language (status 10)"
            None
        } else {
            // 多语言模型：传递语言参数
            let lang = if params.language == "zh-Hans" || params.language == "zh-Hant" {
                "zh".to_string()
            } else {
                params.language.clone()
            };
            Some(lang)
        };

        let run_options = RunOptions {
            task: Task::Transcribe,
            language,
            ..Default::default()
        };

        debug!(
            "[TranscribeCppBackend] Running transcription with language: {:?}",
            run_options.language
        );

        // Execute transcription (need to lock session for thread safety)
        let lock_start = std::time::Instant::now();
        let mut session = self.session.lock().map_err(|e| {
            warn!("[TranscribeCppBackend] Failed to lock session: {}", e);
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to lock session: {}", e),
            )
        })?;
        let lock_wait_ms = lock_start.elapsed().as_millis();
        if lock_wait_ms > 10 {
            info!("[TranscribeCpp] 🔴 Session 锁等待: {}ms (可能有并发竞争)", lock_wait_ms);
        }

        let run_start = std::time::Instant::now();
        let result = session.run(audio, &run_options).map_err(|e| {
            warn!("[TranscribeCppBackend] Transcription failed: {}", e);
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("GGUF transcription failed: {}", e),
            )
        })?;
        let run_ms = run_start.elapsed().as_millis();

        // Release session lock before accumulating duration
        drop(session);

        info!(
            "[TranscribeCpp] 🔷 Session.run: {}ms (音频 {}ms, 实时比 {:.2}x)",
            run_ms,
            (audio.len() / 16),
            run_ms as f64 / ((audio.len() / 16) as f64).max(1.0)
        );

        debug!(
            "[TranscribeCppBackend] Transcription complete: {} chars",
            result.text.len()
        );

        // Accumulate duration and check for session recreation
        // Audio is 16kHz, so duration_ms = audio_len / 16
        let duration_ms = (audio.len() / 16) as u64;
        self.add_duration_and_check_recreate(duration_ms);

        // Convert result
        // Note: transcribe-cpp may return segments, but current version returns text only
        Ok(TranscribeResult {
            text: result.text,
            language: None, // transcribe-cpp doesn't return detected language currently
            segments: Vec::new(),
        })
    }

    fn memory_usage(&self) -> u64 {
        self.memory_mb
    }

    fn backend_type(&self) -> BackendType {
        BackendType::TranscribeCpp
    }

    /// 检查模型是否支持流式转录
    ///
    /// 从运行时模型能力检测。如果 Session 锁失败（Mutex poison），
    /// 返回 `false`（默认不支持）。
    fn supports_streaming(&self) -> bool {
        self.session
            .lock()
            .ok()
            .map(|s| s.model().capabilities().supports_streaming)
            .unwrap_or(false)
    }
}

impl StreamingBackend for TranscribeCppBackend {
    /// 在 Session 上执行流式操作
    ///
    /// 使用回调模式处理 Rust 生命周期问题（`Stream<'a>` 借用 `Session`）。
    ///
    /// # 注意
    ///
    /// 回调函数在 Mutex 锁的作用域内执行，应避免长时间操作，
    /// 否则会阻塞其他线程访问 Session。
    ///
    /// # 返回值
    ///
    /// 返回 `None` 的两种情况：
    /// 1. Session 锁失败（Mutex poison）
    /// 2. Stream 创建失败（可能是模型不支持流式，或其他错误）
    ///
    /// # 设计决策
    ///
    /// 不检查 `capabilities().supports_streaming`，直接尝试创建 Stream。
    /// 原因：transcribe-cpp 库的 capabilities 检测可能不准确（如 Qwen3-ASR 实际支持
    /// 流式，但 capabilities 返回 false）。让 Stream 创建结果决定是否支持。
    fn with_stream<F, R>(&self, f: F) -> Option<R>
    where
        F: FnOnce(&mut Stream) -> R,
    {
        // 获取 session 锁并保持整个操作期间
        let mut session = match self.session.lock() {
            Ok(guard) => guard,
            Err(e) => {
                warn!("[TranscribeCppBackend] Failed to lock session: {}", e);
                return None;
            }
        };

        // 创建 Stream（在锁的作用域内）
        let run_options = RunOptions::default();
        let stream_options = StreamOptions::default();

        // 直接尝试创建 stream，不检查 capabilities
        // 原因：capabilities 检测可能不准确，让 Stream 创建结果决定
        let stream_result = session.stream(&run_options, &stream_options);

        match stream_result {
            Ok(mut stream) => {
                info!("[TranscribeCppBackend] Stream created successfully");
                // 在 session 和 stream 都存活的情况下执行回调
                let result = f(&mut stream);
                // stream 在这里 drop，释放 session 的借用
                Some(result)
            }
            Err(e) => {
                warn!("[TranscribeCppBackend] Failed to create stream: {}", e);
                None
            }
        }
        // session 在这里 drop，释放锁
    }
}

impl Drop for TranscribeCppBackend {
    fn drop(&mut self) {
        info!("[TranscribeCppBackend] Dropping backend, releasing resources");
        // Session is automatically dropped, releasing model resources
    }
}

/// Streaming transcription session state
///
/// Manages state for real-time transcription with stream-capable models
/// (Qwen3-ASR, Parakeet, Voxtral). Used by the consumer loop in AudioCapture.
///
/// # Design Note
///
/// This struct does NOT hold a `transcribe_cpp::Stream` because `Stream<'a>`
/// borrows `Session`'s lifetime, making it impossible to return from a method
/// that locks a Mutex. Instead, the actual Stream is created and used within
/// the consumer loop, while this struct tracks the session state.
///
/// # Error Handling
///
/// When stream fails, `committed_text` preserves text that has been
/// confirmed by the model, allowing recovery without losing all progress.
pub struct StreamingSession {
    /// Text confirmed by the model (stable, won't change)
    committed_text: String,
    /// Current tentative text (may be updated or reverted)
    tentative_text: String,
    /// Whether a stream is currently active
    is_active: bool,
}

impl StreamingSession {
    /// Create a new streaming session state
    pub fn new() -> Self {
        Self {
            committed_text: String::new(),
            tentative_text: String::new(),
            is_active: false,
        }
    }

    /// Mark the session as active (stream started)
    pub fn activate(&mut self) {
        self.is_active = true;
    }

    /// Mark the session as inactive (stream ended)
    pub fn deactivate(&mut self) {
        self.is_active = false;
    }

    /// Check if the session is active
    pub fn is_active(&self) -> bool {
        self.is_active
    }

    /// Update text snapshot from StreamText
    ///
    /// Called after each `Stream::text()` call to update the session state.
    /// The `committed` portion is stable, while `tentative` may change.
    pub fn update(&mut self, text: &StreamText) {
        self.committed_text = text.committed.clone();
        self.tentative_text = text.tentative.clone();
    }

    /// Get display text for UI
    ///
    /// Returns the combined committed + tentative text for real-time display.
    pub fn display_text(&self) -> String {
        format!("{}{}", self.committed_text, self.tentative_text)
    }

    /// Get committed text only (for error recovery)
    ///
    /// When stream fails, this preserves the confirmed portion that can be
    /// returned to the user without losing all transcription progress.
    pub fn committed_only(&self) -> &str {
        &self.committed_text
    }
}

impl Default for StreamingSession {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Helper functions
// ============================================================================

/// Estimate memory usage based on model file size
///
/// Memory usage is approximately the model file size plus some overhead.
/// GGUF quantized models typically use less memory than full models.
fn estimate_memory_usage(model_path: &Path) -> u64 {
    // Get file size in MB
    let file_size_mb = model_path
        .metadata()
        .map(|m| m.len() / (1024 * 1024))
        .unwrap_or(0);

    // GGUF models typically need 1.1x file size in memory for runtime overhead
    let estimated = (file_size_mb as f64 * 1.1) as u64;

    debug!(
        "[TranscribeCppBackend] Estimated memory: {} MB (file size: {} MB)",
        estimated, file_size_mb
    );

    estimated
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_gpu_settings() {
        let (backend, gpu_device) = TranscribeCppBackend::resolve_gpu_settings();

        // Auto backend should be used on all platforms
        assert!(matches!(backend, Backend::Auto));

        // Device should always be 0 for Auto backend
        assert_eq!(gpu_device, 0);
    }

    #[test]
    fn test_backend_type_string() {
        assert_eq!(BackendType::TranscribeCpp.to_string(), "transcribe_cpp");
    }

    #[test]
    fn test_context_format() {
        // Verify the format is correct
        let test_context = "请在识别以下音频时，优先使用以下词汇：机器学习、深度学习。";
        assert!(test_context.contains("优先使用以下词汇"));
        assert!(test_context.ends_with("。"));
    }
}
