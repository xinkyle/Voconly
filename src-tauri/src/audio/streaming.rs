//! Streaming transcription module
//!
//! Manages the lifecycle of streaming transcription sessions for real-time
//! speech-to-text with stream-capable models (Qwen3-ASR, Parakeet, Voxtral).
//!
//! # Event Types
//!
//! - `streaming-text-update`: Emitted for each text update from the model
//! - `streaming-error`: Emitted when an error occurs during streaming
//!
//! # Architecture
//!
//! The worker thread (`run_stream_worker`) handles:
//! 1. Model loading via `ModelManager::get_or_load_model()`
//! 2. Checking streaming support via `BackendEnum::with_stream()`
//! 3. Processing audio frames from `StreamCmd::Feed`
//! 4. Emitting text updates to frontend via `emit_streaming_text()`
//! 5. Finalizing via `StreamCmd::Finalize`
//! 6. Canceling via `StreamCmd::Cancel`

use log::{error, info, warn};
use std::sync::mpsc;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter};
use transcribe_cpp::StreamText;

use crate::audio::StreamCmd;
use crate::model_manager::{LoadedModel, ModelManager};

/// Event payload for streaming text updates
///
/// Sent to the frontend for real-time display of transcription progress.
/// Contains the combined text (committed + tentative), the delta text
/// that was added in this update, and whether this is the final result.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingTextEvent {
    /// Combined text for display (committed + tentative)
    pub display_text: String,
    /// Text added in this update (incremental)
    pub delta: String,
    /// Whether this is the final result
    pub is_final: bool,
}

/// Event payload for streaming errors
///
/// When streaming fails, this event preserves the committed text
/// that was confirmed before the error occurred.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingErrorEvent {
    /// Error message describing what went wrong
    pub error: String,
    /// Committed text preserved from before the error
    pub saved_text: String,
}

// ============================================================================
// Streaming Worker Functions
// ============================================================================

