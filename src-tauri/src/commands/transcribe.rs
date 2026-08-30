use crate::backends::{
    BackendType, SpeechBackend, TranscribeParams, TranscribeResult as BackendTranscribeResult,
};
use crate::config::{AppConfig, AppServices};
use crate::dictionary::{DictionaryMatcher, UserDictionary};
use crate::model_manager::ModelManager;
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use log::info;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::State;

/// Transcribe request parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeRequest {
    /// Scene ID to determine which model to use
    pub scene_id: String,
    /// Audio file path (WAV format recommended)
    pub audio_path: String,
    /// Optional language override (e.g., "zh", "en", "auto")
    pub language: Option<String>,
    /// Whether to translate to English
    pub translate: Option<bool>,
    /// Optional initial prompt
    pub initial_prompt: Option<String>,
}

/// Transcribe response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeResponse {
    /// Recognized text
    pub text: String,
    /// Detected or specified language
    pub language: Option<String>,
    /// Transcription segments (if available)
    pub segments: Vec<TranscribeSegment>,
}

/// Transcribe segment
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeSegment {
    /// Segment text
    pub text: String,
    /// Start time in seconds
    pub start: f32,
    /// End time in seconds
    pub end: f32,
}

/// Lazy-initialized OpenCC converter for Traditional to Simplified Chinese
static OPENCC_CONVERTER: Lazy<Option<OpenCC>> =
    Lazy::new(|| match OpenCC::from_config(BuiltinConfig::Tw2sp) {
        Ok(converter) => {
            info!("[OpenCC] Converter initialized successfully");
            Some(converter)
        }
        Err(e) => {
            info!("[OpenCC] Failed to initialize converter: {}", e);
            None
        }
    });

/// Convert traditional Chinese to simplified Chinese
fn to_simplified_chinese(text: &str) -> String {
    if let Some(converter) = OPENCC_CONVERTER.as_ref() {
        converter.convert(text)
    } else {
        text.to_string()
    }
}

/// 检测文本是否包含中文字符
fn contains_chinese(text: &str) -> bool {
    text.chars().any(|c| {
        // CJK Unified Ideographs: U+4E00 - U+9FFF
        // CJK Unified Ideographs Extension A: U+3400 - U+4DBF
        // CJK Compatibility Ideographs: U+F900 - U+FAFF
        matches!(c, '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}' | '\u{F900}'..='\u{FAFF}')
    })
}

/// Convert backend result to response
fn convert_result(
    result: BackendTranscribeResult,
    dictionary: &UserDictionary,
    backend_type: BackendType,
) -> TranscribeResponse {
    // 检测文本是否包含中文字符，只有中文才需要繁体转简体
    let detected_lang = result.language.as_deref().unwrap_or("unknown");
    let is_chinese = contains_chinese(&result.text);

    info!(
        "[Transcribe] 检测语言字段: {}, 文本是否含中文: {}",
        detected_lang, is_chinese
    );

    let mut text = if is_chinese {
        info!(
            "[Transcribe] 执行繁体转简体转换，原文长度: {}",
            result.text.len()
        );
        let converted = to_simplified_chinese(&result.text);
        info!("[Transcribe] 转换完成，结果长度: {}", converted.len());
        converted
    } else {
        info!("[Transcribe] 非中文，跳过繁体转简体");
        result.text.clone()
    };

    // 只有不支持原生热词的模型才执行后处理修正
    // TranscribeCpp 后端已通过 context 参数在模型端处理热词
    if dictionary.enabled
        && !dictionary.entries.is_empty()
        && !backend_type.supports_native_hotwords()
    {
        info!(
            "[Transcribe] 应用用户词典后处理修正，词条数: {}",
            dictionary.entries.len()
        );
        let matcher = DictionaryMatcher::new(&dictionary.entries, dictionary.threshold);
        text = matcher.apply(&text);
        info!("[Transcribe] 词典修正完成");
    } else if dictionary.enabled && !dictionary.entries.is_empty() {
        info!("[Transcribe] 模型已原生处理热词，跳过后处理修正");
    }

    TranscribeResponse {
        text,
        language: result.language,
        segments: result
            .segments
            .into_iter()
            .map(|s| TranscribeSegment {
                text: if contains_chinese(&s.text) {
                    to_simplified_chinese(&s.text)
                } else {
                    s.text
                },
                start: s.start,
                end: s.end,
            })
            .collect(),
    }
}

