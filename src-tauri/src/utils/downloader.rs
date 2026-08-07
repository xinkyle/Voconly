// Model downloader module
// Provides model download functionality with multi-source support and retry logic

use crate::config::{load_config, AppServices};
use crate::paths::{llm_models_dir, models_dir};
use crate::presets::{get_asr_presets, get_model_backend, is_gguf_model, is_llm_model, is_onnx_model, scan_available_asr_models};
use futures_util::StreamExt;
use log;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

/// Maximum number of retry attempts for download failures
const MAX_RETRY_ATTEMPTS: u32 = 3;

/// Default retry delay in seconds
const DEFAULT_RETRY_DELAY_SECS: u64 = 2;

/// Extract a zip file to the specified directory
/// Handles both flat zip files and zip files with a single root directory
fn extract_zip(zip_path: &PathBuf, dest_dir: &PathBuf) -> Result<(), String> {
    let file =
        std::fs::File::open(zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;

    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // Create destination directory if it doesn't exist
    if !dest_dir.exists() {
        std::fs::create_dir_all(dest_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // First, extract all files to a temp location to check structure
    let temp_extract_dir = dest_dir.with_extension("extract_tmp");
    if !temp_extract_dir.exists() {
        std::fs::create_dir_all(&temp_extract_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    }

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry {}: {}", i, e))?;

        let outpath = match file.enclosed_name() {
            Some(path) => temp_extract_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            // Directory
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory {}: {}", outpath.display(), e))?;
        } else {
            // File
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| {
                        format!("Failed to create directory {}: {}", p.display(), e)
                    })?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create file {}: {}", outpath.display(), e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file {}: {}", outpath.display(), e))?;
        }
    }

    // Check if there's a single root directory in the extracted content
    // This handles cases where zip contains: qwen3-asr-0.6/config.json, qwen3-asr-0.6/model.safetensors, etc.
    let root_entries: Vec<std::fs::DirEntry> = std::fs::read_dir(&temp_extract_dir)
        .map_err(|e| format!("Failed to read temp directory: {}", e))?
        .filter_map(|e| e.ok())
        .collect();

    let single_dir = if root_entries.len() == 1 {
        let entry = &root_entries[0];
        let entry_path = entry.path();
        if entry_path.is_dir() {
            // Check if the directory name matches or is similar to dest_dir name
            let dir_name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            let dest_name = dest_dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
            // If the single directory name contains the model name or vice versa
            dir_name.contains(dest_name) || dest_name.contains(dir_name) || dir_name == "models"
        } else {
            false
        }
    } else {
        false
    };

    // Move files to final destination
    if single_dir {
        // There's a single root directory, move its contents to dest_dir
        let single_dir_path = root_entries[0].path();
        for entry in std::fs::read_dir(&single_dir_path)
            .map_err(|e| format!("Failed to read nested directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let src_path = entry.path();
            let dest_path = dest_dir.join(src_path.file_name().unwrap_or_default());
            if src_path.is_dir() {
                // Copy directory recursively
                copy_dir_all(&src_path, &dest_path)?;
            } else {
                std::fs::copy(&src_path, &dest_path)
                    .map_err(|e| format!("Failed to move file: {}", e))?;
            }
        }
    } else {
        // No single root directory, move all files directly
        for entry in std::fs::read_dir(&temp_extract_dir)
            .map_err(|e| format!("Failed to read temp directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let src_path = entry.path();
            let dest_path = dest_dir.join(src_path.file_name().unwrap_or_default());
            if src_path.is_dir() {
                copy_dir_all(&src_path, &dest_path)?;
            } else {
                std::fs::copy(&src_path, &dest_path)
                    .map_err(|e| format!("Failed to move file: {}", e))?;
            }
        }
    }

    // Clean up temp directory
    std::fs::remove_dir_all(&temp_extract_dir)
        .map_err(|e| format!("Failed to clean up temp directory: {}", e))?;

    Ok(())
}

/// Copy a directory and all its contents recursively
fn copy_dir_all(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(dest)
        .map_err(|e| format!("Failed to create directory {}: {}", dest.display(), e))?;

    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {}: {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
        let dest_path = dest.join(entry_path.file_name().unwrap_or_default());

        if entry_path.is_dir() {
            copy_dir_all(&entry_path, &dest_path)?;
        } else {
            std::fs::copy(&entry_path, &dest_path)
                .map_err(|e| format!("Failed to copy file {}: {}", entry_path.display(), e))?;
        }
    }

    Ok(())
}

/// Download progress event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: u8,
    pub speed: f64,
    pub source: Option<String>,
}

/// Download result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub success: bool,
    pub model_id: String,
    pub path: Option<String>,
    pub error: Option<String>,
    pub source: Option<String>,
}