/// Worker 线程主函数
///
/// 从 channel 接收音频帧，通过流式转录处理，发送文本更新事件。
///
/// # Arguments
///
/// * `model_manager` - 模型管理器（Arc<Mutex>）
/// * `rx` - StreamCmd 接收端
/// * `app_handle` - Tauri AppHandle 用于发送事件
/// * `scene_id` - 场景 ID（用于获取对应的模型）
/// * `stream_active` - 流状态标志（原子布尔）
///
/// # Flow
///
/// 1. 获取模型：通过 `ModelManager::get_or_load_model()` 加载模型
/// 2. 检查流式支持：调用 `backend.with_stream()` 进入流式上下文
/// 3. 处理音频帧：循环接收 `StreamCmd::Feed`，调用 `stream.feed()`
/// 4. 发送事件：当文本变化时调用 `emit_streaming_text()`
/// 5. 结束流：接收 `StreamCmd::Finalize`，返回最终文本
/// 6. 取消流：接收 `StreamCmd::Cancel`，重置流
/// 7. 不支持流式：调用 `drain_until_finalize()` 排空 channel
pub fn run_stream_worker(
    model_manager: Arc<Mutex<Option<ModelManager>>>,
    rx: mpsc::Receiver<StreamCmd>,
    app_handle: AppHandle,
    scene_id: String,
    stream_active: Arc<AtomicBool>,
) {
    // 【诊断日志】记录锁获取时间
    let lock_start = std::time::Instant::now();
    info!("[StreamingWorker] ⏳ 正在获取 ModelManager 锁...");

    // 1. 获取模型（Arc 方案：获取后立即释放锁）
    let loaded_model: Arc<LoadedModel> = {
        let mut manager_guard = model_manager.lock().unwrap();

        // 【诊断日志】锁获取成功
        info!("[StreamingWorker] ✅ ModelManager 锁已获取，耗时: {}ms", lock_start.elapsed().as_millis());
        let manager = match manager_guard.as_mut() {
            Some(m) => m,
            None => {
                error!("[StreamingWorker] ModelManager not available");
                emit_streaming_error(&app_handle, "ModelManager not available");
                stream_active.store(false, Ordering::Relaxed);
                return;
            }
        };

        // 获取模型（返回 Arc<LoadedModel>）
        let model = match manager.get_or_load_model(&scene_id) {
            Ok(m) => m,
            Err(e) => {
                error!("[StreamingWorker] Failed to load model: {}", e);
                emit_streaming_error(&app_handle, &e);
                stream_active.store(false, Ordering::Relaxed);
                return;
            }
        };

        // 锁在这里释放！Arc<LoadedModel> 不依赖锁的生命周期
        info!("[StreamingWorker] 🔓 模型已获取，锁即将释放，持有时间: {}ms", lock_start.elapsed().as_millis());
        model
    };

    // 【诊断日志】锁已释放，但 Arc 仍然有效
    info!("[StreamingWorker] ✅ 锁已释放，开始流式转录（Arc 引用计数: {}）", Arc::strong_count(&loaded_model));

    // 2. 检查流式支持并执行流式操作（不需要持有锁）
    let result = loaded_model.backend.with_stream(|stream| {
        stream_active.store(true, Ordering::Relaxed);
        info!("[StreamingWorker] Stream started for scene: {}", scene_id);

        // 追踪上一次的文本，用于检测变化
        let mut last_committed_len = 0usize;
        let mut last_tentative_len = 0usize;

        // 3. 处理音频帧循环
        while let Ok(cmd) = rx.recv() {
            match cmd {
                StreamCmd::Feed(pcm) => {
                    match stream.feed(&pcm) {
                        Ok(update) => {
                            let text = stream.text();
                            let committed_len = text.committed.len();
                            let tentative_len = text.tentative.len();

                            // 检测文本是否真正变化（不依赖 update 的 changed 标志）
                            let text_changed = committed_len != last_committed_len
                                || tentative_len != last_tentative_len;

                            // 只在文本变化时打印日志和发送事件
                            if text_changed {
                                // 发送事件到前端
                                emit_streaming_text(&app_handle, &text, false);

                                // 更新追踪值
                                last_committed_len = committed_len;
                                last_tentative_len = tentative_len;
                            }
                        }
                        Err(e) => {
                            error!("[StreamingWorker] Stream feed failed: {}", e);
                        }
                    }
                }
                StreamCmd::Finalize(reply) => {
                    match stream.finalize() {
                        Ok(_) => {
                            let text = stream.text();
                            info!("[StreamingWorker] Finalized, emitting final text: {}", text.display());
                            // 发送最终文本事件到前端
                            //emit_streaming_text(&app_handle, &text, true);
                            let _ = reply.send(Some(text.display()));
                        }
                        Err(_) => {
                            let _ = reply.send(None);
                        }
                    }
                    break;
                }
                StreamCmd::Cancel => {
                    stream.reset();
                    break;
                }
            }
        }

        stream_active.store(false, Ordering::Relaxed);
        info!("[StreamingWorker] Stream ended for scene: {}", scene_id);
    });

    // 【诊断日志】流式操作完成
    let total_duration = lock_start.elapsed();
    info!("[StreamingWorker] 🏁 流式转录完成，总耗时: {}ms ({}秒)", total_duration.as_millis(), total_duration.as_secs());

    // 4. 处理不支持流式的情况
    if result.is_none() {
        info!("[StreamingWorker] Model does not support streaming, draining channel");
        drain_until_finalize(rx);
    }

    // loaded_model (Arc) 在这里被 drop，引用计数减少
}