/// Decode audio file to f32 samples
fn decode_audio_to_samples(audio_path: &str) -> Result<Vec<f32>, String> {
    let path = Path::new(audio_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", audio_path));
    }

    // Read the audio file
    let data = std::fs::read(path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Check file extension
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "wav" => decode_wav(&data),
        "webm" | "mp3" | "ogg" => {
            // For other formats, we'd need ffmpeg or a decoder
            // For now, return an error suggesting conversion to WAV
            Err(format!(
                "Audio format '{}' not supported. Please convert to WAV first.",
                ext
            ))
        }
        _ => Err(format!("Unknown audio format: {}", ext)),
    }
}

/// Decode WAV data to f32 samples
fn decode_wav(data: &[u8]) -> Result<Vec<f32>, String> {
    // Simple WAV parsing
    // Check RIFF header
    if data.len() < 44 {
        return Err("Invalid WAV file: too small".to_string());
    }

    let riff = String::from_utf8_lossy(&data[0..4]);
    let wave = String::from_utf8_lossy(&data[8..12]);

    if riff != "RIFF" || wave != "WAVE" {
        return Err("Invalid WAV file: missing RIFF/WAVE header".to_string());
    }

    // Find fmt chunk
    let mut offset = 12;
    let mut channels: u16 = 1;
    let mut sample_rate: u32 = 16000;
    let mut bits_per_sample: u16 = 16;

    while offset + 8 < data.len() {
        let chunk_id = String::from_utf8_lossy(&data[offset..offset + 4]);
        let chunk_size = u32::from_le_bytes([
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        ]) as usize;

        if chunk_id == "fmt " {
            channels = u16::from_le_bytes([data[offset + 8], data[offset + 9]]);
            sample_rate = u32::from_le_bytes([
                data[offset + 12],
                data[offset + 13],
                data[offset + 14],
                data[offset + 15],
            ]);
            bits_per_sample = u16::from_le_bytes([data[offset + 22], data[offset + 23]]);
            break;
        }

        offset += 8 + chunk_size;
        // Align to word boundary
        if chunk_size % 2 != 0 {
            offset += 1;
        }
    }

    // Find data chunk
    offset = 12;
    while offset + 8 < data.len() {
        let chunk_id = String::from_utf8_lossy(&data[offset..offset + 4]);
        let chunk_size = u32::from_le_bytes([
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        ]) as usize;

        if chunk_id == "data" {
            // 边界检查：确保不超出文件实际长度
            let start = offset + 8;
            let end = (start + chunk_size).min(data.len());
            let audio_data = &data[start..end];

            // Convert to f32 samples
            let mut samples = Vec::new();
            let bytes_per_sample = (bits_per_sample / 8) as usize;

            for i in (0..audio_data.len() / bytes_per_sample * bytes_per_sample)
                .step_by(bytes_per_sample)
            {
                if bytes_per_sample == 2 {
                    // 16-bit PCM
                    let sample = i16::from_le_bytes([audio_data[i], audio_data[i + 1]]);
                    samples.push(sample as f32 / 32768.0);
                } else if bytes_per_sample == 4 {
                    // 32-bit float
                    let sample = f32::from_le_bytes([
                        audio_data[i],
                        audio_data[i + 1],
                        audio_data[i + 2],
                        audio_data[i + 3],
                    ]);
                    samples.push(sample);
                }
            }

            // Mix stereo to mono if needed
            if channels == 2 {
                let frame_count = samples.len() / 2; // 向下取整，丢弃奇数余数
                let mut mono = Vec::with_capacity(frame_count);
                for i in 0..frame_count {
                    mono.push((samples[i * 2] + samples[i * 2 + 1]) / 2.0);
                }
                samples = mono;
            }

            // Resample if needed (simple decimation/duplication for now)
            if sample_rate != 16000 {
                let ratio = sample_rate as f32 / 16000.0;
                let new_len = (samples.len() as f32 / ratio) as usize;
                let mut resampled = Vec::with_capacity(new_len);
                for i in 0..new_len {
                    let src_idx = (i as f32 * ratio) as usize;
                    if src_idx < samples.len() {
                        resampled.push(samples[src_idx]);
                    }
                }
                samples = resampled;
            }

            return Ok(samples);
        }

        offset += 8 + chunk_size;
        if chunk_size % 2 != 0 {
            offset += 1;
        }
    }

    Err("Could not find audio data in WAV file".to_string())
}