/// Download source with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSourceInfo {
    pub name: String,
    pub url: String,
    pub is_china_accessible: bool,
    pub priority: u8,
}

/// Get model storage directory
pub fn get_model_storage_dir() -> Result<PathBuf, String> {
    models_dir()
}

/// 统一辅助函数：获取模型路径（优先使用 ModelPreset）
///
/// 查找顺序：
/// 1. 扫描结果（已存在的模型，包含自定义目录）
/// 2. Catalog 预设（未下载的模型，使用 default_quant）
/// 3. Fallback：旧逻辑（兼容）
pub fn get_model_path_from_preset(model_id: &str) -> Result<PathBuf, String> {
    // Step 1: 先从扫描结果查找（已存在的模型）
    let scanned = scan_available_asr_models();
    if let Some(preset) = scanned.iter().find(|p| p.id == model_id) {
        // 最高优先级：扫描器设置的完整路径（包括自定义目录）
        if let Some(ref path_str) = preset.path {
            log::debug!("[get_model_path_from_preset] 使用扫描结果的 path: {}", path_str);
            return Ok(PathBuf::from(path_str));
        }
        // 次优先级：文件名（在默认目录查找）
        if let Some(ref filename) = preset.filename {
            let storage_dir = get_model_storage_dir()?;
            let path = storage_dir.join(filename);
            log::debug!("[get_model_path_from_preset] 使用扫描结果的 filename: {}", path.display());
            return Ok(path);
        }
    }

    // Step 2: 从 catalog 预设查找（未下载的模型）
    let presets = get_asr_presets();
    if let Some(preset) = presets.iter().find(|p| p.id == model_id) {
        // 使用 catalog 的 default_quant 对应的 filename
        if let Some(ref filename) = preset.filename {
            let storage_dir = get_model_storage_dir()?;
            let path = storage_dir.join(filename);
            log::debug!("[get_model_path_from_preset] 使用 catalog 预设的 filename: {}", path.display());
            return Ok(path);
        }
    }

    // Step 3: Fallback：使用旧逻辑（兼容）
    let backend = get_model_backend_str(model_id);
    log::debug!("[get_model_path_from_preset] Fallback 到 get_model_path: model_id={}, backend={}", model_id, backend);
    get_model_path(model_id, &backend)
}

