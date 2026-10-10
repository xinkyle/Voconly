use anyhow::Result;

/// 音频解码器错误类型
#[derive(Debug, thiserror::Error)]
pub enum DecoderError {
    #[error("Unsupported audio format: {0}")]
    UnsupportedFormat(String),

    #[error("Failed to open audio file: {0}")]
    OpenError(String),

    #[error("Failed to decode audio: {0}")]
    DecodeError(String),

    #[error("No audio track found")]
    NoTrack,

    #[error("Invalid audio parameters")]
    InvalidParams,
}

/// 音频信息
#[derive(Debug, Clone)]
pub struct AudioInfo {
    /// 采样率
    pub sample_rate: u32,
    /// 声道数
    pub channels: u16,
    /// 总时长（秒）
    pub duration_secs: f64,
    /// 总样本数
    pub total_samples: u64,
}

/// 解码音频文件为 PCM 数据
///
/// # Arguments
/// * `path` - 音频文件路径
///
/// # Returns
/// * 16kHz 单声道 PCM 数据（f32 数组）
/// * 音频信息
pub fn decode_audio_file(path: &str) -> Result<(Vec<f32>, AudioInfo), DecoderError> {
    // 将在后续任务中实现
    todo!()
}

/// 获取音频文件信息（不解码全部内容）
///
/// # Arguments
/// * `path` - 音频文件路径
///
/// # Returns
/// * 音频信息
pub fn get_audio_info(path: &str) -> Result<AudioInfo, DecoderError> {
    // 将在后续任务中实现
    todo!()
}