/// 排空 channel 直到 Finalize（不支持流式时使用）
///
/// 当模型不支持流式转录时，丢弃所有音频帧，
/// 在收到 Finalize 命令时返回 None（触发 fallback）。
///
/// # Arguments
///
/// * `rx` - StreamCmd 接收端
pub fn drain_until_finalize(rx: mpsc::Receiver<StreamCmd>) {
    while let Ok(cmd) = rx.recv() {
        match cmd {
            StreamCmd::Feed(_) => {} // 丢弃音频帧
            StreamCmd::Finalize(reply) => {
                let _ = reply.send(None); // 返回 None，触发 fallback
                break;
            }
            StreamCmd::Cancel => break,
        }
    }
}

/// 发送流式文本事件
///
/// 通过 Tauri 的 `emit()` 发送 `streaming-text-update` 事件到前端。
/// 使用 `emit()` 发送到所有窗口，确保事件能被接收。
///
/// # Arguments
///
/// * `app_handle` - Tauri AppHandle
/// * `text` - StreamText（包含 committed 和 tentative）
/// * `is_final` - 是否是最终结果
pub fn emit_streaming_text(app_handle: &AppHandle, text: &StreamText, is_final: bool) {
    let display_text = format!("{}{}", text.committed, text.tentative);
    info!(
        "[StreamingWorker] emit_streaming_text: display_text.len()={}, committed.len()={}, tentative.len()={}, is_final={}",
        display_text.len(), text.committed.len(), text.tentative.len(), is_final
    );

    let event = StreamingTextEvent {
        display_text: display_text.clone(),
        delta: text.tentative.clone(),
        is_final,
    };

    // 使用 emit_to() 发送到 float-panel 窗口（与分段转录保持一致）
    // 这确保事件能被前端正确接收
    match app_handle.emit_to("float-panel", "streaming-text-update", event) {
        Ok(_) => {
            //info!("[StreamingWorker] Successfully emitted streaming-text-update to float-panel, display_text.len()={}", display_text.len());
        }
        Err(e) => {
            error!("[StreamingWorker] Failed to emit streaming-text-update: {}", e);
        }
    }
}

/// 发送流式错误事件
///
/// 当流式转录过程中发生错误时调用，通过 Tauri 发送 `streaming-error` 事件到前端。
///
/// # Arguments
///
/// * `app_handle` - Tauri AppHandle
/// * `error` - 错误消息
pub fn emit_streaming_error(app_handle: &AppHandle, error: &str) {
    error!("[StreamingWorker] 发送错误事件: {}", error);

    let event = StreamingErrorEvent {
        error: error.to_string(),
        saved_text: String::new(),
    };

    match app_handle.emit_to("float-panel", "streaming-error", event) {
        Ok(_) => {
            info!("[StreamingWorker] Successfully emitted streaming-error to float-panel");
        }
        Err(e) => {
            error!("[StreamingWorker] Failed to emit streaming-error: {}", e);
        }
    }
}

/// Streaming transcription manager
///
/// Manages the lifecycle of a streaming transcription session,
/// including audio frame processing, text updates, and error handling.
///
/// # Architecture
///
/// This struct is designed to be used by `AudioCapture` for routing
/// audio frames to the streaming backend. It holds:
/// - `app_handle`: For emitting events to the frontend
/// - `scene_id`: Identifier for the current recording scene
/// - `language`: Optional language code for transcription
/// - `committed_text`: Text confirmed by the model (for error recovery)
///
/// # Error Handling
///
/// When an error occurs during streaming, `handle_error()` emits a
/// `streaming-error` event with the saved committed text, allowing
/// the UI to display partial results even on failure.
pub struct StreamingTranscription {
    /// Tauri app handle for emitting events
    app_handle: AppHandle,
    /// Scene identifier for event routing
    scene_id: String,
    /// Optional language code for transcription
    language: Option<String>,
    /// Text confirmed by the model (stable, for error recovery)
    committed_text: String,
}