/// Get model file path by model ID and backend type
/// For ONNX models (SenseVoice/Parakeet/Moonshine), returns directory path
/// For Whisper models, returns file path
/// For Python backend models (Qwen3-ASR), returns directory path
/// For GGUF models (TranscribeCpp backend), returns file path
///
/// 搜索顺序：
/// 1. 默认的 models 目录（优先级最高）
/// 2. 用户自定义的目录列表（custom_asr_model_dirs）
pub fn get_model_path(model_id: &str, backend: &str) -> Result<PathBuf, String> {
    let storage_dir = get_model_storage_dir()?;
    log::debug!("[get_model_path] 开始查找: model_id={}, backend={}, storage_dir={}", model_id, backend, storage_dir.display());

    // Use unified detection functions
    let is_gguf = is_gguf_model(model_id) || backend == "transcribe_cpp" || backend == "transcribecpp" || backend == "transcribe-cpp";
    let is_onnx = is_onnx_model(model_id) || backend == "onnx";

    log::debug!("[get_model_path] 判断模型类型: is_gguf={}, is_onnx={}", is_gguf, is_onnx);

    if is_gguf {
        // GGUF 文件直接使用文件名
        let filename = if model_id.ends_with(".gguf") || model_id.ends_with(".bin") {
            log::debug!("[get_model_path] 模型ID已包含扩展名: {}", model_id);
            model_id.to_string()
        } else {
            // 先尝试 .gguf，如果不存在则尝试 .bin (GGML 格式)
            let gguf_path = storage_dir.join(format!("{}.gguf", model_id));
            let bin_path = storage_dir.join(format!("{}.bin", model_id));
            log::debug!("[get_model_path] 尝试默认目录: gguf={}, bin={}", gguf_path.display(), bin_path.display());

            if gguf_path.exists() {
                log::debug!("[get_model_path] 默认目录找到.gguf文件");
                format!("{}.gguf", model_id)
            } else if bin_path.exists() {
                log::debug!("[get_model_path] 默认目录找到.bin文件");
                format!("{}.bin", model_id)
            } else {
                log::debug!("[get_model_path] 默认目录未找到文件，使用.gguf扩展名");
                format!("{}.gguf", model_id)
            }
        };

        // 先检查默认目录
        let default_path = storage_dir.join(&filename);
        log::debug!("[get_model_path] 检查默认路径: {}", default_path.display());
        if default_path.exists() {
            log::info!("[get_model_path] ✓ 在默认目录找到模型: {}", default_path.display());
            return Ok(default_path);
        }

        // 再检查自定义目录
        log::debug!("[get_model_path] 默认目录未找到，检查自定义目录...");
        if let Some(custom_path) = find_in_custom_dirs(&filename, true) {
            log::info!("[get_model_path] ✓ 在自定义目录找到模型: {}", custom_path.display());
            return Ok(custom_path);
        }

        // 都没找到，返回默认路径（后续检查存在性时会失败）
        log::warn!("[get_model_path] 未找到模型文件: {}, 返回默认路径（不存在）", filename);
        Ok(default_path)
    } else if is_onnx {
        // ONNX models (SenseVoice/Parakeet/Moonshine) use directory structure
        // transcribe-rs expects: directory/model.int8.onnx + tokens.txt

        // Return directory path for ONNX models
        // e.g., sensevoice-small/ or parakeet-unified-en-0.6b-F16/

        // 先检查默认目录
        let default_path = storage_dir.join(model_id);
        log::debug!("[get_model_path] 检查ONNX默认目录: {}", default_path.display());
        if default_path.exists() {
            log::info!("[get_model_path] ✓ 在默认目录找到ONNX模型目录: {}", default_path.display());
            return Ok(default_path);
        }

        // 再检查自定义目录（目录类型）
        log::debug!("[get_model_path] 默认目录未找到，检查自定义目录...");
        if let Some(custom_path) = find_in_custom_dirs(model_id, false) {
            log::info!("[get_model_path] ✓ 在自定义目录找到ONNX模型目录: {}", custom_path.display());
            return Ok(custom_path);
        }

        // 都没找到，返回默认路径
        log::warn!("[get_model_path] 未找到ONNX模型目录: {}, 返回默认路径（不存在）", model_id);
        Ok(default_path)
    } else {
        // Fallback for unknown model types
        let extension = match backend {
            "transcribe_cpp" => "gguf",
            _ => "gguf",
        };

        let filename = if model_id.contains('.') {
            log::debug!("[get_model_path] 模型ID包含点号，直接使用: {}", model_id);
            model_id.to_string()
        } else {
            format!("{}.{}", model_id, extension)
        };

        log::debug!("[get_model_path] GGUF文件名: {}", filename);

        // 先检查默认目录
        let default_path = storage_dir.join(&filename);
        log::debug!("[get_model_path] 检查默认路径: {}", default_path.display());
        if default_path.exists() {
            log::info!("[get_model_path] ✓ 在默认目录找到GGUF文件: {}", default_path.display());
            return Ok(default_path);
        }

        // 再检查自定义目录
        log::debug!("[get_model_path] 默认目录未找到，检查自定义目录...");
        if let Some(custom_path) = find_in_custom_dirs(&filename, true) {
            log::info!("[get_model_path] ✓ 在自定义目录找到GGUF文件: {}", custom_path.display());
            return Ok(custom_path);
        }

        log::warn!("[get_model_path] 未找到GGUF文件: {}, 返回默认路径（不存在）", filename);
        Ok(default_path)
    }
}

/// 在用户自定义目录中查找模型
/// file_name: 模型文件名或目录名
/// is_file: true 查找文件，false 查找目录
fn find_in_custom_dirs(file_name: &str, is_file: bool) -> Option<PathBuf> {
    let custom_dirs = match load_config() {
        Ok(config) => config.custom_asr_model_dirs,
        Err(e) => {
            log::warn!("[find_in_custom_dirs] 加载配置失败: {}", e);
            return None;
        }
    };

    log::debug!("[find_in_custom_dirs] 自定义目录列表: {:?}", custom_dirs);
    log::debug!("[find_in_custom_dirs] 查找: file_name={}, is_file={}", file_name, is_file);

    for custom_dir_path in custom_dirs {
        let custom_path = Path::new(&custom_dir_path);
        let model_path = custom_path.join(file_name);

        log::debug!("[find_in_custom_dirs] 检查路径: {}", model_path.display());

        if is_file {
            if model_path.is_file() {
                log::info!("[find_in_custom_dirs] ✓ 找到文件: {}", model_path.display());
                return Some(model_path);
            } else {
                log::debug!("[find_in_custom_dirs] 不是文件或不存在: {}", model_path.display());
            }
        } else {
            if model_path.is_dir() {
                log::info!("[find_in_custom_dirs] ✓ 找到目录: {}", model_path.display());
                return Some(model_path);
            } else {
                log::debug!("[find_in_custom_dirs] 不是目录或不存在: {}", model_path.display());
            }
        }
    }

    log::warn!("[find_in_custom_dirs] 所有自定义目录中均未找到: {}", file_name);
    None
}

