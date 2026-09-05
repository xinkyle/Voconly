use serde::{Deserialize, Serialize};
use std::path::Path;

/// 后端类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackendType {
    TranscribeCpp, // GGUF 模型（GPU 加速）
}

impl Default for BackendType {
    fn default() -> Self {
        BackendType::TranscribeCpp
    }
}

impl BackendType {
    /// 是否支持原生热词（通过模型参数传递）
    pub fn supports_native_hotwords(&self) -> bool {
        // TranscribeCpp (GGUF) 支持 initial_prompt 热词
        matches!(self, BackendType::TranscribeCpp)
    }
}

impl std::fmt::Display for BackendType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackendType::TranscribeCpp => write!(f, "transcribe_cpp"),
        }
    }
}

impl std::str::FromStr for BackendType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "transcribe_cpp" | "transcribecpp" | "transcribe-cpp" => Ok(BackendType::TranscribeCpp),
            _ => Err(format!("Unknown backend type: {}", s)),
        }
    }
}

/// 加载策略
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "idle_timeout")]
pub enum LoadStrategy {
    /// 模型常驻内存，应用启动时加载
    Always,
    /// 按需加载，空闲N秒后卸载
    Lazy { idle_timeout: u64 },
}

impl Default for LoadStrategy {
    fn default() -> Self {
        LoadStrategy::Lazy { idle_timeout: 300 } // 默认5分钟
    }
}

impl LoadStrategy {
    pub fn is_always(&self) -> bool {
        matches!(self, LoadStrategy::Always)
    }
}

/// 转录参数
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TranscribeParams {
    /// 语言代码，如 "zh", "en", "auto" 表示自动检测
    pub language: String,
    /// 是否翻译为英语
    pub translate: bool,
    /// 初始提示词，用于引导识别结果
    pub initial_prompt: Option<String>,
    /// 是否启用timestamps
    pub with_timestamps: bool,
}

/// 转录结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscribeResult {
    /// 识别的文本
    pub text: String,
    /// 语言（如果是自动检测）
    pub language: Option<String>,
    /// 每个片段的信息
    pub segments: Vec<TranscribeSegment>,
}

impl TranscribeResult {
    pub fn new(text: String) -> Self {
        Self {
            text,
            language: None,
            segments: Vec::new(),
        }
    }
}

/// 转录片段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscribeSegment {
    /// 片段文本
    pub text: String,
    /// 开始时间（秒）
    pub start: f32,
    /// 结束时间（秒）
    pub end: f32,
}

/// 统一的语音识别后端接口
pub trait SpeechBackend: Send + Sync {
    /// 加载模型
    fn load(model_path: &Path) -> std::io::Result<Self>
    where
        Self: Sized;

    /// 转录音频
    fn transcribe(
        &self,
        audio: &[f32],
        params: &TranscribeParams,
    ) -> std::io::Result<TranscribeResult>;

    /// 获取内存占用估算（MB）
    fn memory_usage(&self) -> u64;

    /// 获取后端类型
    fn backend_type(&self) -> BackendType;

    /// 检查是否支持流式转录
    fn supports_streaming(&self) -> bool {
        false // 默认实现：不支持
    }
}

/// 流式转录后端接口（独立于 SpeechBackend）
///
/// 此 trait 包含泛型方法，因此不能作为 dyn trait 使用。
/// 在需要流式转录时，通过后端类型判断并调用具体类型的实现。
pub trait StreamingBackend: Send {
    /// 在 Session 上执行流式操作（由 worker 线程调用）
    ///
    /// 这个方法的设计是为了处理 Rust 的生命周期问题：
    /// - `Stream<'a>` 借用 `Session` 的生命周期
    /// - 不能在方法中返回 `&Session` 后再创建 `Stream`
    /// - 所以提供一个回调接口，在锁内执行流式操作
    fn with_stream<F, R>(&self, f: F) -> Option<R>
    where
        F: FnOnce(&mut transcribe_cpp::Stream) -> R;
}

/// TranscribeCpp backend implementation (GGUF ASR models)
pub mod transcribe_cpp;
pub use transcribe_cpp::{init_transcribe_cpp_backend, TranscribeCppBackend};

/// GGUF metadata parser
pub mod gguf_meta;

/// GGUF capabilities detection for GGUF ASR models
pub mod gguf_capabilities;
pub use gguf_capabilities::{
    get_architecture_capabilities, probe_gguf_capabilities, Compatibility, GgufCapabilities,
    KNOWN_ARCHES,
};