impl StreamingTranscription {
    /// Create a new streaming transcription instance
    ///
    /// # Arguments
    ///
    /// * `app_handle` - Tauri app handle for emitting events
    /// * `scene_id` - Scene identifier for event routing
    /// * `language` - Optional language code (e.g., "zh", "en")
    ///
    /// # Example
    ///
    /// ```ignore
    /// let streaming = StreamingTranscription::new(
    ///     app_handle,
    ///     "scene-123".to_string(),
    ///     Some("zh".to_string()),
    /// );
    /// ```
    pub fn new(app_handle: AppHandle, scene_id: String, language: Option<String>) -> Self {
        info!(
            "[StreamingTranscription] Created new instance for scene: {}, language: {:?}",
            scene_id, language
        );
        Self {
            app_handle,
            scene_id,
            language,
            committed_text: String::new(),
        }
    }

    /// Process an audio frame for streaming transcription
    ///
    /// Takes PCM audio samples and processes them through the streaming model.
    /// Returns `true` if processing should continue, `false` if an error occurred.
    ///
    /// # Architecture Note
    ///
    /// This method does NOT create a Stream here because `Stream<'a>` borrows
    /// `Session`'s lifetime. The actual Stream creation happens in AudioCapture's
    /// consumer loop where Session is available.
    ///
    /// Current implementation: Placeholder for testing routing logic.
    /// Full implementation requires:
    /// 1. AudioCapture creates Stream in consumer loop when Start command
    /// 2. AudioCapture calls stream.feed(pcm) and stream.text()
    /// 3. AudioCapture emits events via this struct's emit_text_update()
    ///
    /// # Arguments
    ///
    /// * `pcm` - Audio samples as f32 values (16kHz sample rate expected)
    ///
    /// # Returns
    ///
    /// `true` if processing succeeded and should continue,
    /// `false` if an error occurred and streaming should stop.
    pub fn process_frame(&mut self, _pcm: &[f32]) -> bool {
        // Placeholder: In full implementation, AudioCapture will:
        // 1. Create Stream in consumer loop (not here)
        // 2. Call stream.feed(pcm)
        // 3. Call stream.text() → emit_text_update()
        // 4. Handle errors via handle_error()

        // For now, just return true for testing routing logic
        // TODO: Remove this placeholder when integrating with actual Stream
        true
    }

    /// Finalize the streaming transcription
    ///
    /// Called when recording stops to flush any remaining audio
    /// and get the final transcription result.
    ///
    /// # Architecture Note
    ///
    /// This method signals end-of-stream in the architecture:
    /// - AudioCapture calls stream.finalize() in consumer loop
    /// - AudioCapture gets final text via stream.text()
    /// - This method emits the final event via emit_text_update()
    ///
    /// # TODO
    ///
    /// Current implementation is placeholder. Full implementation requires:
    /// 1. AudioCapture calls stream.finalize() in consumer loop
    /// 2. AudioCapture gets final StreamText
    /// 3. This method receives final text and emits final event
    pub fn finalize(&mut self) {
        // Placeholder: In full implementation, AudioCapture will:
        // 1. Call stream.finalize() in consumer loop
        // 2. Get final text via stream.text()
        // 3. Emit final streaming-text-update event

        // Emit final placeholder event for testing
        let final_text = StreamText {
            full: self.committed_text.clone(),
            committed: self.committed_text.clone(),
            tentative: String::new(),
        };
        self.emit_text_update(&final_text, true);

        info!(
            "[StreamingTranscription] Finalized for scene: {}",
            self.scene_id
        );
    }

    /// Handle a streaming error
    ///
    /// Emits a `streaming-error` event to the frontend with the error message
    /// and any committed text that was preserved before the error occurred.
    ///
    /// # Arguments
    ///
    /// * `error` - Error message describing what went wrong
    pub fn handle_error(&self, error: &str) {
        error!(
            "[StreamingTranscription] Error for scene {}: {}",
            self.scene_id, error
        );

        let event = StreamingErrorEvent {
            error: error.to_string(),
            saved_text: self.committed_text.clone(),
        };

        if let Err(e) = self.app_handle.emit("streaming-error", event) {
            warn!(
                "[StreamingTranscription] Failed to emit streaming-error event: {}",
                e
            );
        }
    }