/// Check if model file exists
/// For ONNX models, checks if directory exists with model files
/// For GGUF models (TranscribeCpp backend), checks if file exists
pub fn model_exists(model_id: &str, backend: &str) -> bool {
    check_model_available(model_id, Some(backend))
}

/// Unified model availability check
///
/// Uses the scanner as the single source of truth, following design principles:
/// - GGUF models: uses scan_available_asr_models() (already selects highest precision version)
/// - ONNX models: checks if directory exists (not using scanner, as scanner may miss newly downloaded)
/// - LLM models: directly checks file
///
/// # Performance optimization
/// - ASR scanner has internal caching mechanism (scan_available_asr_models)
/// - Avoids duplicate filesystem access
pub fn check_model_available(model_id: &str, backend: Option<&str>) -> bool {
    // LLM models: directly check file
    if is_llm_model(model_id) {
        return llm_model_exists(model_id);
    }

    // Determine backend type
    let backend_type = backend
        .map(|b| b.to_string())
        .unwrap_or_else(|| get_model_backend_str(model_id));

    // ONNX models: check directory existence (not using scanner, as scanner may miss newly downloaded)
    if backend_type == "onnx" {
        if let Ok(path) = get_model_path(model_id, &backend_type) {
            return path.is_dir() && has_onnx_model_files(&path, model_id);
        }
        return false;
    }

    // GGUF models: use scanner (already selected highest precision version, supports multi-quantization)
    let scanned = scan_available_asr_models();
    scanned.iter().any(|p| p.id == model_id)
}

/// Helper: Get backend type as string
fn get_model_backend_str(model_id: &str) -> String {
    match get_model_backend(model_id) {
        crate::backends::BackendType::TranscribeCpp => "transcribe_cpp".to_string(),
        crate::backends::BackendType::Onnx => "onnx".to_string(),
    }
}

/// Helper: Check if ONNX model directory contains necessary model files
fn has_onnx_model_files(path: &Path, model_id: &str) -> bool {
    if model_id.contains("moonshine") {
        // Moonshine: encoder_model.onnx or encoder.ort
        path.join("encoder_model.onnx").exists() || path.join("encoder.ort").exists()
    } else if model_id.contains("parakeet") {
        // Parakeet: encoder-model.int8.onnx
        path.join("encoder-model.int8.onnx").exists()
    } else {
        // SenseVoice: model.int8.onnx
        path.join("model.int8.onnx").exists()
    }
}

/// Get the storage directory for LLM models
pub fn get_llm_model_storage_dir() -> Result<PathBuf, String> {
    llm_models_dir()
}

/// Get the file path for an LLM model by preset ID
pub fn get_llm_model_path(preset_id: &str) -> Result<PathBuf, String> {
    let storage_dir = get_llm_model_storage_dir()?;
    Ok(storage_dir.join(format!("{}.gguf", preset_id)))
}

/// Check if an LLM model has been downloaded
pub fn llm_model_exists(preset_id: &str) -> bool {
    get_llm_model_path(preset_id)
        .map(|p| p.exists())
        .unwrap_or(false)
}

/// Select the best download source from a list
/// Priority: 1. Use preferred source if specified
///           2. Filter by China accessibility preference
///              - prefer_china = true: prefer is_china_accessible = true sources
///              - prefer_china = false: prefer is_china_accessible = false sources
///           3. Sort by priority (lower = higher priority)
pub fn select_best_source(
    sources: &[DownloadSourceInfo],
    preferred_source: Option<&str>,
    prefer_china: bool,
) -> Option<DownloadSourceInfo> {
    if sources.is_empty() {
        return None;
    }

    // If preferred source is specified, try that first
    if let Some(preferred) = preferred_source {
        if let Some(source) = sources
            .iter()
            .find(|s| s.name.eq_ignore_ascii_case(preferred))
        {
            return Some(source.clone());
        }
    }

    // First try to find sources matching the china preference
    let preferred_sources: Vec<_> = sources
        .iter()
        .filter(|s| s.is_china_accessible == prefer_china)
        .cloned()
        .collect();

    // If we have sources matching the preference, use them
    // Otherwise, fall back to all sources
    let candidates = if !preferred_sources.is_empty() {
        preferred_sources
    } else {
        sources.iter().cloned().collect()
    };

    // Sort by priority and return the best one (lower priority value = higher priority)
    candidates.into_iter().min_by_key(|s| s.priority)
}

