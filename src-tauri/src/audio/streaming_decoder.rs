use super::decoder::{get_audio_info, AudioInfo, DecoderError};
use anyhow::Result;
use std::fs::File;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// 流式音频解码器
///
/// 用于处理大音频文件，避免一次性加载全部数据到内存
pub struct StreamingDecoder {
    /// 格式读取器
    format_reader: Box<dyn symphonia::core::formats::FormatReader>,
    /// 解码器
    decoder: Box<dyn symphonia::core::codecs::Decoder>,
    /// 音频信息
    audio_info: AudioInfo,
    /// 样本缓冲区
    sample_buf: Option<SampleBuffer<f32>>,
    /// 已处理的样本数
    processed_samples: u64,
    /// 是否已完成
    finished: bool,
}

impl StreamingDecoder {
    /// 创建流式解码器
    ///
    /// # Arguments
    /// * `path` - 音频文件路径
    pub fn new(path: &str) -> Result<Self, DecoderError> {
        // 获取音频信息
        let audio_info = get_audio_info(path)?;

        // 打开文件
        let file = File::open(path).map_err(|e| DecoderError::OpenError(e.to_string()))?;

        // 创建媒体流
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        // 创建格式探测提示
        let mut hint = Hint::new();
        if let Some(ext) = std::path::Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
        {
            hint.with_extension(ext);
        }

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
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| DecoderError::DecodeError(e.to_string()))?;

        Ok(Self {
            format_reader: probed.format,
            decoder,
            audio_info,
            sample_buf: None,
            processed_samples: 0,
            finished: false,
        })
    }

    /// 获取音频信息
    pub fn audio_info(&self) -> &AudioInfo {
        &self.audio_info
    }

    /// 读取下一个音频块
    ///
    /// # Arguments
    /// * `chunk_duration_secs` - 目标块时长（秒）
    ///
    /// # Returns
    /// * 下一个音频块的 PCM 数据（16kHz 单声道 f32）
    /// * 如果文件结束，返回 None
    pub fn next_chunk(
        &mut self,
        chunk_duration_secs: f32,
    ) -> Result<Option<Vec<f32>>, DecoderError> {
        if self.finished {
            return Ok(None);
        }

        // 计算目标样本数
        let target_samples = (chunk_duration_secs * 16000.0) as usize;
        let mut chunk_samples = Vec::with_capacity(target_samples);

        while chunk_samples.len() < target_samples {
            // 读取下一个包
            let packet = match self.format_reader.next_packet() {
                Ok(packet) => packet,
                Err(symphonia::core::errors::Error::IoError(e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    self.finished = true;
                    break;
                }
                Err(e) => return Err(DecoderError::DecodeError(e.to_string())),
            };

            // 解码包
            let decoded = self
                .decoder
                .decode(&packet)
                .map_err(|e| DecoderError::DecodeError(e.to_string()))?;

            // 创建样本缓冲区
            if self.sample_buf.is_none() {
                let spec = *decoded.spec();
                let duration = decoded.capacity() as u64;
                self.sample_buf = Some(SampleBuffer::<f32>::new(duration, spec));
            }

            // 复制样本
            if let Some(ref mut buf) = self.sample_buf {
                buf.copy_interleaved_ref(decoded);
                chunk_samples.extend_from_slice(buf.samples());
            }
        }

        if chunk_samples.is_empty() {
            return Ok(None);
        }

        // 混音为单声道（如果是立体声）
        let mono_samples = if self.audio_info.channels == 2 {
            mix_to_mono(&chunk_samples)
        } else {
            chunk_samples
        };

        // 重采样到 16kHz（如果不是 16kHz）
        let resampled = if self.audio_info.sample_rate != 16000 {
            resample_to_16k(&mono_samples, self.audio_info.sample_rate)?
        } else {
            mono_samples
        };

        // 更新进度
        self.processed_samples += resampled.len() as u64;

        Ok(Some(resampled))
    }

    /// 获取处理进度（0.0 - 1.0）
    ///
    /// 基于时长计算进度，因为 processed_samples 是重采样到 16kHz 后的样本数，
    /// 而 total_samples 是原始采样率下的样本数，直接相除会导致进度错误。
    pub fn progress(&self) -> f32 {
        if self.audio_info.duration_secs == 0.0 {
            return 0.0;
        }
        let processed_duration = self.processed_samples as f64 / 16000.0;
        (processed_duration / self.audio_info.duration_secs).min(1.0) as f32
    }

    /// 是否已完成
    pub fn is_finished(&self) -> bool {
        self.finished
    }
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