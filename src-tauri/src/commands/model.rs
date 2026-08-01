use crate::config::AppServices;
use crate::llm_models::{scan_available_llm_models, LlmModelPreset};
use crate::model_manager::LoadedModelInfo;
use crate::presets::{get_asr_presets, scan_available_asr_models, ModelPreset};
use crate::utils::downloader::{get_llm_model_path, get_model_storage_dir};
use log::{error, info};
use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Load model response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadModelResponse {
    /// Whether loading was successful
    pub success: bool,
    /// Model ID
    pub model_id: String,
    /// Error message if failed
    pub error: Option<String>,
}

/// Unload model response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnloadModelResponse {
    /// Whether unloading was successful
    pub success: bool,
    /// Model ID
    pub model_id: String,
}

/// Get loaded models response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetLoadedModelsResponse {
    /// List of loaded models
    pub models: Vec<LoadedModelInfo>,
}

/// ASR 模型列表响应（预设 + 状态）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrModelWithStatus {
    pub preset: ModelPreset,
    pub downloaded: bool,
    pub path: Option<String>,
    pub size_mb: Option<u64>,
}

/// Load a model into memory
#[tauri::command]
pub async fn load_model_by_id(
    services: tauri::State<'_, AppServices>,
    model_id: String,
    skip_memory_check: Option<bool>,
) -> Result<LoadModelResponse, String> {
    info!("Loading model: {}", model_id);

    let mut model_manager = services
        .model_manager
        .lock()
        .map_err(|e| format!("Failed to lock model manager: {}", e))?;

    let mgr = model_manager
        .as_mut()
        .ok_or("Model manager not initialized")?;

    let skip_check = skip_memory_check.unwrap_or(false);
    match mgr.load_model(&model_id, skip_check) {
        Ok(loaded_model) => {
            info!("Model loaded successfully: {}", model_id);

            // Update cache with runtime capabilities (if available)
            if let Some(ref caps) = loaded_model.capabilities {
                update_asr_model_capabilities(
                    &services,
                    &model_id,
                    caps.supports_streaming,
                    caps.supports_translation,
                    caps.supports_language_detect,
                    caps.languages.clone(),
                );
            }

            Ok(LoadModelResponse {
                success: true,
                model_id,
                error: None,
            })
        }
        Err(e) => {
            error!("Failed to load model {}: {}", model_id, e);
            Ok(LoadModelResponse {
                success: false,
                model_id,
                error: Some(e),
            })
        }
    }
}

/// Unload a model from memory
#[tauri::command]
pub async fn unload_model(
    services: tauri::State<'_, AppServices>,
    model_id: String,
) -> Result<UnloadModelResponse, String> {
    info!("Unloading model: {}", model_id);

    let mut model_manager = services
        .model_manager
        .lock()
        .map_err(|e| format!("Failed to lock model manager: {}", e))?;

    let mgr = model_manager
        .as_mut()
        .ok_or("Model manager not initialized")?;

    let success = mgr.unload_model(&model_id);
    if success {
        info!("Model unloaded successfully: {}", model_id);
    } else {
        info!("Model was not loaded: {}", model_id);
    }

    Ok(UnloadModelResponse { success, model_id })
}

/// Get list of currently loaded models
#[tauri::command]
pub async fn get_loaded_models(
    services: tauri::State<'_, AppServices>,
) -> Result<GetLoadedModelsResponse, String> {
    let model_manager = services
        .model_manager
        .lock()
        .map_err(|e| format!("Failed to lock model manager: {}", e))?;

    let mgr = model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;

    let models = mgr.get_loaded_models();
    info!("Loaded models count: {}", models.len());

    Ok(GetLoadedModelsResponse { models })
}

/// Check if a specific model is loaded
#[tauri::command]
pub async fn is_model_loaded(
    services: tauri::State<'_, AppServices>,
    model_id: String,
) -> Result<bool, String> {
    let model_manager = services
        .model_manager
        .lock()
        .map_err(|e| format!("Failed to lock model manager: {}", e))?;

    let mgr = model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;

    Ok(mgr.is_loaded(&model_id))
}

