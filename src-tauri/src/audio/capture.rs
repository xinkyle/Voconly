use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Sample, SizedSample};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use super::stream_router::{StreamCmd, StreamRouter};
use super::streaming::{run_stream_worker, StreamingTextEvent};
use super::{
    SensitivityLevel, SileroVad, SmoothedVad, VadFrame, VoiceActivityDetector, WHISPER_SAMPLE_RATE,
};
use crate::backends::probe_gguf_capabilities;
use std::path::PathBuf;

// ============================================================================
// 转录队列基础设施
// ============================================================================

use once_cell::sync::Lazy;
use std::collections::VecDeque;

/// 转录任务（使用 Arc 共享全量录音，只记录索引范围，避免复制）
struct TranscribeTask {
    full_recording: Arc<Mutex<Vec<f32>>>, // 共享全量录音
    start_index: usize,                   // 当前分段起始位置
    sample_count: usize,                  // 当前分段样本数
    scene_id: String,
    duration: f64,
}

/// 转录队列（全局静态，使用 Lazy 初始化）
static TRANSCRIBE_QUEUE: Lazy<Mutex<VecDeque<TranscribeTask>>> =
    Lazy::new(|| Mutex::new(VecDeque::new()));

/// 转录线程运行状态
static TRANSCRIBE_WORKER_RUNNING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// 停止信号（用于 Stop/Cancel 时通知转录线程退出）
static TRANSCRIBE_STOP_SIGNAL: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// 取消标志（用于 Cancel 时丢弃转录结果，不追加到 preview_text）
static TRANSCRIBE_CANCELLED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// 待转录总时长（用于进度条预估）
/// 入队时累加，Worker 完成时扣减
static PENDING_TRANSCRIBE_DURATION: Lazy<Mutex<f64>> = Lazy::new(|| Mutex::new(0.0));

/// 队列长度上限（防止内存无限膨胀）
const MAX_TRANSCRIBE_QUEUE_LEN: usize = 10;

// ============================================================================
// 常量定义
// ============================================================================

/// Maximum time to wait for audio chunks before considering the stream dead
const MAX_RECV_TIMEOUT_MS: u64 = 5000;

/// Minimum segment duration in seconds for streaming transcription
const MIN_SEGMENT_DURATION_SECS: f64 = 2.0;

/// Soft threshold: after this duration, VAD becomes more sensitive
/// (reduced hangover tolerance for faster segmentation on pauses)
const SOFT_THRESHOLD_SECS: f64 = 45.0;

/// Hard threshold: force segment if exceeded, regardless of VAD state
/// This prevents audio growing too long for ASR models
const HARD_THRESHOLD_SECS: f64 = 60.0;

/// Internal command for the audio worker thread
enum Cmd {
    Start(String), // scene_id
    Stop(mpsc::Sender<Vec<f32>>),
    Cancel,
    Shutdown,
    SetStreamingMode(bool),
}

/// Audio chunk from the capture callback
enum AudioChunk {
    Samples(Vec<f32>),
    EndOfStream,
}

/// Audio capture with VAD integration
pub struct AudioCapture {
    device: Option<Device>,
    cmd_tx: Option<mpsc::Sender<Cmd>>,
    worker_handle: Option<std::thread::JoinHandle<()>>,
    vad: Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
    app_handle: AppHandle,
}

impl AudioCapture {
    /// Create a new audio capture instance
    ///
    /// # Arguments
    /// * `app_handle` - Tauri app handle for emitting events
    /// * `vad_model_path` - Path to the Silero VAD model file
    pub fn new(app_handle: AppHandle, vad_model_path: &str) -> Result<Self> {
        // Initialize Silero VAD with hysteresis mechanism
        // threshold=0.5: enter speech state when prob > 0.5
        // neg_threshold=0.35: exit speech state when prob < 0.35
        // Hysteresis band (0.35-0.5): state unchanged, prevents flickering
        let silero = SileroVad::new(vad_model_path, 0.5, 0.35)
            .map_err(|e| anyhow::anyhow!("Failed to create SileroVad: {}", e))?;

        // Wrap with SmoothedVad for temporal smoothing
        // Prefill: 3 frames (96ms) - capture speech onset, reduce previous sentence tail inclusion
        // Hangover: 12 frames (384ms) - tolerate natural pauses (breath, thinking)
        // Onset: 2 frames (64ms) - require consecutive voice frames
        let smoothed_vad = SmoothedVad::new(Box::new(silero), 3, 12, 2);

        Ok(AudioCapture {
            device: None,
            cmd_tx: None,
            worker_handle: None,
            vad: Some(Arc::new(Mutex::new(Box::new(smoothed_vad)))),
            app_handle,
        })
    }