/// Download a file from the given URL with progress reporting and retry logic
///
/// # Arguments
/// * `cancel_signal` - Optional cancel signal, when set to true the download will be aborted
pub async fn download_with_retry(
    app: &AppHandle,
    model_id: &str,
    url: &str,
    _expected_size: Option<u64>,
    max_retries: u32,
    source_name: Option<&str>,
    cancel_signal: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
) -> Result<PathBuf, String> {
    let _client = reqwest::Client::new();
    let mut last_error = String::new();

    for attempt in 1..=max_retries {
        // Check cancellation before each attempt
        if let Some(ref signal) = cancel_signal {
            if signal.load(std::sync::atomic::Ordering::Acquire) {
                log::info!("[Download] Download cancelled for model {}", model_id);
                return Err(format!("Download cancelled by user: {}", model_id));
            }
        }

        log::info!(
            "Download attempt {} for model {} from {}",
            attempt,
            model_id,
            url
        );

        match download_single_attempt(app, model_id, url, _expected_size, source_name, cancel_signal.clone()).await {
            Ok(path) => return Ok(path),
            Err(e) => {
                // Check if cancelled
                if e.contains("cancelled by user") {
                    return Err(e);
                }

                last_error = e;
                log::warn!(
                    "Download attempt {} failed for model {}: {}",
                    attempt,
                    model_id,
                    last_error
                );

                // Wait before retrying (exponential backoff)
                if attempt < max_retries {
                    let delay_secs = DEFAULT_RETRY_DELAY_SECS * attempt as u64;
                    log::info!("Retrying in {} seconds...", delay_secs);
                    tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                }
            }
        }
    }

    Err(format!(
        "Failed to download model {} after {} attempts: {}",
        model_id, max_retries, last_error
    ))
}