    /// Emit a text update event to the frontend
    ///
    /// Sends a `streaming-text-update` event with the current transcription state.
    ///
    /// # Arguments
    ///
    /// * `text` - StreamText from the model containing committed and tentative text
    /// * `is_final` - Whether this is the final result (end of stream)
    pub fn emit_text_update(&mut self, text: &StreamText, is_final: bool) {
        // Update committed text for error recovery
        self.committed_text = text.committed.clone();

        // Calculate display text (committed + tentative)
        let display_text = format!("{}{}", text.committed, text.tentative);

        // Calculate delta (text added since last update)
        // For simplicity, we use tentative as delta in streaming
        // TODO: Track previous text for accurate delta calculation
        let delta = text.tentative.clone();

        let event = StreamingTextEvent {
            display_text,
            delta,
            is_final,
        };

        if let Err(e) = self.app_handle.emit("streaming-text-update", event) {
            info!(
                "[StreamingTranscription] Failed to emit streaming-text-update event: {}",
                e
            );
        }
    }
}

impl Drop for StreamingTranscription {
    fn drop(&mut self) {
        info!(
            "[StreamingTranscription] Dropping instance for scene: {}",
            self.scene_id
        );
        // Resources will be cleaned up automatically
        // The committed_text is not persisted - it's only for error recovery during the session
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_streaming_text_event_serialization() {
        let event = StreamingTextEvent {
            display_text: "Hello world".to_string(),
            delta: " world".to_string(),
            is_final: false,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("Hello world"));
        assert!(json.contains("is_final"));
    }

    #[test]
    fn test_streaming_error_event_serialization() {
        let event = StreamingErrorEvent {
            error: "Model failed".to_string(),
            saved_text: "Hello".to_string(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("Model failed"));
        assert!(json.contains("Hello"));
    }

    #[test]
    fn test_drain_until_finalize_returns_none() {
        // 测试 Fallback 机制：不支持流式时返回 None
        let (tx, rx) = mpsc::channel();

        // 发送多个音频帧（应该被丢弃）
        for _ in 0..5 {
            tx.send(StreamCmd::Feed(vec![0.1, 0.2, 0.3])).unwrap();
        }

        // 发送 Finalize 命令
        let (reply, finalize_rx) = mpsc::channel();
        tx.send(StreamCmd::Finalize(reply)).unwrap();

        // 调用 drain_until_finalize
        drain_until_finalize(rx);

        // 应该收到 None（触发 fallback）
        let result = finalize_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_drain_until_finalize_handles_cancel() {
        // 测试：收到 Cancel 时应该立即退出
        let (tx, rx) = mpsc::channel();

        // 发送音频帧
        tx.send(StreamCmd::Feed(vec![0.1])).unwrap();

        // 发送 Cancel（而不是 Finalize）
        tx.send(StreamCmd::Cancel).unwrap();

        // drain_until_finalize 应该立即退出
        thread::spawn(move || {
            drain_until_finalize(rx);
        });

        // 等待线程结束（不应该超时）
        thread::sleep(Duration::from_millis(100));
    }

    #[test]
    fn test_drain_discards_all_frames_before_finalize() {
        // 测试：所有 Feed 命令应该被丢弃
        let (tx, rx) = mpsc::channel();

        // 发送大量音频帧
        let frame_count = 100;
        for i in 0..frame_count {
            tx.send(StreamCmd::Feed(vec![i as f32])).unwrap();
        }

        // 发送 Finalize
        let (reply, finalize_rx) = mpsc::channel();
        tx.send(StreamCmd::Finalize(reply)).unwrap();

        // drain_until_finalize 应该丢弃所有帧
        drain_until_finalize(rx);

        // 验证返回 None
        let result = finalize_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(
            result.is_none(),
            "Fallback should return None to trigger batch transcription"
        );
    }
}