    /// Open the microphone and start the worker thread
    pub fn open(&mut self) -> Result<()> {
        if self.worker_handle.is_some() {
            return Ok(()); // Already open
        }

        let (sample_tx, sample_rx) = mpsc::channel::<AudioChunk>();
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (init_tx, init_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow::anyhow!("No input device found"))?;

        let thread_device = device.clone();
        let vad = self.vad.clone();
        let app_handle = self.app_handle.clone();

        let worker = std::thread::spawn(move || {
            let stop_flag = Arc::new(AtomicBool::new(false));
            let stop_flag_for_stream = stop_flag.clone();

            let init_result = (|| -> Result<(cpal::Stream, u32), String> {
                let config = AudioCapture::get_preferred_config(&thread_device)
                    .map_err(|e| format!("Failed to fetch preferred config: {e}"))?;

                let sample_rate = config.sample_rate().0;
                let channels = config.channels() as usize;

                log::info!(
                    "Using device: {:?}\nSample rate: {} (device native, no WASAPI clock change)\nChannels: {}\nFormat: {:?}",
                    thread_device.name(),
                    sample_rate,
                    channels,
                    config.sample_format()
                );

                let stream = match config.sample_format() {
                    cpal::SampleFormat::I16 => AudioCapture::build_stream::<i16>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    cpal::SampleFormat::I32 => AudioCapture::build_stream::<i32>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    cpal::SampleFormat::F32 => AudioCapture::build_stream::<f32>(
                        &thread_device,
                        &config,
                        sample_tx.clone(),
                        channels,
                        stop_flag_for_stream.clone(),
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    sample_format => {
                        return Err(format!("Unsupported sample format: {sample_format:?}"));
                    }
                };

                stream
                    .play()
                    .map_err(|e| format!("Failed to start microphone stream: {e}"))?;

                Ok((stream, sample_rate))
            })();

            match init_result {
                Ok((stream, sample_rate)) => {
                    let _ = init_tx.send(Ok(()));
                    run_consumer(sample_rate, vad, sample_rx, cmd_rx, app_handle, stop_flag);
                    drop(stream);
                }
                Err(error_message) => {
                    log::error!("{error_message}");
                    let _ = init_tx.send(Err(error_message));
                }
            }
        });

        match init_rx.recv() {
            Ok(Ok(())) => {
                self.device = Some(device);
                self.cmd_tx = Some(cmd_tx);
                self.worker_handle = Some(worker);
                Ok(())
            }
            Ok(Err(error_message)) => {
                let _ = worker.join();
                Err(anyhow::anyhow!("{}", error_message))
            }
            Err(recv_error) => {
                let _ = worker.join();
                Err(anyhow::anyhow!(
                    "Failed to initialize microphone worker: {recv_error}"
                ))
            }
        }
    }

    /// Start recording with scene_id
    pub fn start(&self, scene_id: &str) -> Result<()> {
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Start(scene_id.to_string()))?;
        }
        Ok(())
    }

    /// Stop recording and return the captured audio samples
    pub fn stop(&self) -> Result<Vec<f32>> {
        let (resp_tx, resp_rx) = mpsc::channel();
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Stop(resp_tx))?;
        }
        Ok(resp_rx.recv()?)
    }

    /// Cancel recording and discard all audio samples
    pub fn cancel(&self) -> Result<()> {
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Cancel)?;
        }
        Ok(())
    }

    /// Close the microphone stream
    pub fn close(&mut self) -> Result<()> {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(Cmd::Shutdown);
        }
        if let Some(h) = self.worker_handle.take() {
            let _ = h.join();
        }
        self.device = None;
        Ok(())
    }

    /// Set streaming transcription mode
    pub fn set_streaming_mode(&self, enabled: bool) -> Result<()> {
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::SetStreamingMode(enabled))?;
        }
        Ok(())
    }

    fn build_stream<T>(
        device: &cpal::Device,
        config: &cpal::SupportedStreamConfig,
        sample_tx: mpsc::Sender<AudioChunk>,
        channels: usize,
        stop_flag: Arc<AtomicBool>,
    ) -> Result<cpal::Stream, cpal::BuildStreamError>
    where
        T: Sample + SizedSample + Send + 'static,
        f32: cpal::FromSample<T>,
    {
        let mut output_buffer = Vec::new();
        let mut eos_sent = false;

        let stream_cb = move |data: &[T], _: &cpal::InputCallbackInfo| {
            if stop_flag.load(Ordering::Relaxed) {
                if !eos_sent {
                    let _ = sample_tx.send(AudioChunk::EndOfStream);
                    eos_sent = true;
                }
                return;
            }
            eos_sent = false;

            output_buffer.clear();

            // Convert to mono f32
            if channels == 1 {
                output_buffer.extend(data.iter().map(|&sample| sample.to_sample::<f32>()));
            } else {
                let frame_count = data.len() / channels;
                output_buffer.reserve(frame_count);

                for frame in data.chunks_exact(channels) {
                    let mono_sample = frame
                        .iter()
                        .map(|&sample| sample.to_sample::<f32>())
                        .sum::<f32>()
                        / channels as f32;
                    output_buffer.push(mono_sample);
                }
            }

            if sample_tx
                .send(AudioChunk::Samples(output_buffer.clone()))
                .is_err()
            {
                log::error!("Failed to send samples");
            }
        };

        device
            .build_input_stream(
                &config.clone().into(),
                stream_cb,
                |err| log::error!("Stream error: {}", err),
                None,
            )
            .map_err(Into::into)
    }

    fn get_preferred_config(device: &cpal::Device) -> Result<cpal::SupportedStreamConfig> {
        // Use device default — do NOT force 16kHz, which changes WASAPI shared-mode
        // clock and causes audio drift in other apps (video playback desync).
        // Resampling to 16kHz is handled by FrameResampler in the consumer loop.
        Ok(device.default_input_config()?)
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

/// Consumer loop that processes audio frames with VAD
fn run_consumer(
    in_sample_rate: u32,
    vad: Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
    sample_rx: mpsc::Receiver<AudioChunk>,
    cmd_rx: mpsc::Receiver<Cmd>,
    app_handle: AppHandle,
    stop_flag: Arc<AtomicBool>,
) {
    let mut frame_resampler = FrameResampler::new(
        in_sample_rate as usize,
        WHISPER_SAMPLE_RATE,
        Duration::from_millis(32), // v6.x models use 512 samples = 32ms at 16kHz
    );

    let mut processed_samples = Vec::<f32>::new();
    let mut recording = false;
    let mut last_vad_status = false;

    // Streaming transcription state (StreamRouter + worker thread)
    let mut stream_router: Option<Arc<StreamRouter>> = None;
    let mut stream_active: Arc<AtomicBool>;
    let mut stream_worker_handle: Option<std::thread::JoinHandle<()>> = None;
    let mut streaming_mode = false;
    let mut use_streaming_channel = false; // 是否使用流式通道（基于模型能力）
    let mut segment_buffer = Vec::<f32>::new(); // Current segment being collected
    let mut pending_buffer = Vec::<f32>::new(); // Buffer for segments < 3s
    let mut in_speech_segment = false; // Track if we're currently in a speech segment
    let mut soft_threshold_active = false; // Track if we've exceeded soft threshold (30s)
                                           // After soft threshold, we actively look for any pause (breath, swallowing) to segment

    // 全量录音 buffer（共享 Arc，供 Worker 提取分段）
    let full_recording: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut current_segment_start: usize = 0; // 当前分段起始索引
    let mut current_scene_id: String = String::new(); // 当前场景 ID

    /// Helper function to reset VAD sensitivity to Normal mode
    /// Returns true if sensitivity was reset, false if already normal
    fn reset_vad_sensitivity(
        soft_threshold_active: &mut bool,
        vad: &Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
        context: &str,
    ) -> bool {
        if *soft_threshold_active {
            *soft_threshold_active = false;
            if let Some(vad_arc) = vad {
                let mut det = vad_arc.lock().unwrap();
                det.adjust_sensitivity(SensitivityLevel::Normal);
            }
            log::info!(
                "[Streaming] {}: VAD sensitivity restored to Normal",
                context
            );
            true
        } else {
            false
        }
    }

    /// 发送音频释放事件（pending被合并后，橙点→绿点）
    fn emit_audio_released(app_handle: &AppHandle) {
        let _ = app_handle.emit_to(
            "float-panel",
            "audio-released",
            AudioBufferStatus {
                has_pending_audio: false,
                pending_duration_secs: 0.0,
            },
        );
    }

    /// 发送音频缓存事件（短片段进pending时，显示橙点）
    fn emit_audio_buffered(app_handle: &AppHandle, duration: f64) {
        let _ = app_handle.emit_to(
            "float-panel",
            "audio-buffered",
            AudioBufferStatus {
                has_pending_audio: true,
                pending_duration_secs: duration,
            },
        );
    }

    /// 合并 pending_buffer 到 segment_buffer（硬阈值/语音结束时调用）
    fn merge_pending_into_segment(
        pending: &mut Vec<f32>,
        segment: &mut Vec<f32>,
        app_handle: &AppHandle,
        context: &str,
    ) {
        if pending.is_empty() {
            return;
        }
        let pending_duration = get_duration_secs(pending);
        log::info!(
            "[Streaming] {}: merging pending_buffer ({:.2}s)",
            context,
            pending_duration
        );

        let mut merged = std::mem::take(pending);
        merged.extend_from_slice(segment);
        *segment = merged;

        emit_audio_released(app_handle);
    }

    fn handle_frame(
        samples: &[f32],
        recording: bool,
        vad: &Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
        out_buf: &mut Vec<f32>,
    ) -> Option<(bool, usize)> {
        // 返回 (is_voice, 新增数据长度)
        if !recording {
            return None;
        }

        let prev_len = out_buf.len();

        if let Some(vad_arc) = vad {
            let mut det = vad_arc.lock().unwrap();
            let result = det.push_frame(samples);
            match result {
                Ok(VadFrame::Speech(buf)) => {
                    out_buf.extend_from_slice(buf);
                    Some((true, out_buf.len() - prev_len))
                }
                Ok(VadFrame::Noise) => Some((false, 0)),
                Err(e) => {
                    log::error!("[VAD] push_frame error: {:?}", e);
                    // Fallback: treat as speech to avoid losing audio
                    out_buf.extend_from_slice(samples);
                    Some((true, out_buf.len() - prev_len))
                }
            }
        } else {
            out_buf.extend_from_slice(samples);
            Some((true, out_buf.len() - prev_len))
        }
    }

    /// Get duration in seconds from sample count
    fn get_duration_secs(samples: &[f32]) -> f64 {
        samples.len() as f64 / WHISPER_SAMPLE_RATE as f64
    }

    /// 启动转录处理线程（单线程线性处理队列）
    fn start_transcribe_worker(app: AppHandle) {
        if TRANSCRIBE_WORKER_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
            return; // 已经在运行
        }

        TRANSCRIBE_WORKER_RUNNING.store(true, std::sync::atomic::Ordering::SeqCst);
        TRANSCRIBE_STOP_SIGNAL.store(false, std::sync::atomic::Ordering::SeqCst);
        TRANSCRIBE_CANCELLED.store(false, std::sync::atomic::Ordering::SeqCst); // 重置取消标志

        std::thread::spawn(move || {
            log::info!("[TranscribeWorker] Worker thread started");

            // 在线程内部获取 AppServices
            let services = app
                .try_state::<crate::config::AppServices>()
                .expect("AppServices not available");

            loop {
                // 从队列取任务（先取任务，再检查信号）
                let task = {
                    let mut queue = TRANSCRIBE_QUEUE.lock().unwrap();
                    queue.pop_front()
                };

                if let Some(task) = task {
                    // 有任务就处理，不管有没有收到 STOP_SIGNAL
                    log::info!(
                        "[TranscribeWorker] Processing task: {:.2}s audio, scene: {}",
                        task.duration,
                        task.scene_id
                    );

                    // 从共享全量录音中提取当前分段的 samples
                    let segment_samples: Vec<f32> = {
                        let recording = task.full_recording.lock().unwrap();
                        recording[task.start_index..task.start_index + task.sample_count].to_vec()
                    };

                    // 执行转录
                    let result = crate::commands::transcribe::transcribe_samples_internal(
                        &services,
                        &segment_samples,
                        &task.scene_id,
                    );

                    match result {
                        Ok(text) => {
                            // 【进度条】转录完成，扣减待转录时长
                            {
                                let mut duration = PENDING_TRANSCRIBE_DURATION.lock().unwrap();
                                *duration -= task.duration;
                                log::info!(
                                    "[进度条] 转录完成扣减时长: {:.2}s, 当前待转录: {:.2}s",
                                    task.duration,
                                    *duration
                                );
                            }

                            // 检查是否已取消
                            if TRANSCRIBE_CANCELLED.load(std::sync::atomic::Ordering::SeqCst) {
                                log::info!(
                                    "[TranscribeWorker] Cancelled, discarding result: {} chars",
                                    text.len()
                                );
                                continue;
                            }

                            if !text.is_empty() {
                                log::info!("[TranscribeWorker] Transcribed: {} chars", text.len());

                                // 先更新 preview_text（后端状态），再获取完整文本发送事件
                                let full_text =
                                    if let Some(state) = app.try_state::<crate::AppState>() {
                                        if let Ok(mut preview) = state.preview_text.lock() {
                                            if !preview.is_empty() {
                                                preview.push(' ');
                                            }
                                            preview.push_str(&text);
                                            preview.clone()
                                        } else {
                                            text.clone()
                                        }
                                    } else {
                                        text.clone()
                                    };

                                // 发送预览文字更新事件到 float-panel 窗口（用于 UI 显示）
                                let _ = app.emit_to(
                                    "float-panel",
                                    "preview-text-update",
                                    PreviewTextPayload {
                                        full_text,
                                        segment_text: text.clone(),
                                    },
                                );

                                // 同时发送 transcription-result 事件（用于其他监听者）
                                let _ = app.emit(
                                    "transcription-result",
                                    TranscriptionText {
                                        text,
                                        duration: task.duration,
                                    },
                                );
                            }
                        }
                        Err(e) => {
                            // 【进度条】转录失败也要扣减时长
                            {
                                let mut duration = PENDING_TRANSCRIBE_DURATION.lock().unwrap();
                                *duration -= task.duration;
                                log::info!(
                                    "[进度条] 转录失败扣减时长: {:.2}s, 当前待转录: {:.2}s",
                                    task.duration,
                                    *duration
                                );
                            }
                            log::error!("[TranscribeWorker] Transcription failed: {}", e);
                            let _ =
                                app.emit("transcription-error", TranscriptionError { error: e });
                        }
                    }
                } else {
                    // 队列空，检查是否收到停止信号
                    if TRANSCRIBE_STOP_SIGNAL.load(std::sync::atomic::Ordering::SeqCst) {
                        // 队列已空，且收到停止信号，退出循环
                        log::info!(
                            "[TranscribeWorker] Queue empty and stop signal received, exiting"
                        );
                        break;
                    }
                    // 队列空但没收到停止信号，短暂休眠等待新任务
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }

            TRANSCRIBE_WORKER_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
            log::info!("[TranscribeWorker] Worker thread stopped");
        });
    }

    /// 将分段音频入队列等待转录（使用 Arc 共享全量录音，只记录索引范围）
    fn enqueue_segment(
        app_handle: &AppHandle,
        full_recording: Arc<Mutex<Vec<f32>>>,
        start_index: usize,
        sample_count: usize,
        scene_id: &str,
    ) {
        if sample_count == 0 {
            log::info!("[Streaming] enqueue_segment called with empty samples, skipping");
            return;
        }

        let duration = sample_count as f64 / WHISPER_SAMPLE_RATE as f64;
        log::info!(
            "[Streaming] Enqueueing segment: {:.2}s, {} samples, scene: {}",
            duration,
            sample_count,
            scene_id
        );

        // 【进度条】入队时累加待转录时长
        {
            let mut pending = PENDING_TRANSCRIBE_DURATION.lock().unwrap();
            *pending += duration;
            log::info!(
                "[进度条] 入队累加时长: {:.2}s, 当前待转录: {:.2}s",
                duration,
                *pending
            );
        }

        // 创建任务（只记录索引范围，不复制 samples）
        let task = TranscribeTask {
            full_recording: full_recording.clone(),
            start_index,
            sample_count,
            scene_id: scene_id.to_string(),
            duration,
        };

        // 入队列（检查长度上限）
        {
            let mut queue = TRANSCRIBE_QUEUE.lock().unwrap();
            if queue.len() >= MAX_TRANSCRIBE_QUEUE_LEN {
                log::warn!(
                    "[Streaming] Queue overflow ({}), dropping oldest task",
                    queue.len()
                );
                queue.pop_front();
            }
            queue.push_back(task);
            log::info!("[Streaming] Task enqueued, queue length: {}", queue.len());
        }

        // 确保 worker 线程运行
        start_transcribe_worker(app_handle.clone());
    }

    loop {
        let chunk = match sample_rx.recv_timeout(Duration::from_millis(MAX_RECV_TIMEOUT_MS)) {
            Ok(c) => c,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                log::error!(
                    "Audio stream timeout after {}ms - stream may be dead",
                    MAX_RECV_TIMEOUT_MS
                );
                break;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                log::info!("Audio stream disconnected");
                break;
            }
        };

        let raw = match chunk {
            AudioChunk::Samples(s) => s,
            AudioChunk::EndOfStream => continue,
        };

        // Process audio frames through VAD
        frame_resampler.push(&raw, &mut |frame: &[f32]| {
            log::debug!("[VAD] Frame generated: {} samples", frame.len());
            if let Some((is_voice, added_len)) = handle_frame(frame, recording, &vad, &mut processed_samples) {
                // 【分流逻辑】根据 use_streaming_channel 决定处理方式
                // use_streaming_channel = true: 流式模式，跳过分段逻辑，直接送入流式模型
                // streaming_mode = true: 分段模式，使用 VAD 分段后批量转录
                if use_streaming_channel && recording {
                    // 流式模式：发送所有音频帧到模型，不做 VAD 过滤
                    // VAD 只用于驱动 UI 动效（见后面的 vad-status 发送逻辑）
                    // 模型需要静音帧来判断语音边界和进行正确的流式识别
                    // 直接使用回调中的 frame 参数，而不是从 processed_samples 提取
                    log::debug!("[Streaming] Feeding frame: {} samples", frame.len());
                    // 累积到全量录音（用于出错时回退或最终输出）
                    full_recording.lock().unwrap().extend_from_slice(frame);
                    // 输入到 StreamRouter（所有帧都发送，包括静音帧）
                    if let Some(ref router) = stream_router {
                        router.feed(frame);
                    }
                } else if streaming_mode && recording {
                    // 分段模式：现有逻辑（完全保持不变）
                    if is_voice && added_len > 0 {
                        // 从 processed_samples 中提取新增的数据（包含 prefill 缓冲）
                        // 这确保了 onset 触发时的 prefill 缓冲被包含在 segment 中
                        let start_idx = processed_samples.len() - added_len;
                        let new_samples = &processed_samples[start_idx..];
                        segment_buffer.extend_from_slice(new_samples);

                        // 累积音频到全量录音 buffer（供 Worker 提取分段）
                        full_recording.lock().unwrap().extend_from_slice(new_samples);

                        in_speech_segment = true;

                        let segment_duration = get_duration_secs(&segment_buffer);
                        log::debug!("[Streaming] Voice detected, added {} samples, segment_buffer now {} samples ({:.2}s)",
                            added_len, segment_buffer.len(), segment_duration);

                        // 【软阈值】超过30秒后，调整VAD更敏感（更容易触发分段）
                        if segment_duration >= SOFT_THRESHOLD_SECS && !soft_threshold_active {
                            soft_threshold_active = true;
                            log::info!("[Streaming] Soft threshold activated ({:.2}s >= {:.2}s), adjusting VAD sensitivity",
                                segment_duration, SOFT_THRESHOLD_SECS);

                            // 动态调整VAD敏感度
                            if let Some(vad_arc) = &vad {
                                let mut det = vad_arc.lock().unwrap();
                                det.adjust_sensitivity(SensitivityLevel::High);
                            }
                        }

                        // 【硬阈值】超过60秒后，强制分段（不停止录音）
                        // 这防止用户一直说话不停顿导致音频过长影响ASR识别
                        if segment_duration >= HARD_THRESHOLD_SECS {
                            log::info!("[Streaming] Hard threshold triggered ({:.2}s >= {:.2}s), forcing segment emit",
                                segment_duration, HARD_THRESHOLD_SECS);

                            // 先合并 pending_buffer（如果有），避免丢失之前累积的短片段
                            merge_pending_into_segment(&mut pending_buffer, &mut segment_buffer, &app_handle, "Hard threshold");

                            // 强制发送 segment（不等待 silence）
                            let current_len = full_recording.lock().unwrap().len();
                            let segment_sample_count = current_len - current_segment_start;
                            enqueue_segment(&app_handle, full_recording.clone(), current_segment_start, segment_sample_count, &current_scene_id);
                            current_segment_start = current_len;
                            segment_buffer.clear();
                            // pending_buffer 已被 mem::take 清空，无需额外 clear

                            // 重置软阈值状态和VAD敏感度
                            reset_vad_sensitivity(&mut soft_threshold_active, &vad, "Hard threshold");

                            // 注意：不设置 in_speech_segment = false，因为用户还在说话
                            // VAD 状态保持 true，继续累积新的语音帧
                        }
                    } else if in_speech_segment {
                        // Transition from speech to silence - segment boundary detected
                        in_speech_segment = false;

                        log::info!("[Streaming] Speech ended, segment_buffer has {} samples ({:.2}s)",
                            segment_buffer.len(), get_duration_secs(&segment_buffer));

                        // Merge with pending buffer if any
                        merge_pending_into_segment(&mut pending_buffer, &mut segment_buffer, &app_handle, "Speech ended");

                        let duration = get_duration_secs(&segment_buffer);
                        log::info!("[Streaming] Final segment duration: {:.2}s (min required: {:.2}s)",
                            duration, MIN_SEGMENT_DURATION_SECS);

                        if duration >= MIN_SEGMENT_DURATION_SECS {
                            // Segment is long enough, emit it
                            log::info!("[Streaming] Segment ready, calling enqueue_segment");
                            let current_len = full_recording.lock().unwrap().len();
                            let segment_sample_count = current_len - current_segment_start;
                            enqueue_segment(&app_handle, full_recording.clone(), current_segment_start, segment_sample_count, &current_scene_id);
                            current_segment_start = current_len;
                            segment_buffer.clear();

                            // 【重要】分段发送后，重置软阈值状态和VAD敏感度
                            // 为下一个segment做准备
                            reset_vad_sensitivity(&mut soft_threshold_active, &vad, "Segment sent");
                        } else {
                            // Segment too short, move to pending buffer
                            let pending_duration = duration; // 保存时长用于事件
                            log::info!("[Streaming] Segment too short ({:.2}s < {:.2}s), moving to pending_buffer",
                                duration, MIN_SEGMENT_DURATION_SECS);
                            pending_buffer = std::mem::take(&mut segment_buffer);
                            segment_buffer.clear();

                            // 发送音频缓存状态事件，通知前端显示橙点
                            emit_audio_buffered(&app_handle, pending_duration);

                            // 【修复 Bug 1】短片段进 pending_buffer 时恢复 VAD 敏感度
                            // 避免下一个片段仍处于高敏感度模式
                            reset_vad_sensitivity(&mut soft_threshold_active, &vad, "Short segment moved to pending");
                        }
                    }
                }  // end of else if streaming_mode && recording

                // 【分离】VAD 状态发送 - 始终运行（用于波形动画和状态指示器）
                // 这部分不受 streaming_mode 影响，只要 recording 就发送
                if recording {
                    // 处理 voice=false（用户停顿）
                    // 检测从 speech 到 silence 的转变
                    if !is_voice && last_vad_status {
                        last_vad_status = false;
                        log::info!("[VAD] Speech ended, sending vad-status=false to float-panel");
                        let _ = app_handle.emit_to("float-panel", "vad-status", VadStatus { is_voice: false });
                    }

                    // 处理 voice=true（用户说话）
                    if is_voice && !last_vad_status {
                        last_vad_status = true;
                        log::info!("[VAD] Voice detected, sending vad-status=true to float-panel");
                        let _ = app_handle.emit_to("float-panel", "vad-status", VadStatus { is_voice: true });
                    }
                }
            }
        });

        // Check for commands
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                Cmd::Start(scene_id) => {
                    stop_flag.store(false, Ordering::Relaxed);
                    processed_samples.clear();
                    recording = true;
                    last_vad_status = false;
                    in_speech_segment = false;
                    segment_buffer.clear();
                    pending_buffer.clear();
                    current_segment_start = 0; // 重置分段起始索引
                    current_scene_id = scene_id.clone(); // 保存 scene_id
                    full_recording.lock().unwrap().clear(); // 清空全量录音
                                                            // 【进度条】新录音开始，重置待转录时长
                    *PENDING_TRANSCRIBE_DURATION.lock().unwrap() = 0.0;
                    log::info!("[进度条] Start: 重置待转录时长为 0");
                    if let Some(v) = &vad {
                        v.lock().unwrap().reset();
                    }

                    // === 模型能力检测 ===
                    // 检测当前场景绑定的模型是否支持流式转录
                    use_streaming_channel = false; // 默认使用分段模式

                    if let Some(services) = app_handle.try_state::<crate::config::AppServices>() {
                        if let Some(model_manager_guard) = services.model_manager.lock().ok() {
                            if let Some(model_manager) = model_manager_guard.as_ref() {
                                // 获取场景对应的模型路径（仅 GGUF 模型）
                                if let Some(model_path) =
                                    model_manager.get_model_path_for_scene(&scene_id)
                                {
                                    // 检测模型能力
                                    let caps = probe_gguf_capabilities(&model_path);
                                    use_streaming_channel =
                                        caps.supports_streaming.unwrap_or(false);

                                    log::info!(
                                        "[Capture] Model capabilities detected: arch={}, streaming={}, path={:?}",
                                        caps.display_name(),
                                        use_streaming_channel,
                                        model_path
                                    );

                                    if use_streaming_channel {
                                        log::info!("[Capture] Model supports streaming, will use streaming channel");

                                        // 创建 StreamRouter
                                        let router = Arc::new(StreamRouter::new());
                                        let rx = router.open();

                                        // 获取 model_manager 的 Arc<Mutex> 引用
                                        let model_manager_arc = {
                                            if let Some(services) =
                                                app_handle.try_state::<crate::config::AppServices>()
                                            {
                                                services.model_manager.clone()
                                            } else {
                                                log::error!("[Capture] AppServices not available for streaming");
                                                use_streaming_channel = false;
                                                continue;
                                            }
                                        };

                                        // 启动 worker 线程
                                        stream_active = Arc::new(AtomicBool::new(false));
                                        let worker = std::thread::spawn({
                                            let model_manager = model_manager_arc;
                                            let app_handle = app_handle.clone();
                                            let scene_id = scene_id.clone();
                                            let stream_active = stream_active.clone();
                                            move || {
                                                run_stream_worker(
                                                    model_manager,
                                                    rx,
                                                    app_handle,
                                                    scene_id,
                                                    stream_active,
                                                );
                                            }
                                        });

                                        stream_router = Some(router.clone());
                                        stream_worker_handle = Some(worker);
                                        log::info!("[Capture] StreamRouter created and worker thread started for scene: {}",
                                            scene_id);
                                    } else {
                                        log::info!("[Capture] Model does not support streaming, using segmented channel");
                                        stream_router = None;
                                    }
                                } else {
                                    log::info!("[Capture] No GGUF model path found for scene {}, using segmented channel", scene_id);
                                }
                            }
                        }
                    } else {
                        log::warn!(
                            "[Capture] AppServices not available, cannot detect model capabilities"
                        );
                    }

                    log::info!("[Capture] Recording started (streaming_mode: {}, use_streaming_channel: {}, scene: {})",
                        streaming_mode, use_streaming_channel, current_scene_id);
                }
                Cmd::Stop(reply_tx) => {
                    recording = false;
                    stop_flag.store(true, Ordering::Relaxed);
                    log::info!(
                        "[Capture] Stop command received, streaming_mode: {}, use_streaming_channel: {}",
                        streaming_mode, use_streaming_channel
                    );
                    log::info!(
                        "[Capture] processed_samples: {} samples ({:.2}s), memory: ~{:.2} MB",
                        processed_samples.len(),
                        get_duration_secs(&processed_samples),
                        processed_samples.len() * 4 / 1024 / 1024 // f32 = 4 bytes
                    );

                    // 流式转录模式停止处理
                    if use_streaming_channel {
                        log::info!("[Capture] Stopping streaming transcription session");

                        // 发送 Finalize 命令并等待最终结果
                        if let Some(ref router) = stream_router {
                            if let Some(tx) = router.take() {
                                let (finalize_reply, finalize_rx) = mpsc::channel();
                                let _ = tx.send(StreamCmd::Finalize(finalize_reply));

                                // 等待最终结果
                                match finalize_rx.recv_timeout(Duration::from_secs(30)) {
                                    Ok(Some(text)) => {
                                        // 注意：run_stream_worker 已经发送了 streaming-text-update 事件
                                        // 这里只需要更新后端的 preview_text 状态
                                        log::info!(
                                            "[Capture] Stream finalized with text: {} chars",
                                            text.len()
                                        );

                                        // 更新后端的 preview_text 状态（用于 get_preview_text 命令）
                                        if let Some(state) =
                                            app_handle.try_state::<crate::AppState>()
                                        {
                                            if let Ok(mut preview) = state.preview_text.lock() {
                                                *preview = text.clone();
                                                log::info!(
                                                    "[Capture] Updated preview_text to {} chars",
                                                    text.len()
                                                );
                                            }
                                        }
                                    }
                                    Ok(None) => {
                                        // 不支持流式，fallback 到批量转录
                                        log::warn!("[Capture] Stream returned None, falling back to batch transcription");
                                        // TODO: 实现批量转录 fallback
                                    }
                                    Err(e) => {
                                        log::error!("[Capture] Stream finalize timeout: {}", e);
                                    }
                                }
                            }
                        }

                        // 等待 worker 线程结束
                        if let Some(handle) = stream_worker_handle.take() {
                            let _ = handle.join();
                            log::info!("[Capture] Stream worker thread joined");
                        }

                        // 清理状态
                        stream_router = None;

                        // 发送停止事件（流式模式没有待处理时长）
                        let _ = app_handle.emit(
                            "streaming-recording-stopped",
                            StreamingRecordingStopped {
                                pending_duration_secs: 0.0,
                            },
                        );

                        log::info!("[Capture] Streaming transcription stopped");

                        // 重置 VAD 敏感度
                        reset_vad_sensitivity(&mut soft_threshold_active, &vad, "Stop (streaming)");
                    } else if streaming_mode {
                        log::info!("[Streaming] segment_buffer: {} samples ({:.2}s), pending_buffer: {} samples ({:.2}s)",
                            segment_buffer.len(), get_duration_secs(&segment_buffer),
                            pending_buffer.len(), get_duration_secs(&pending_buffer));

                        // Merge pending buffer with current segment
                        if !pending_buffer.is_empty() {
                            log::info!("[Streaming] Merging pending_buffer into segment_buffer before stop");
                            pending_buffer.extend_from_slice(&segment_buffer);
                            segment_buffer = pending_buffer.clone();
                            pending_buffer.clear();

                            // 【新增】发送音频释放事件，通知前端缓存已清空
                            log::info!("[Streaming] Sending audio-released event (stop command)");
                            let _ = app_handle.emit_to(
                                "float-panel",
                                "audio-released",
                                AudioBufferStatus {
                                    has_pending_audio: false,
                                    pending_duration_secs: 0.0,
                                },
                            );
                        }

                        // Emit any remaining segment
                        if !segment_buffer.is_empty() {
                            log::info!(
                                "[Streaming] Emitting final segment on stop: {:.2}s",
                                get_duration_secs(&segment_buffer)
                            );
                            let current_len = full_recording.lock().unwrap().len();
                            let segment_sample_count = current_len - current_segment_start;
                            if segment_sample_count > 0 {
                                enqueue_segment(
                                    &app_handle,
                                    full_recording.clone(),
                                    current_segment_start,
                                    segment_sample_count,
                                    &current_scene_id,
                                );
                            }
                            segment_buffer.clear();
                        } else {
                            log::info!("[Streaming] No remaining segment to emit on stop");
                        }

                        // 发送停止信号给转录 worker
                        TRANSCRIBE_STOP_SIGNAL.store(true, std::sync::atomic::Ordering::SeqCst);

                        // 【进度条】直接读取待转录总时长（入队时累加，Worker完成时扣减）
                        let pending_duration = *PENDING_TRANSCRIBE_DURATION.lock().unwrap();
                        log::info!(
                            "[Capture] Pending transcription duration: {:.2}s",
                            pending_duration
                        );

                        // 等待 Worker 线程退出（确保所有已入队任务都已完成转录）
                        let max_wait = std::time::Duration::from_secs(15);
                        let start = std::time::Instant::now();
                        while TRANSCRIBE_WORKER_RUNNING.load(std::sync::atomic::Ordering::SeqCst)
                            && start.elapsed() < max_wait
                        {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                        }
                        log::info!(
                            "[Capture] Worker stopped, waited {}ms",
                            start.elapsed().as_millis()
                        );

                        // Notify frontend that recording stopped with pending duration
                        let _ = app_handle.emit(
                            "streaming-recording-stopped",
                            StreamingRecordingStopped {
                                pending_duration_secs: pending_duration,
                            },
                        );

                        // 重置停止信号（为下次录音做准备）
                        TRANSCRIBE_STOP_SIGNAL.store(false, std::sync::atomic::Ordering::SeqCst);

                        // 【修复 Bug 2】Stop 命令时恢复 VAD 敏感度
                        // 确保下次录音从正常敏感度开始
                        reset_vad_sensitivity(&mut soft_threshold_active, &vad, "Stop");
                    }

                    // Drain remaining audio - minimal timeout for fast response
                    loop {
                        match sample_rx.recv_timeout(Duration::from_millis(50)) {
                            Ok(AudioChunk::Samples(remaining)) => {
                                frame_resampler.push(&remaining, &mut |frame: &[f32]| {
                                    let _ = handle_frame(frame, true, &vad, &mut processed_samples);
                                });
                            }
                            Ok(AudioChunk::EndOfStream) => break,
                            Err(_) => {
                                log::debug!("Timeout waiting for EndOfStream, proceeding with captured audio");
                                break;
                            }
                        }
                    }

                    frame_resampler.finish(&mut |frame: &[f32]| {
                        let _ = handle_frame(frame, true, &vad, &mut processed_samples);
                    });

                    let _ = reply_tx.send(std::mem::take(&mut processed_samples));
                    stop_flag.store(false, Ordering::Relaxed);

                    log::info!("Recording stopped");
                }
                Cmd::Cancel => {
                    recording = false;
                    stop_flag.store(true, Ordering::Relaxed);
                    log::info!("[Capture] Cancel command received, discarding all audio data");

                    // 1. 先设置取消标志（Worker 完成转录后会检查此标志，丢弃结果）
                    TRANSCRIBE_CANCELLED.store(true, std::sync::atomic::Ordering::SeqCst);

                    // 2. 发送停止信号
                    TRANSCRIBE_STOP_SIGNAL.store(true, std::sync::atomic::Ordering::SeqCst);

                    // 3. 清空转录队列（停止接受新任务）
                    TRANSCRIBE_QUEUE.lock().unwrap().clear();

                    // 【进度条】重置待转录时长
                    *PENDING_TRANSCRIBE_DURATION.lock().unwrap() = 0.0;
                    log::info!("[进度条] Cancel: 重置待转录时长为 0");

                    // 4. 等待 Worker 线程退出
                    let max_wait = std::time::Duration::from_secs(5);
                    let start = std::time::Instant::now();
                    while TRANSCRIBE_WORKER_RUNNING.load(std::sync::atomic::Ordering::SeqCst)
                        && start.elapsed() < max_wait
                    {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    log::info!(
                        "[Capture] Cancel: Worker stopped, waited {}ms",
                        start.elapsed().as_millis()
                    );

                    // 5. 清空 preview_text（双重保险）
                    if let Some(state) = app_handle.try_state::<crate::AppState>() {
                        if let Ok(mut preview) = state.preview_text.lock() {
                            preview.clear();
                        }
                    }

                    // 6. 重置信号（为下次录音做准备）
                    TRANSCRIBE_STOP_SIGNAL.store(false, std::sync::atomic::Ordering::SeqCst);
                    TRANSCRIBE_CANCELLED.store(false, std::sync::atomic::Ordering::SeqCst);

                    // Discard all buffers without emitting any segments
                    processed_samples.clear();
                    segment_buffer.clear();
                    pending_buffer.clear();
                    in_speech_segment = false;
                    current_segment_start = 0;

                    // Reset VAD status
                    last_vad_status = false;
                    let _ = app_handle.emit_to(
                        "float-panel",
                        "vad-status",
                        VadStatus { is_voice: false },
                    );

                    // Notify frontend
                    let _ = app_handle.emit(
                        "streaming-recording-stopped",
                        StreamingRecordingStopped {
                            pending_duration_secs: 0.0,
                        },
                    );

                    // Reset VAD sensitivity
                    reset_vad_sensitivity(&mut soft_threshold_active, &vad, "Cancel");

                    // 清理流式转录路由器
                    if use_streaming_channel {
                        // 发送 Cancel 命令到 worker（如果有）
                        if let Some(ref router) = stream_router {
                            if let Some(tx) = router.take() {
                                let _ = tx.send(StreamCmd::Cancel);
                                log::info!(
                                    "[Capture] Cancel: sent Cancel command to stream router"
                                );
                            }
                        }

                        // 等待 worker 线程结束
                        if let Some(handle) = stream_worker_handle.take() {
                            let _ = handle.join();
                            log::info!("[Capture] Cancel: stream worker thread joined");
                        }

                        stream_router = None;
                        log::info!("[Capture] Cancel: stream router cleared");
                    }

                    stop_flag.store(false, Ordering::Relaxed);
                    log::info!("Recording cancelled, all data discarded");
                }
                Cmd::SetStreamingMode(enabled) => {
                    streaming_mode = enabled;
                    log::info!("Streaming mode set to: {}", enabled);
                }
                Cmd::Shutdown => {
                    stop_flag.store(true, Ordering::Relaxed);
                    return;
                }
            }
        }
    }
}