/// Download in a single attempt (without retry)
///
/// # Arguments
/// * `cancel_signal` - Optional cancel signal for aborting the download
async fn download_single_attempt(
    app: &AppHandle,
    model_id: &str,
    url: &str,
    _expected_size: Option<u64>,
    source_name: Option<&str>,
    cancel_signal: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
) -> Result<PathBuf, String> {
    // Build client with:
    // 1. Short connect timeout (10s) for quick failure on unreachable hosts
    // 2. Long read timeout (5min) for slow connections (e.g., HuggingFace from China)
    // 3. Automatic redirect following
    // 4. System proxy support (reads HTTP_PROXY/HTTPS_PROXY env vars)
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .read_timeout(std::time::Duration::from_secs(300)) // 5 min read timeout for slow CDN
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Build request with browser-like headers (ModelScope requires User-Agent)
    let request = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header("Accept", "*/*")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Accept-Encoding", "identity"); // Request uncompressed response

    // Get response to determine total size
    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    log::info!(
        "Downloading model {} ({} bytes) from {}",
        model_id,
        total_size,
        url
    );

    // Determine storage path based on model type
    // LLM models go to llm_models directory, ASR models go to models directory
    let is_llm = is_llm_model(model_id);

    let model_path = if is_llm {
        // LLM model → llm_models directory
        get_llm_model_path(model_id)?
    } else {
        // ASR model: 使用统一辅助函数获取正确的保存路径
        get_model_path_from_preset(model_id)?
    };

    // Create parent directories if needed
    if let Some(parent) = model_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let temp_path = model_path.with_extension("tmp");
    let mut file =
        std::fs::File::create(&temp_path).map_err(|e| format!("Failed to create file: {}", e))?;

    let mut downloaded: u64 = 0;
    let start_time = std::time::Instant::now();
    let mut stream = response.bytes_stream();
    let last_progress = std::sync::atomic::AtomicU8::new(0);

    while let Some(chunk) = stream.next().await {
        // Check cancellation in download loop
        if let Some(ref signal) = cancel_signal {
            if signal.load(std::sync::atomic::Ordering::Acquire) {
                log::info!("[Download] Download cancelled, cleaning up temp file for {}", model_id);
                drop(file);
                let _ = std::fs::remove_file(&temp_path);

                // Emit cancel event
                let _ = app.emit(
                    "download-cancelled",
                    &serde_json::json!({
                        "modelId": model_id,
                        "downloaded": downloaded
                    }),
                );

                return Err(format!("Download cancelled by user: {}", model_id));
            }
        }

        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;

        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;

        let percentage = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u8
        } else {
            0
        };

        let elapsed = start_time.elapsed().as_secs_f64();
        let speed = if elapsed > 0.0 {
            downloaded as f64 / elapsed
        } else {
            0.0
        };

        // Only emit progress events at significant intervals (every 5%)
        let last = last_progress.load(std::sync::atomic::Ordering::Relaxed);
        if percentage >= last + 5 || percentage == 100 {
            last_progress.store(percentage, std::sync::atomic::Ordering::Relaxed);

            let progress = DownloadProgress {
                model_id: model_id.to_string(),
                downloaded,
                total: total_size,
                percentage,
                speed,
                source: source_name.map(|s| s.to_string()),
            };

            if let Err(e) = app.emit("download-progress", &progress) {
                log::error!("Failed to emit progress event: {}", e);
            }
        }
    }

    drop(file);

    // Validate downloaded file - check if it's a valid model file (not HTML page or empty)
    // Minimum size threshold: 1KB (files smaller than this are likely HTML pages or error responses)
    const MIN_VALID_FILE_SIZE: u64 = 1024; // 1KB

    let file_size = std::fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);

    if file_size < MIN_VALID_FILE_SIZE {
        // Clean up temp file
        let _ = std::fs::remove_file(&temp_path);
        log::error!(
            "Downloaded file too small ({} bytes) for model {} - likely an HTML page or error response from URL: {}",
            file_size,
            model_id,
            url
        );
        return Err(format!(
            "Downloaded file is too small ({} bytes). This may be an HTML page instead of the actual model file. Please check the download URL.",
            file_size
        ));
    }

    // Additional check: verify file is not HTML by checking first few bytes
    let first_bytes: Option<[u8; 16]> = std::fs::File::open(&temp_path).ok().and_then(|f| {
        use std::io::Read;
        let mut buf = [0u8; 16];
        let mut f = f;
        f.read(&mut buf).ok().map(|_| buf)
    });

    if let Some(bytes) = first_bytes {
        // Check for HTML signatures: <!DOCTYPE, <html, <head
        let header = String::from_utf8_lossy(&bytes).to_lowercase();
        if header.contains("<!doctype") || header.contains("<html") || header.contains("<head") {
            // Clean up temp file
            let _ = std::fs::remove_file(&temp_path);
            log::error!(
                "Downloaded file appears to be HTML (starts with '{}') for model {} from URL: {}",
                header.trim(),
                model_id,
                url
            );
            return Err(format!(
                "Downloaded file appears to be an HTML page, not a model file. Please check if the download URL is correct: {}",
                url
            ));
        }
    }

    // Check if this is a zip file that needs extraction
    let is_zip = url.to_lowercase().ends_with(".zip");
    let final_path = if is_zip {
        // For zip files, extract to the model directory (e.g., models/sensevoice-small/)
        // model_path is already the target directory for ONNX models
        let extract_dir = model_path.clone();

        log::info!("Extracting zip file {:?} to {:?}", temp_path, extract_dir);

        match extract_zip(&temp_path, &extract_dir) {
            Ok(_) => {
                // Delete the zip file after successful extraction
                if let Err(e) = std::fs::remove_file(&temp_path) {
                    log::warn!("Failed to delete zip file: {}", e);
                }
                log::info!("Zip file extracted successfully to {:?}", extract_dir);
                extract_dir
            }
            Err(e) => {
                // Clean up temp file on error
                let _ = std::fs::remove_file(&temp_path);
                return Err(format!("Failed to extract zip file: {}", e));
            }
        }
    } else {
        // Rename temp file to final path for non-zip files
        std::fs::rename(&temp_path, &model_path)
            .map_err(|e| format!("Failed to save file: {}", e))?;
        model_path
    };

    log::info!(
        "Model {} downloaded successfully to {:?}",
        model_id,
        final_path
    );

    // Emit download complete event
    let _ = app.emit(
        "download-complete",
        &serde_json::json!({
            "modelId": model_id,
            "path": final_path.to_string_lossy().to_string()
        }),
    );

    Ok(final_path)
}