/// Get number of loaded models
#[tauri::command]
pub async fn get_loaded_model_count(
    services: tauri::State<'_, AppServices>,
) -> Result<usize, String> {
    let model_manager = services
        .model_manager
        .lock()
        .map_err(|e| format!("Failed to lock model manager: {}", e))?;

    let mgr = model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;

    Ok(mgr.loaded_count())
}

/// Scan available ASR models from storage directory
///
/// Returns a list of all discovered ASR models, including:
/// - Preset models (matching hardcoded presets, with download URLs)
/// - User models (custom models found on disk, without download URLs)
#[tauri::command]
pub async fn scan_asr_models() -> Result<Vec<ModelPreset>, String> {
    info!("Scanning ASR models from storage directory");
    let models = scan_available_asr_models();
    info!("Found {} ASR models", models.len());
    Ok(models)
}

/// Scan available LLM models from storage directory
///
/// Returns a list of all discovered GGUF models, including:
/// - Preset models (matching hardcoded presets, with download URLs)
/// - User models (custom models found on disk, without download URLs)
#[tauri::command]
pub async fn scan_llm_models() -> Result<Vec<LlmModelPreset>, String> {
    info!("Scanning LLM models from storage directory");
    let models = scan_available_llm_models();
    info!("Found {} LLM models", models.len());
    Ok(models)
}

/// Get ASR model list with download status
///
/// Returns a combined list of:
/// - Already downloaded models (from directory scan, downloaded=true)
/// - Preset models not yet downloaded (downloaded=false)
///
/// 使用缓存机制避免重复文件系统扫描
#[tauri::command]
pub async fn get_asr_model_list(
    services: tauri::State<'_, AppServices>,
) -> Result<Vec<AsrModelWithStatus>, String> {
    info!("[ASR] Getting ASR model list");

    // 检查缓存是否有效
    {
        let cache = services
            .asr_models_cache
            .lock()
            .map_err(|e| format!("Failed to lock ASR models cache: {}", e))?;

        if cache.is_valid() {
            info!("[ASR] Using cached model list ({} models)", cache.models.len());
            // 从缓存构建结果列表
            return Ok(build_model_list_from_presets(&cache.models, &services));
        }
    }

    // 缓存无效，重新扫描
    info!("[ASR] Cache invalid, scanning models...");
    let available_models = scan_available_asr_models();
    info!(
        "[ASR] Found {} available models in directory",
        available_models.len()
    );

    // 更新缓存
    {
        let mut cache = services
            .asr_models_cache
            .lock()
            .map_err(|e| format!("Failed to lock ASR models cache: {}", e))?;
        cache.update(available_models.clone());
        info!("[ASR] Cache updated with {} models", available_models.len());
    }

    Ok(build_model_list_from_presets(&available_models, &services))
}

/// 从预设列表构建带状态的模型列表
fn build_model_list_from_presets(
    available_models: &[ModelPreset],
    services: &AppServices,
) -> Vec<AsrModelWithStatus> {
    // 获取预设列表（用于下载源信息）
    let presets = get_asr_presets();

    // 获取模型存储目录
    let storage_dir = match get_model_storage_dir() {
        Ok(dir) => dir,
        Err(_) => {
            log::error!("[ASR] Failed to get model storage dir");
            return Vec::new();
        }
    };

    let mut result: Vec<AsrModelWithStatus> = Vec::new();

    // 添加已存在的模型（全部 downloaded=true）
    for model in available_models {
        // 优先使用扫描时记录的路径
        let (path, downloaded) = if let Some(ref scanned_path) = model.path {
            // 扫描结果中有路径，直接使用
            let path_buf = std::path::Path::new(scanned_path);
            if path_buf.exists() {
                (Some(scanned_path.clone()), true)
            } else {
                // 文件可能被删除了
                (None, false)
            }
        } else {
            // 扫描结果中没有路径，尝试在默认目录中查找
            // （兼容旧版本的预设，如硬编码的预设模型）
            let model_path = match model.backend {
                Some(crate::backends::BackendType::Onnx) => {
                    // ONNX 模型是目录
                    storage_dir.join(&model.id)
                }
                Some(crate::backends::BackendType::TranscribeCpp) => {
                    // GGUF/GGML 模型是文件，需要尝试扩展名
                    let gguf_path = storage_dir.join(format!("{}.gguf", model.id));
                    if gguf_path.exists() {
                        gguf_path
                    } else {
                        storage_dir.join(format!("{}.bin", model.id))
                    }
                }
                None => {
                    // 未知后端，尝试目录
                    storage_dir.join(&model.id)
                }
            };

            let path = if model_path.exists() {
                Some(model_path.to_string_lossy().to_string())
            } else {
                None
            };
            let downloaded = path.is_some();
            (path, downloaded)
        };

        // 获取文件/目录大小
        let size_mb = path.as_ref().and_then(|p| {
            let path = std::path::Path::new(p);
            if path.is_dir() {
                // 目录大小计算（简化版，只计算顶层文件）
                std::fs::read_dir(path).ok().and_then(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .filter_map(|e| std::fs::metadata(e.path()).ok())
                        .map(|m| m.len())
                        .sum::<u64>()
                        .checked_div(1024 * 1024)
                })
            } else {
                std::fs::metadata(path)
                    .ok()
                    .map(|m| m.len() / (1024 * 1024))
            }
        });

        result.push(AsrModelWithStatus {
            preset: model.clone(),
            downloaded,
            path,
            size_mb,
        });
    }

    // 添加未下载的预设（downloaded=false）
    for preset in presets {
        // 检查是否已经在已存在列表中
        if !result.iter().any(|m| m.preset.id == preset.id) {
            result.push(AsrModelWithStatus {
                preset,
                downloaded: false,
                path: None,
                size_mb: None,
            });
        }
    }

    log::info!(
        "[ASR] Total {} models ({} downloaded, {} presets)",
        result.len(),
        result.iter().filter(|m| m.downloaded).count(),
        result.iter().filter(|m| !m.downloaded).count()
    );

    result
}