/// Transcribe audio using the scene's configured model
#[tauri::command]
pub async fn transcribe_audio(
    services: State<'_, AppServices>,
    request: TranscribeRequest,
) -> Result<TranscribeResponse, String> {
    info!(
        "Transcribing audio: {} for scene: {}",
        request.audio_path, request.scene_id
    );

    // 先解码音频（不持有锁，避免阻塞）
    let audio_samples = decode_audio_to_samples(&request.audio_path)?;
    info!("Audio decoded: {} samples", audio_samples.len());

    // 获取模型（Arc 方案：获取后立即释放锁）
    let loaded_model: std::sync::Arc<crate::model_manager::LoadedModel> = {
        let mut model_manager = services
            .model_manager
            .lock()
            .map_err(|e| format!("Failed to lock model manager: {}", e))?;

        let mgr = model_manager
            .as_mut()
            .ok_or("Model manager not initialized")?;

        // 获取或加载模型（返回 Arc<LoadedModel>）
        let model = mgr
            .get_or_load_model(&request.scene_id)
            .map_err(|e| format!("Failed to get model: {}", e))?;

        // 更新最后使用时间
        model.touch();

        // 锁在这里释放！
        model
    };

    // Build transcribe params
    // 确定语言：优先使用请求参数，其次使用用户偏好
    // 语言选择逻辑由前端负责，后端只读取配置
    let language = if let Some(lang) = request.language {
        // 请求参数中指定了语言，直接使用
        info!("[Transcribe] 使用请求指定的语言: {}", lang);
        lang
    } else {
        // 从配置中获取用户偏好（前端已设置好推荐值）
        let config = services
            .config
            .lock()
            .map_err(|e| format!("Failed to lock config: {}", e))?;

        // 使用全局 ASR 模型的 model_id 获取语言偏好
        let model_id = config.global_model_config.asr_model.model_id.clone();

        // 直接使用用户偏好，前端已在选择模型时设置
        config
            .model_language_prefs
            .get(&model_id)
            .cloned()
            .unwrap_or_else(|| {
                info!("[Transcribe] 模型 {} 没有语言偏好，使用 auto", model_id);
                "auto".to_string()
            })
    };

    info!("[Transcribe] 最终使用语言: {}", language);

    let mut params = TranscribeParams::default();
    params.language = language;
    params.translate = request.translate.unwrap_or(false);
    params.initial_prompt = request.initial_prompt;

    // Perform transcription（ModelManager 锁已释放，loaded_model 仍有效）
    let result = loaded_model
        .backend
        .transcribe(&audio_samples, &params)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    info!("Transcription complete: {} chars", result.text.len());

    // 获取 backend 类型（用于判断是否需要后处理修正）
    let backend_type = loaded_model.backend.backend_type();

    // 获取用户词典配置
    let dictionary = {
        let config = services
            .config
            .lock()
            .map_err(|e| format!("Failed to lock config: {}", e))?;
        config.user_dictionary.clone()
    };

    Ok(convert_result(result, &dictionary, backend_type))
}