/// Download model with automatic source selection
/// This is the main entry point for downloading models with full feature support
#[tauri::command]
pub async fn download_model_with_source(
    app: AppHandle,
    services: tauri::State<'_, AppServices>,
    model_id: String,
    sources: Vec<DownloadSourceInfo>,
    preferred_source: Option<String>,
    prefer_china: Option<bool>,
) -> Result<DownloadResult, String> {
    log::info!(
        "Starting download for model {} with {} sources, prefer_china: {:?}",
        model_id,
        sources.len(),
        prefer_china
    );

    // Debug: 检查 is_llm_model 的返回值
    let is_llm = is_llm_model(&model_id);
    log::info!(
        "[DEBUG] is_llm_model('{}') = {}",
        model_id,
        is_llm
    );

    // Check if model already exists
    // Use unified detection from preset table
    let backend = match get_model_backend(&model_id) {
        crate::backends::BackendType::TranscribeCpp => "transcribe_cpp",
        crate::backends::BackendType::Onnx => "onnx",
    };

    if check_model_available(&model_id, Some(backend)) {
        let path = get_model_path_from_preset(&model_id)?;
        // Debug: 检查 is_llm_model 的返回值
        let is_llm = is_llm_model(&model_id);
        log::info!(
            "[DEBUG] is_llm_model('{}') = {}, backend = '{}'",
            model_id,
            is_llm,
            backend
        );
        // 如果是 ASR 模型，使缓存失效以确保前端获取最新状态
        if !is_llm {
            if let Ok(cache) = services.asr_models_cache.lock() {
                cache.invalidate();
                log::info!("[ASR] Cache invalidated for existing model: {}", model_id);
            }
        }
        return Ok(DownloadResult {
            success: true,
            model_id,
            path: Some(path.to_string_lossy().to_string()),
            error: None,
            source: None,
        });
    }

    // Register download for cancellation support
    let cancel_signal = services.download_cancel_manager.register_download(&model_id);

    // Select best source
    let prefer_china_flag = prefer_china.unwrap_or(false);
    log::info!(
        "Selecting source with prefer_china_flag: {}, sources: {:?}",
        prefer_china_flag,
        sources
            .iter()
            .map(|s| (&s.name, s.is_china_accessible, s.priority))
            .collect::<Vec<_>>()
    );

    // Sort sources: preferred china sources first (by priority), then others
    let mut sources_to_try: Vec<DownloadSourceInfo> = Vec::new();

    // First, add sources matching china preference
    let mut preferred: Vec<_> = sources
        .iter()
        .filter(|s| s.is_china_accessible == prefer_china_flag)
        .cloned()
        .collect();
    preferred.sort_by_key(|s| s.priority);
    sources_to_try.extend(preferred);

    // Then, add other sources as fallback
    let mut fallback: Vec<_> = sources
        .iter()
        .filter(|s| s.is_china_accessible != prefer_china_flag)
        .cloned()
        .collect();
    fallback.sort_by_key(|s| s.priority);
    sources_to_try.extend(fallback);

    // Try each source in order
    let mut last_error = String::new();
    let mut cancelled = false;

    for source in sources_to_try {
        // Check cancellation before each source
        if cancel_signal.load(std::sync::atomic::Ordering::Acquire) {
            cancelled = true;
            break;
        }

        log::info!(
            "Trying source '{}' for model {}: {}",
            source.name,
            model_id,
            source.url
        );

        match download_with_retry(
            &app,
            &model_id,
            &source.url,
            None,
            2, // Only 2 retries per source to try more sources
            Some(&source.name),
            Some(cancel_signal.clone()),
        )
        .await
        {
            Ok(path) => {
                let path_str = path.to_string_lossy().to_string();
                log::info!(
                    "Download successful from source '{}' for model {}",
                    source.name,
                    model_id
                );
                // Clean up registration
                services.download_cancel_manager.finish_download(&model_id);
                // 如果是 ASR 模型，使缓存失效以确保前端获取最新状态
                if !is_llm_model(&model_id) {
                    if let Ok(cache) = services.asr_models_cache.lock() {
                        cache.invalidate();
                        log::info!("[ASR] Cache invalidated for downloaded model: {}", model_id);
                    }
                }
                return Ok(DownloadResult {
                    success: true,
                    model_id,
                    path: Some(path_str),
                    error: None,
                    source: Some(source.name.clone()),
                });
            }
            Err(e) => {
                // Check if cancelled
                if e.contains("cancelled by user") {
                    cancelled = true;
                    last_error = e;
                    break;
                }

                log::warn!(
                    "Source '{}' failed for model {}: {}",
                    source.name,
                    model_id,
                    e
                );
                last_error = e;
            }
        }
    }

    // Clean up registration
    services.download_cancel_manager.finish_download(&model_id);

    // Handle cancellation
    if cancelled {
        log::info!("Download cancelled for model {}", model_id);
        return Ok(DownloadResult {
            success: false,
            model_id,
            path: None,
            error: Some("Download cancelled by user".to_string()),
            source: None,
        });
    }

    // All sources failed
    log::error!("All sources failed for model {}: {}", model_id, last_error);

    // Emit download error event so frontend can handle it
    let _ = app.emit(
        "download-error",
        &serde_json::json!({
            "modelId": model_id,
            "error": last_error
        }),
    );

    Ok(DownloadResult {
        success: false,
        model_id,
        path: None,
        error: Some(last_error),
        source: None,
    })
}