/// 使 ASR 模型缓存失效
///
/// 在添加/删除自定义模型目录后调用
#[allow(dead_code)]
pub fn invalidate_asr_models_cache(services: &AppServices) {
    if let Ok(cache) = services.asr_models_cache.lock() {
        cache.invalidate();
        info!("[ASR] Cache invalidated");
    }
}

/// 更新缓存中模型的能力信息
///
/// 在模型加载成功后调用，将从运行时获取的能力信息更新到缓存中。
/// 这可以修正 GGUF 头部探测可能存在的误差（如 parakeet 的流式能力）。
pub fn update_asr_model_capabilities(
    services: &AppServices,
    model_id: &str,
    supports_streaming: Option<bool>,
    supports_translation: Option<bool>,
    supports_language_detect: Option<bool>,
    languages: Option<Vec<String>>,
) {
    let mut cache = match services.asr_models_cache.lock() {
        Ok(cache) => cache,
        Err(e) => {
            error!("[ASR] Failed to lock cache: {}", e);
            return;
        }
    };

    // 查找并更新模型
    if let Some(model) = cache.models.iter_mut().find(|m| m.id == model_id) {
        // 只更新非 None 的值（保留已有的探测结果）
        if supports_streaming.is_some() {
            model.supports_streaming = supports_streaming;
        }
        if supports_translation.is_some() {
            model.supports_translation = supports_translation;
        }
        if supports_language_detect.is_some() {
            model.supports_auto_detect = supports_language_detect;
        }
        if let Some(ref langs) = languages {
            if !langs.is_empty() {
                model.languages = langs.clone();
            }
        }
        info!(
            "[ASR] Updated capabilities for model {}: streaming={:?}, translation={:?}",
            model_id, model.supports_streaming, model.supports_translation
        );
    } else {
        info!(
            "[ASR] Model {} not found in cache, skipping capability update",
            model_id
        );
    }
}

/// 内存状态响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStatusResponse {
    /// 已加载的 ASR 模型列表
    pub asr_models: Vec<LoadedModelInfo>,
    /// 当前缓存的 LLM 模型（名称和大小）
    pub llm_model: Option<LlmModelMemoryInfo>,
    /// 总内存占用（MB）
    pub total_memory_mb: u64,
}

/// LLM 模型内存信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelMemoryInfo {
    pub name: String,
    pub size_mb: u64,
}

