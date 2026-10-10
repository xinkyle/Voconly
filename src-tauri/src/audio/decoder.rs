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
    // 获取音频信息
    let info = get_audio_info(path)?;

    // 打开文件
    let file = std::fs::File::open(path)
        .map_err(|e| DecoderError::OpenError(e.to_string()))?;

    // 创建媒体流
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // 创建格式探测提示
    let hint = detect_format(path)?;

    // 探测格式
    let mut probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| DecoderError::DecodeError(e.to_string()))?;

    // 获取默认音频轨道
    let track = probed
        .format
        .default_track()
        .ok_or(DecoderError::NoTrack)?;

    // 创建解码器
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| DecoderError::DecodeError(e.to_string()))?;

    // 解码所有音频包
    let mut all_samples = Vec::new();
    let mut sample_buf = None;

    loop {
        // 读取下一个包
        let packet = match probed.format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                break; // 文件结束
            }
            Err(e) => {
                return Err(DecoderError::DecodeError(e.to_string()));
            }
        };

        // 解码包
        let decoded = decoder
            .decode(&packet)
            .map_err(|e| DecoderError::DecodeError(e.to_string()))?;

        // 转换为样本缓冲区
        if sample_buf.is_none() {
            let spec = *decoded.spec();
            let duration = decoded.capacity() as u64;
            sample_buf = Some(SampleBuffer::<f32>::new(duration, spec));
        }

        if let Some(ref mut buf) = sample_buf {
            buf.copy_interleaved_ref(decoded);

            // 将样本添加到结果中
            all_samples.extend_from_slice(buf.samples());
        }
    }

    // 混音为单声道（如果是立体声）
    let mono_samples = if info.channels == 2 {
        mix_to_mono(&all_samples)
    } else {
        all_samples
    };

    // 重采样到 16kHz（如果不是 16kHz）
    let resampled = if info.sample_rate != 16000 {
        resample_to_16k(&mono_samples, info.sample_rate)?
    } else {
        mono_samples
    };

    // 更新音频信息
    let final_info = AudioInfo {
        sample_rate: 16000,
        channels: 1,
        duration_secs: resampled.len() as f64 / 16000.0,
        total_samples: resampled.len() as u64,
    };

    Ok((resampled, final_info))
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

/// 将立体声混音为单声道
fn mix_to_mono(samples: &[f32]) -> Vec<f32> {
    let frame_count = samples.len() / 2;
    let mut mono = Vec::with_capacity(frame_count);

    for i in 0..frame_count {
        let left = samples[i * 2];
        let right = samples[i * 2 + 1];
        mono.push((left + right) / 2.0);
    }

    mono
}

/// 重采样到 16kHz（简化版：线性插值）
fn resample_to_16k(samples: &[f32], source_rate: u32) -> Result<Vec<f32>, DecoderError> {
    let ratio = 16000.0 / source_rate as f64;
    let new_len = (samples.len() as f64 * ratio) as usize;
    let mut resampled = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let src_idx = i as f64 / ratio;
        let src_idx_floor = src_idx.floor() as usize;

        // 线性插值
        if src_idx_floor + 1 < samples.len() {
            let frac = src_idx - src_idx_floor as f64;
            let sample = samples[src_idx_floor] * (1.0 - frac as f32)
                + samples[src_idx_floor + 1] * frac as f32;
            resampled.push(sample);
        } else if src_idx_floor < samples.len() {
            resampled.push(samples[src_idx_floor]);
        }
    }

    Ok(resampled)
}