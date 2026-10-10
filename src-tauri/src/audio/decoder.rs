use anyhow::Result;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

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

/// 检测音频文件格式
fn detect_format(path: &str) -> Result<Hint, DecoderError> {
    let file_path = Path::new(path);

    if !file_path.exists() {
        return Err(DecoderError::OpenError(format!("File not found: {}", path)));
    }

    let mut hint = Hint::new();

    // 从扩展名推断格式
    if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    Ok(hint)
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
    // 打开文件
    let file = std::fs::File::open(path)
        .map_err(|e| DecoderError::OpenError(e.to_string()))?;

    // 创建媒体流
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // 创建格式探测提示
    let hint = detect_format(path)?;

    // 探测格式
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| DecoderError::DecodeError(e.to_string()))?;

    // 获取默认音频轨道
    let track = probed
        .format
        .default_track()
        .ok_or(DecoderError::NoTrack)?;

    // 获取音频参数
    let codec_params = &track.codec_params;
    let sample_rate = codec_params.sample_rate.ok_or(DecoderError::InvalidParams)?;
    let channels = codec_params.channels.ok_or(DecoderError::InvalidParams)?.count() as u16;

    // 计算时长
    let duration_secs = if let (Some(tb), Some(n_frames)) =
        (codec_params.time_base, codec_params.n_frames)
    {
        let duration_ts = n_frames as f64;
        duration_ts * tb.numer as f64 / tb.denom as f64
    } else {
        // 无法从元数据获取时长，返回 0（后续可通过完整解码获取）
        0.0
    };

    // 计算总样本数
    let total_samples = (duration_secs * sample_rate as f64) as u64;

    Ok(AudioInfo {
        sample_rate,
        channels,
        duration_secs,
        total_samples,
    })
}