/// Download model from a direct URL (simpler interface for single URL)
#[tauri::command]
pub async fn download_model_from_url(
    app: AppHandle,
    services: tauri::State<'_, AppServices>,
    model_id: String,
    url: String,
    backend: Option<String>,
) -> Result<DownloadResult, String> {
    log::info!(
        "Starting direct download for model {} from {}",
        model_id,
        url
    );

    // Check if model already exists
    // Use unified detection from preset table
    let backend_type = backend.unwrap_or_else(|| {
        match get_model_backend(&model_id) {
            crate::backends::BackendType::TranscribeCpp => "transcribe_cpp".to_string(),
            crate::backends::BackendType::Onnx => "onnx".to_string(),
        }
    });

    if check_model_available(&model_id, Some(&backend_type)) {
        let path = get_model_path_from_preset(&model_id)?;
        return Ok(DownloadResult {
            success: true,
            model_id,
            path: Some(path.to_string_lossy().to_string()),
            error: None,
            source: Some("local".to_string()),
        });
    }

    // Register download for cancellation support
    let cancel_signal = services.download_cancel_manager.register_download(&model_id);

    // Download with retry
    match download_with_retry(
        &app,
        &model_id,
        &url,
        None,
        MAX_RETRY_ATTEMPTS,
        None,
        Some(cancel_signal.clone()),
    )
    .await
    {
        Ok(path) => {
            services.download_cancel_manager.finish_download(&model_id);
            Ok(DownloadResult {
                success: true,
                model_id,
                path: Some(path.to_string_lossy().to_string()),
                error: None,
                source: Some("direct".to_string()),
            })
        }
        Err(e) => {
            services.download_cancel_manager.finish_download(&model_id);

            // Check if cancelled
            let cancelled = e.contains("cancelled by user");

            // Emit download error/cancelled event
            if cancelled {
                let _ = app.emit(
                    "download-cancelled",
                    &serde_json::json!({
                        "modelId": model_id,
                        "downloaded": 0
                    }),
                );
            } else {
                let _ = app.emit(
                    "download-error",
                    &serde_json::json!({
                        "modelId": model_id,
                        "error": e
                    }),
                );
            }

            Ok(DownloadResult {
                success: false,
                model_id,
                path: None,
                error: Some(e),
                source: Some("direct".to_string()),
            })
        }
    }
}

/// Get the storage path for a model
#[tauri::command]
pub fn get_model_storage_path_cmd(
    model_id: String,
    backend: Option<String>,
) -> Result<String, String> {
    let backend_type = backend.unwrap_or_else(|| {
        match get_model_backend(&model_id) {
            crate::backends::BackendType::TranscribeCpp => "transcribe_cpp".to_string(),
            crate::backends::BackendType::Onnx => "onnx".to_string(),
        }
    });

    let path = get_model_path_from_preset(&model_id)?;
    Ok(path.to_string_lossy().to_string())
}

/// Check if a model file exists
/// Automatically detects backend type based on preset definitions (exact match first)
#[tauri::command]
pub fn check_model_exists_cmd(model_id: String, backend: Option<String>) -> bool {
    check_model_available(&model_id, backend.as_deref())
}

/// Cancel an ongoing model download
///
/// Returns true if the download was found and cancelled, false if no download was found
#[tauri::command]
pub fn cancel_model_download(
    services: tauri::State<'_, crate::config::AppServices>,
    model_id: String,
) -> Result<bool, String> {
    log::info!("[CancelDownload] Request to cancel download for model: {}", model_id);
    Ok(services.download_cancel_manager.cancel_download(&model_id))
}

/// Get list of models currently being downloaded
#[tauri::command]
pub fn get_downloading_model_ids(
    services: tauri::State<'_, crate::config::AppServices>,
) -> Result<Vec<String>, String> {
    Ok(services.download_cancel_manager.get_downloading_models())
}