/// 获取内存状态
#[tauri::command]
pub async fn get_memory_status(
    services: tauri::State<'_, AppServices>,
) -> Result<MemoryStatusResponse, String> {
    let model_manager = services
        .model_manager
        .lock()
        .map_err(|e| format!("Failed to lock model manager: {}", e))?;

    let mgr = model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;

    // 获取已加载的 ASR 模型
    let asr_models = mgr.get_loaded_models();

    // 计算 ASR 模型总内存
    let asr_memory_mb: u64 = asr_models.iter().map(|m| m.memory_mb).sum();

    // 获取 LLM 模型信息
    let llm_model = crate::llm::get_cached_llm_model_info()
        .map(|(name, size_mb)| LlmModelMemoryInfo { name, size_mb });

    let llm_memory_mb = llm_model.as_ref().map(|m| m.size_mb).unwrap_or(0);

    // 总内存占用
    let total_memory_mb = asr_memory_mb + llm_memory_mb;

    // info!("[MemoryStatus] ASR: {}MB, LLM: {}MB, Total: {}MB",
    //     asr_memory_mb, llm_memory_mb, total_memory_mb);

    Ok(MemoryStatusResponse {
        asr_models,
        llm_model,
        total_memory_mb,
    })
}

/// 获取用户自定义 ASR 模型文件夹路径列表
#[tauri::command]
pub async fn get_custom_asr_model_dirs(
    services: tauri::State<'_, AppServices>,
) -> Result<Vec<String>, String> {
    let config = services
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;

    let dirs = config.custom_asr_model_dirs.clone();
    info!("[CustomDirs] Retrieved {} custom ASR model directories", dirs.len());

    Ok(dirs)
}

/// 添加用户自定义 ASR 模型文件夹路径
#[tauri::command]
pub async fn add_custom_asr_model_dir(
    app: tauri::AppHandle,
    path: String,
) -> Result<bool, String> {
    info!("[CustomDirs] Adding custom ASR model directory: {}", path);

    // 验证路径是否存在且是目录
    let path_buf = std::path::Path::new(&path);
    if !path_buf.exists() {
        error!("[CustomDirs] Path does not exist: {}", path);
        return Err(format!("路径不存在: {}", path));
    }
    if !path_buf.is_dir() {
        error!("[CustomDirs] Path is not a directory: {}", path);
        return Err(format!("路径不是文件夹: {}", path));
    }

    // 获取 AppServices
    let services = app.state::<crate::config::AppServices>();

    // 加载配置并修改
    let mut config = {
        let config_guard = services
            .config
            .lock()
            .map_err(|e| format!("Failed to lock config: {}", e))?;
        config_guard.clone()
    };

    // 检查是否已存在
    if config.custom_asr_model_dirs.contains(&path) {
        info!("[CustomDirs] Directory already in list: {}", path);
        return Ok(true); // 已存在，返回成功
    }

    // 添加新路径
    config.custom_asr_model_dirs.push(path.clone());
    info!("[CustomDirs] Added directory: {}", path);

    // 保存配置
    crate::config::save_config_internal(&config, &*services)?;
    info!("[CustomDirs] Configuration saved successfully");

    // 使缓存失效（新目录可能包含模型）
    invalidate_asr_models_cache(&services);

    Ok(true)
}

/// 移除用户自定义 ASR 模型文件夹路径
#[tauri::command]
pub async fn remove_custom_asr_model_dir(
    app: tauri::AppHandle,
    path: String,
) -> Result<bool, String> {
    info!("[CustomDirs] Removing custom ASR model directory: {}", path);

    // 获取 AppServices
    let services = app.state::<crate::config::AppServices>();

    // 加载配置并修改
    let mut config = {
        let config_guard = services
            .config
            .lock()
            .map_err(|e| format!("Failed to lock config: {}", e))?;
        config_guard.clone()
    };

    // 检查是否存在
    let original_len = config.custom_asr_model_dirs.len();
    config.custom_asr_model_dirs.retain(|p| p != &path);

    if config.custom_asr_model_dirs.len() == original_len {
        info!("[CustomDirs] Directory not found in list: {}", path);
        return Ok(false); // 不存在，返回失败（但不是错误）
    }

    info!("[CustomDirs] Removed directory: {}", path);

    // 保存配置
    crate::config::save_config_internal(&config, &*services)?;
    info!("[CustomDirs] Configuration saved successfully");

    // 使缓存失效（移除的目录可能包含模型）
    invalidate_asr_models_cache(&services);

    Ok(true)
}