/// VAD status event payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VadStatus {
    is_voice: bool,
}

/// Audio buffer status event payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioBufferStatus {
    has_pending_audio: bool,
    pending_duration_secs: f64,
}

/// Transcription text result event payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionText {
    text: String,
    duration: f64,
}

/// Preview text update event payload (for FloatPanel UI)
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewTextPayload {
    full_text: String,
    segment_text: String,
}

/// Transcription error event payload
#[derive(Clone, serde::Serialize)]
struct TranscriptionError {
    error: String,
}

/// Streaming recording stopped event payload
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamingRecordingStopped {
    /// Duration of audio still pending transcription (in seconds)
    pending_duration_secs: f64,
}

/// Frame resampler for converting input sample rate to 16kHz
struct FrameResampler {
    input_rate: usize,
    output_rate: usize,
    frame_duration: Duration,
    buffer: Vec<f32>,
}

impl FrameResampler {
    fn new(input_rate: usize, output_rate: usize, frame_duration: Duration) -> Self {
        Self {
            input_rate,
            output_rate,
            frame_duration,
            buffer: Vec::new(),
        }
    }

    fn push<F: FnMut(&[f32])>(&mut self, samples: &[f32], callback: &mut F) {
        self.buffer.extend(samples);

        // Calculate frame size in samples
        let frame_samples = (self.input_rate as f64 * self.frame_duration.as_secs_f64()) as usize;

        while self.buffer.len() >= frame_samples {
            let frame: Vec<f32> = self.buffer.drain(..frame_samples).collect();

            // Resample if needed — use weighted average (box filter) instead of
            // nearest-neighbor for better quality during downsampling
            if self.input_rate != self.output_rate {
                let ratio = self.input_rate as f64 / self.output_rate as f64;
                let output_len = (frame.len() as f64 / ratio) as usize;
                let mut resampled = Vec::with_capacity(output_len);
                for i in 0..output_len {
                    let src_start = (i as f64 * ratio) as usize;
                    let src_end = ((i as f64 + 1.0) * ratio) as usize;
                    let end = src_end.min(frame.len());
                    if src_start < end {
                        let sum: f32 = frame[src_start..end].iter().sum();
                        resampled.push(sum / (end - src_start) as f32);
                    } else {
                        resampled.push(frame.get(src_start).copied().unwrap_or(0.0));
                    }
                }
                callback(&resampled);
            } else {
                callback(&frame);
            }
        }
    }

    fn finish<F: FnMut(&[f32])>(&mut self, callback: &mut F) {
        if !self.buffer.is_empty() {
            // Pad to frame size
            let frame_samples =
                (self.input_rate as f64 * self.frame_duration.as_secs_f64()) as usize;
            while self.buffer.len() < frame_samples {
                self.buffer.push(0.0);
            }
            let frame: Vec<f32> = self.buffer.drain(..).collect();

            // Resample if needed — weighted average (same as push)
            if self.input_rate != self.output_rate {
                let ratio = self.input_rate as f64 / self.output_rate as f64;
                let output_len = (frame.len() as f64 / ratio) as usize;
                let mut resampled = Vec::with_capacity(output_len);
                for i in 0..output_len {
                    let src_start = (i as f64 * ratio) as usize;
                    let src_end = ((i as f64 + 1.0) * ratio) as usize;
                    let end = src_end.min(frame.len());
                    if src_start < end {
                        let sum: f32 = frame[src_start..end].iter().sum();
                        resampled.push(sum / (end - src_start) as f32);
                    } else {
                        resampled.push(frame.get(src_start).copied().unwrap_or(0.0));
                    }
                }
                callback(&resampled);
            } else {
                callback(&frame);
            }
        }
    }
}