/// 内部转录函数（供 capture.rs 直接调用，无需 IPC）
/// 接收 samples 切片而非文件路径，配合 Arc+索引方案避免数据复制
pub fn transcribe_samples_internal(
    services: &AppServices,
    samples: &[f32],
    scene_id: &str,
) -> Result<String, String> {
    info!(
        "[Transcribe] Internal transcribing {} samples for scene: {}",
        samples.len(),
        scene_id
    );

    // 获取模型（Arc 方案：获取后立即释放锁）
    let loaded_model: std::sync::Arc<crate::model_manager::LoadedModel> = {
        let mut model_manager = services
            .model_manager
            .lock()
            .map_err(|e| format!("Failed to lock model manager: {}", e))?;

        let mgr = model_manager
            .as_mut()
            .ok_or("Model manager not initialized")?;

        // 获取或加载模型（返回 Arc<LoadedModel>）
        let model = mgr
            .get_or_load_model(scene_id)
            .map_err(|e| format!("Failed to get model: {}", e))?;

        // 更新最后使用时间
        model.touch();

        // 锁在这里释放！Arc<LoadedModel> 不依赖锁的生命周期
        model
    };

    // 构建转录参数（使用全局 ASR 模型配置）
    let config = services
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;

    // 使用全局 ASR 模型的 model_id 获取语言偏好
    let global_asr_model_id = config.global_model_config.asr_model.model_id.clone();

    // 确定语言：直接使用用户偏好（前端已设置好推荐值）
    // 语言选择逻辑由前端负责，后端只读取配置
    let language = config
        .model_language_prefs
        .get(&global_asr_model_id)
        .cloned()
        .unwrap_or_else(|| {
            // 兜底：如果前端没有设置偏好，使用 auto
            // 正常情况前端会在选择模型时自动设置推荐语言
            info!(
                "[Transcribe] 模型 {} 没有语言偏好，使用 auto",
                global_asr_model_id
            );
            "auto".to_string()
        });

    info!(
        "[Transcribe] 使用语言: {} for 全局 ASR 模型 {}",
        language, global_asr_model_id
    );

    let mut params = TranscribeParams::default();
    params.language = language;
    params.translate = false;

    // 获取用户词典
    let dictionary = config.user_dictionary.clone();
    let backend_type = loaded_model.backend.backend_type();

    // 释放 config 锁，避免阻塞
    drop(config);

    // 执行转录（ModelManager 锁已释放，loaded_model 仍有效）
    let result = loaded_model
        .backend
        .transcribe(samples, &params)
        .map_err(|e| format!("Transcription failed: {}", e))?;

    // 转换结果（繁体转简体、词典修正）
    let response = convert_result(result, &dictionary, backend_type);

    Ok(response.text)
}

/// Initialize the model manager (called during app setup)
/// 注意：启动时不初始化 GPU 加速器，也不预加载模型
/// 所有初始化移到后台异步执行，让 WebView 快速渲染
pub fn init_model_manager(config: Arc<Mutex<AppConfig>>) -> AppServices {
    use log::info;

    // GPU 加速器初始化移到后台线程，避免阻塞 WebView 渲染
    // apply_ort_accelerator 会在后台预加载时调用

    info!("[init_model_manager] 创建 ModelManager（跳过启动时初始化）...");
    let manager = ModelManager::new(config.clone());

    info!("[init_model_manager] 初始化完成（GPU 加速器和模型将在后台异步初始化）");
    AppServices {
        model_manager: Arc::new(Mutex::new(Some(manager))),
        config,
        asr_models_cache: Arc::new(Mutex::new(crate::config::AsrModelsCache::new())),
        download_cancel_manager: Arc::new(crate::config::DownloadCancelManager::new()),
    }
}

/// 清理所有模型资源（退出前显式调用）
/// 确保所有 Python 进程、LLM 缓存等资源被及时释放
#[tauri::command]
pub fn cleanup_all_resources(services: State<'_, AppServices>) -> Result<(), String> {
    info!("[Cleanup] 开始显式清理所有资源...");

    // 1. 清理 ModelManager 中的所有模型（触发 Python 进程停止）
    {
        let mut model_manager = services
            .model_manager
            .lock()
            .map_err(|e| format!("Failed to lock model manager: {}", e))?;

        if let Some(mgr) = model_manager.take() {
            let loaded_models = mgr.get_loaded_models();
            info!("[Cleanup] 清理 {} 个已加载模型", loaded_models.len());

            // drop mgr 会触发所有 LoadedModel.drop -> SpeechBackend 资源释放
            drop(mgr);
            info!("[Cleanup] ModelManager 已清理");
        } else {
            info!("[Cleanup] ModelManager 未初始化，跳过清理");
        }
    }

    // 2. 清理 LLM MODEL_CACHE
    crate::llm::clear_model_cache();

    info!("[Cleanup] 所有资源清理完成");
    Ok(())
}
