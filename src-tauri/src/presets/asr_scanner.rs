//! ASR Model Scanner
//!
//! Scans the model storage directory for available ASR models.
//! Supports two backend types:
//! - ONNX: directories containing `.onnx` or `.ort` files
//! - TranscribeCpp: `.gguf` and `.bin` files (GGUF/GGML format for Whisper, Qwen3-ASR, etc.)
//!
//! 支持多目录扫描：
//! 1. 默认的 models 目录（通过 `get_model_storage_dir()` 获取）
//! 2. 用户自定义的目录列表（从 AppConfig 的 `custom_asr_model_dirs` 字段获取）
//!
//! # 多量化版本处理（重构后）
//!
//! 当目录中存在同一模型的多个量化版本时：
//! - 按基础 ID 分组
//! - 选择最高精度版本
//! - 不识别的文件名直接跳过
//!
//! # Language Information Source (重构后)
//!
//! **GGUF Header 是能力的唯一真实来源**：
//! - 所有模型统一从 GGUF Header 读取能力（包括语言列表）
//! - 预设文件仅用于 Catalog UI 展示（下载信息、展示名称、描述）
//! - GGUF 缺失能力时，使用预设文件的值作为 fallback
//! - 预设也不存在时，使用默认值 ['zh', 'en']
//!
//! 这样实现零配置自动发现，未知模型也能正常使用。

use crate::backends::{probe_gguf_capabilities, BackendType};
use crate::config::load_config;
use crate::presets::{get_asr_presets, get_base_model_id, ModelPreset};
use crate::utils::downloader::get_model_storage_dir;
use crate::utils::{extract_quant_from_filename, quant_priority};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

// 导入架构默认值函数
use crate::backends::gguf_capabilities::{
    get_default_lang_detect, get_default_streaming, get_default_translation,
};

/// Scan available ASR models from the storage directory
///
/// Returns a list of ModelPreset for all discovered models.
/// For models matching hardcoded presets, uses preset configuration.
/// For unknown models, generates default configuration.
///
/// 扫描顺序：
/// 1. 默认的 models 目录（优先级最高）
/// 2. 用户自定义的目录列表
///
/// 去重逻辑：如果同名模型在多个目录中存在，优先使用默认目录的。
pub fn scan_available_asr_models() -> Vec<ModelPreset> {
    // 获取用户自定义目录列表
    let custom_dirs: Vec<String> = match load_config() {
        Ok(config) => config.custom_asr_model_dirs,
        Err(e) => {
            log::warn!("无法加载配置文件获取自定义模型目录: {}", e);
            Vec::new()
        }
    };

    // 获取默认目录
    let default_dir = match get_model_storage_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::warn!("无法获取 ASR 模型存储目录: {}", e);
            return Vec::new();
        }
    };

    // 用于去重和版本比较的集合（记录已扫描的模型 ID）
    let mut seen_ids: HashSet<String> = HashSet::new();
    let mut models: Vec<ModelPreset> = Vec::new();

    // 扫描默认目录（优先级最高）
    log::info!("扫描默认 ASR 模型目录: {:?}", default_dir);
    let default_models = scan_single_directory(&default_dir);
    for model in default_models {
        seen_ids.insert(model.id.clone());
        models.push(model);
    }
    log::info!("默认目录扫描到 {} 个模型", models.len());

    // 扫描用户自定义目录
    for custom_dir_path in &custom_dirs {
        let custom_path = Path::new(custom_dir_path);

        // 检查目录是否存在
        if !custom_path.exists() {
            log::warn!("自定义 ASR 模型目录不存在: {:?}", custom_dir_path);
            continue;
        }

        if !custom_path.is_dir() {
            log::warn!("自定义 ASR 模型路径不是目录: {:?}", custom_dir_path);
            continue;
        }

        // 跳过与默认目录相同的路径
        if custom_path == default_dir {
            log::debug!("自定义目录与默认目录相同，跳过: {:?}", custom_dir_path);
            continue;
        }

        log::info!("扫描自定义 ASR 模型目录: {:?}", custom_dir_path);
        let custom_models = scan_single_directory(custom_path);

        // 处理自定义目录中的模型（新模型添加，已存在的比较量化版本）
        let mut added_count = 0;
        for custom_model in custom_models {
            if !seen_ids.contains(&custom_model.id) {
                // 新模型，直接添加
                seen_ids.insert(custom_model.id.clone());
                models.push(custom_model);
                added_count += 1;
            } else {
                // 已存在，比较量化版本，选择更高的
                if let Some(existing) = models.iter_mut().find(|m| m.id == custom_model.id) {
                    let should_replace = match (&custom_model.quant, &existing.quant) {
                        (Some(custom_quant), Some(existing_quant)) => {
                            quant_priority(custom_quant) > quant_priority(existing_quant)
                        }
                        _ => false,
                    };
                    if should_replace {
                        log::info!(
                            "[Scanner] 替换为更高精度版本: {} ({} > {})",
                            custom_model.id,
                            custom_model.quant.as_ref().unwrap(),
                            existing.quant.as_ref().unwrap()
                        );
                        *existing = custom_model;
                    } else {
                        log::debug!(
                            "[Scanner] 保留现有版本: {} ({} >= {})",
                            custom_model.id,
                            existing.quant.as_ref().unwrap_or(&"N/A".to_string()),
                            custom_model.quant.as_ref().unwrap_or(&"N/A".to_string())
                        );
                    }
                }
            }
        }
        log::info!(
            "自定义目录 {:?} 扫描到 {} 个新模型",
            custom_dir_path,
            added_count
        );
    }

    log::info!("总共扫描到 {} 个 ASR 模型", models.len());
    models
}

/// Scan a single directory for ASR models
///
/// Internal helper function that scans one directory and returns found models.
/// Recursively scans subdirectories up to max_depth levels.
///
/// **多量化版本处理**：按基础 ID 分组，选择最高精度版本
fn scan_single_directory(storage_dir: &Path) -> Vec<ModelPreset> {
    // 第一阶段：扫描所有模型
    let all_models = scan_single_directory_recursive(storage_dir, 0, 2);

    // 第二阶段：按基础 ID 分组，选择最高精度版本
    let mut grouped: HashMap<String, ModelPreset> = HashMap::new();

    for model in all_models {
        let base_id = get_base_model_id(&model.id);

        // 如果已存在，比较量化版本优先级
        if let Some(existing) = grouped.get_mut(&base_id) {
            // 只有 GGUF 模型才比较量化版本
            let should_replace = match (&model.quant, &existing.quant) {
                (Some(model_quant), Some(existing_quant)) => {
                    quant_priority(model_quant) > quant_priority(existing_quant)
                }
                _ => false,
            };

            if should_replace {
                log::debug!(
                    "[Scanner] 替换为更高精度版本: {} ({} > {})",
                    base_id,
                    model.quant.as_ref().unwrap(),
                    existing.quant.as_ref().unwrap()
                );
                *existing = model; // 替换为更高精度版本
            }
        } else {
            grouped.insert(base_id, model);
        }
    }

    grouped.into_values().collect()
}

/// Recursive helper function for scanning directories
///
/// # Arguments
/// * `dir` - Directory to scan
/// * `current_depth` - Current recursion depth (0 = top level)
/// * `max_depth` - Maximum recursion depth (e.g., 2 = scan up to 2 levels deep)
fn scan_single_directory_recursive(
    dir: &Path,
    current_depth: u32,
    max_depth: u32,
) -> Vec<ModelPreset> {
    if !dir.exists() {
        log::info!("ASR 模型目录不存在: {:?}", dir);
        return Vec::new();
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            log::warn!("无法读取 ASR 模型目录 {:?}: {}", dir, e);
            return Vec::new();
        }
    };

    // Get hardcoded presets for matching
    let presets = get_asr_presets();

    let mut models: Vec<ModelPreset> = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();

        // Check for GGUF/GGML files (TranscribeCpp backend)
        // GGUF: newer format (.gguf extension)
        // GGML: legacy format (.bin extension, e.g., whisper-turbo.bin)
        if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str());
            if ext == Some("gguf") || ext == Some("bin") {
                if let Some(preset) = scan_gguf_model(&path, &presets) {
                    models.push(preset);
                }
            }
        }

        // Check for directories
        if path.is_dir() {
            // Check for ONNX model directory (contains .onnx files)
            if is_onnx_model_directory(&path) {
                if let Some(preset) = scan_onnx_model(&path, &presets) {
                    models.push(preset);
                }
            }

            // Recursively scan subdirectories if not at max depth
            // ONNX 模型目录不递归进入（已经是模型目录）
            // 但普通目录需要递归查找 GGUF 文件
            if current_depth < max_depth && !is_onnx_model_directory(&path) {
                let sub_models =
                    scan_single_directory_recursive(&path, current_depth + 1, max_depth);
                models.extend(sub_models);
            }
        }
    }

    models
}

/// Check if a directory contains ONNX model files
fn is_onnx_model_directory(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }

    // Look for .onnx or .ort files
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let entry_path = entry.path();
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                if ext == "onnx" || ext == "ort" {
                    return true;
                }
            }
        }
    }

    false
}

/// Get model ID from path (filename or directory name without extension)
fn get_model_id_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Get file/directory size in MB
fn get_size_mb(path: &Path) -> Option<u64> {
    if path.is_file() {
        fs::metadata(path).ok().map(|m| m.len() / (1024 * 1024))
    } else if path.is_dir() {
        // For directories, calculate total size
        let mut total = 0;
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.path().is_file() {
                    if let Ok(meta) = fs::metadata(entry.path()) {
                        total += meta.len();
                    }
                }
            }
        }
        Some(total / (1024 * 1024))
    } else {
        None
    }
}

/// Scan an ONNX model directory and create a preset
fn scan_onnx_model(path: &Path, presets: &[ModelPreset]) -> Option<ModelPreset> {
    let id = get_model_id_from_path(path);

    // Try to match against preset:
    // 1. First try exact ID match (case-insensitive)
    // 2. If no exact match, try base name match (for quantization variants)
    let (preset, matched_by_base_name) = presets
        .iter()
        .find(|p| p.id.to_lowercase() == id.to_lowercase() && p.backend == Some(BackendType::Onnx))
        .map(|p| (Some(p), false))
        .unwrap_or_else(|| {
            // Try base name match (case-insensitive)
            let base_id = get_base_model_id(&id);
            presets
                .iter()
                .find(|p| {
                    p.backend == Some(BackendType::Onnx) && get_base_model_id(&p.id) == base_id
                })
                .map(|p| (Some(p), true))
                .unwrap_or((None, false))
        });

    let size_mb = get_size_mb(path);

    // 记录扫描到的实际路径
    let model_path = path.to_string_lossy().to_string();

    if let Some(p) = preset {
        // 使用实际文件的 ID，继承预设的语言列表
        let display_name = if matched_by_base_name {
            id.clone()
        } else {
            p.name.clone()
        };

        Some(ModelPreset::asr_preset_with_path(
            id.clone(), // 使用文件 ID，避免去重冲突
            display_name,
            size_mb
                .map(|s| format!("{}MB", s))
                .unwrap_or_else(|| p.size.clone()),
            BackendType::Onnx,
            p.download_urls.clone(),
            p.languages.clone(),
            p.description.clone(),
            p.supports_auto_detect,
            p.supports_streaming,
            p.supports_translation,
            p.accuracy_score, // 继承预设的评分
            p.speed_score,    // 继承预设的评分
            Some(model_path),
        ))
    } else {
        // Generate default preset for unknown ONNX model
        Some(ModelPreset::asr_preset_with_path(
            id.clone(),
            id.clone(),
            size_mb
                .map(|s| format!("{}MB", s))
                .unwrap_or_else(|| "未知大小".to_string()),
            BackendType::Onnx,
            Vec::new(),
            vec!["zh".to_string(), "en".to_string()], // Default languages
            Some("用户自定义 ONNX 模型".to_string()),
            None, // Unknown supports_auto_detect
            None, // Unknown supports_streaming
            None, // Unknown supports_translation
            None, // Unknown accuracy_score
            None, // Unknown speed_score
            Some(model_path),
        ))
    }
}

/// Scan a GGUF/GGML model file and create a preset
///
/// GGUF (.gguf) and GGML (.bin) files are used by the TranscribeCpp backend.
/// Supports various ASR architectures: Whisper, Qwen3-ASR, Parakeet, Voxtral, etc.
///
/// **核心变更**：
/// 1. 统一使用 GGUF Header 的能力（包括语言列表）
/// 2. 只识别标准格式：<model-name>-<quant>.gguf
/// 3. 不识别的文件名直接跳过（返回 None）
/// 4. 设置 filename 和 quant 字段
fn scan_gguf_model(path: &Path, presets: &[ModelPreset]) -> Option<ModelPreset> {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    // 1. 提取量化版本（只支持标准格式）
    let quant = extract_quant_from_filename(filename)?;

    // 2. 提取基础 ID（移除量化后缀）
    let id = filename
        .strip_suffix(".gguf")
        .or_else(|| filename.strip_suffix(".bin"))?
        .to_string();

    let base_id = get_base_model_id(&id);

    // 3. Probe capabilities from GGUF file
    let caps = probe_gguf_capabilities(path);

    // 4. 匹配预设（按基础 ID 匹配，不区分大小写）
    let preset = presets
        .iter()
        .find(|p| {
            p.backend == Some(BackendType::TranscribeCpp)
                && get_base_model_id(&p.id) == base_id
        });

    let size_mb = get_size_mb(path);

    // 记录扫描到的实际路径
    let model_path = path.to_string_lossy().to_string();

    // 5. 使用基础 ID 作为展示名称（不带量化后缀）
    let name = preset.map(|p| p.name.clone()).unwrap_or_else(|| {
        // 如果没有找到预设，使用基础 ID 作为名称
        base_id.split('-').map(|s| {
            // 首字母大写，其余小写
            let mut chars = s.chars();
            match chars.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
            }
        }).collect::<Vec<_>>().join(" ")
    });

    // 6. 统一使用 GGUF Header 的能力，添加 fallback 逻辑
    let languages = caps.languages.clone().or_else(|| {
        // Fallback 1: GGUF 缺失语言信息，尝试使用预设
        log::warn!(
            "[Scanner] GGUF 缺少语言信息，尝试使用预设 fallback: {}",
            id
        );
        preset.and_then(|p| Some(p.languages.clone()))
    }).unwrap_or_else(|| {
        // Fallback 2: 预设也缺少语言信息，使用默认值
        log::warn!(
            "[Scanner] 预设也缺少语言信息，使用默认值: {}",
            id
        );
        vec!["zh".to_string(), "en".to_string()]
    });

    // 7. 能力字段使用三级 fallback：GGUF Header → 预设文件 → 硬编码默认值
    let supports_auto_detect = caps.supports_language_detect
        .or_else(|| preset.and_then(|p| p.supports_auto_detect))
        .or_else(|| {
            caps.architecture.as_ref().and_then(|arch| {
                let default = get_default_lang_detect(arch);
                if default.is_some() {
                    log::debug!(
                        "[Scanner] {} 使用架构默认值: lang_detect={:?}",
                        id,
                        default
                    );
                }
                default
            })
        });

    let supports_streaming = caps.supports_streaming
        .or_else(|| preset.and_then(|p| p.supports_streaming))
        .or_else(|| {
            caps.architecture.as_ref().and_then(|arch| {
                let default = get_default_streaming(arch);
                if default.is_some() {
                    log::debug!(
                        "[Scanner] {} 使用架构默认值: streaming={:?}",
                        id,
                        default
                    );
                }
                default
            })
        });

    let supports_translation = caps.supports_translation
        .or_else(|| preset.and_then(|p| p.supports_translation))
        .or_else(|| {
            caps.architecture.as_ref().and_then(|arch| {
                let default = get_default_translation(arch);
                if default.is_some() {
                    log::debug!(
                        "[Scanner] {} 使用架构默认值: translation={:?}",
                        id,
                        default
                    );
                }
                default
            })
        });

    // 记录能力信息
    log::info!(
        "[Scanner] 模型 {} 能力: languages={:?}, streaming={:?}, detect={:?}, translate={:?}",
        id,
        languages,
        supports_streaming,
        supports_auto_detect,
        supports_translation
    );

    // 8. 创建 preset（使用基础 ID 作为 ID，不带量化后缀）
    if let Some(p) = preset {
        Some(ModelPreset::asr_preset_with_filename(
            base_id.clone(), // 使用基础 ID（不带量化后缀）
            p.name.clone(),  // 使用预设名称
            size_mb
                .map(|s| format!("{}MB", s))
                .unwrap_or_else(|| p.size.clone()),
            BackendType::TranscribeCpp,
            p.download_urls.clone(),
            languages,
            p.description.clone(),
            supports_auto_detect,
            supports_streaming,
            supports_translation,
            p.accuracy_score,
            p.speed_score,
            Some(model_path),
            filename.to_string(),
            quant,
        ))
    } else {
        // Generate default preset for unknown GGUF model
        let description = if caps.architecture.is_some() {
            Some(format!(
                "{}GGUF 模型，{}",
                caps.display_name(),
                if caps.supports_streaming.unwrap_or(false) {
                    "支持流式转录"
                } else {
                    "批量转录"
                }
            ))
        } else {
            Some("用户自定义 GGUF 模型".to_string())
        };

        Some(ModelPreset::asr_preset_with_filename(
            base_id.clone(), // 使用基础 ID
            name,
            size_mb
                .map(|s| format!("{}MB", s))
                .unwrap_or_else(|| "未知大小".to_string()),
            BackendType::TranscribeCpp,
            Vec::new(),
            languages,
            description,
            supports_auto_detect,
            supports_streaming,
            supports_translation,
            None,
            None,
            Some(model_path),
            filename.to_string(),
            quant,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// Create a test ONNX model directory
    fn create_test_onnx_dir(dir: &Path, name: &str) -> PathBuf {
        let model_dir = dir.join(name);
        fs::create_dir_all(&model_dir).unwrap();
        // Create a dummy .onnx file
        let onnx_path = model_dir.join("model.int8.onnx");
        fs::File::create(&onnx_path).unwrap();
        model_dir
    }

    /// Create a test GGUF file
    fn create_test_gguf_file(dir: &Path, name: &str, size_bytes: u64) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).unwrap();
        if size_bytes > 0 {
            let content = vec![0u8; size_bytes as usize];
            use std::io::Write;
            file.write_all(&content).unwrap();
        }
        path
    }

    #[test]
    fn test_scan_empty_directory() {
        let temp_dir = TempDir::new().unwrap();
        let models = scan_available_asr_models_from_path(temp_dir.path());
        assert!(models.is_empty());
    }

    #[test]
    fn test_scan_known_onnx_model() {
        let temp_dir = TempDir::new().unwrap();

        // Create a sensevoice-small directory (matching preset)
        create_test_onnx_dir(temp_dir.path(), "sensevoice-small");

        let models = scan_available_asr_models_from_path(temp_dir.path());

        assert_eq!(models.len(), 1);
        let model = &models[0];
        assert_eq!(model.id, "sensevoice-small");
        assert_eq!(model.backend, Some(BackendType::Onnx));
        // Should have preset languages (zh, zh-yue, en, ja, ko)
        assert!(model.languages.contains(&"zh".to_string()));
        assert!(model.languages.contains(&"zh-yue".to_string()));
    }

    #[test]
    fn test_scan_unknown_onnx_model() {
        let temp_dir = TempDir::new().unwrap();

        // Create an unknown ONNX model directory
        create_test_onnx_dir(temp_dir.path(), "custom-onnx-model");

        let models = scan_available_asr_models_from_path(temp_dir.path());

        assert_eq!(models.len(), 1);
        let model = &models[0];
        assert_eq!(model.id, "custom-onnx-model");
        assert_eq!(model.backend, Some(BackendType::Onnx));
        assert!(model.description.as_ref().unwrap().contains("用户自定义"));
    }

    #[test]
    fn test_is_onnx_model_directory() {
        let temp_dir = TempDir::new().unwrap();

        // Create a directory with .onnx file
        let onnx_dir = temp_dir.path().join("onnx-model");
        fs::create_dir_all(&onnx_dir).unwrap();
        fs::File::create(onnx_dir.join("model.onnx")).unwrap();
        assert!(is_onnx_model_directory(&onnx_dir));

        // Create a directory with .ort file (ONNX Runtime format)
        let ort_dir = temp_dir.path().join("ort-model");
        fs::create_dir_all(&ort_dir).unwrap();
        fs::File::create(ort_dir.join("encoder.ort")).unwrap();
        assert!(is_onnx_model_directory(&ort_dir));

        // Create a directory without ONNX files
        let empty_dir = temp_dir.path().join("empty-dir");
        fs::create_dir_all(&empty_dir).unwrap();
        assert!(!is_onnx_model_directory(&empty_dir));
    }

    /// Helper function for tests to scan from a specific path
    fn scan_available_asr_models_from_path(storage_dir: &Path) -> Vec<ModelPreset> {
        scan_single_directory(storage_dir)
    }

    #[test]
    fn test_scan_qwen3_asr_gguf_model() {
        let temp_dir = TempDir::new().unwrap();

        // Create a Qwen3-ASR GGUF file
        create_test_gguf_file(
            temp_dir.path(),
            "qwen3-asr-0.6b-q4_0.gguf",
            600 * 1024 * 1024,
        );

        let models = scan_available_asr_models_from_path(temp_dir.path());

        assert_eq!(models.len(), 1);
        let model = &models[0];
        assert_eq!(model.backend, Some(BackendType::TranscribeCpp));
        assert!(model.id.contains("qwen3-asr"));
    }

    #[test]
    fn test_scan_unknown_gguf_model() {
        let temp_dir = TempDir::new().unwrap();

        // Create an unknown GGUF file (non-standard format)
        // According to design: files without standard <model>-<quant>.gguf format are not recognized
        create_test_gguf_file(temp_dir.path(), "custom-asr-model.gguf", 100 * 1024 * 1024);

        let models = scan_available_asr_models_from_path(temp_dir.path());

        // Should NOT be recognized (returns empty list)
        assert_eq!(models.len(), 0, "Non-standard filename should not be recognized");
    }

    #[test]
    fn test_scan_gguf_various_architectures() {
        let temp_dir = TempDir::new().unwrap();

        // Create GGUF files for various architectures (with standard quantization format)
        let gguf_files = [
            "parakeet-tdt-1.1b-q5_0.gguf",
            "sensevoice-small-q8_0.gguf",
            "voxtral-mini-q5_k_m.gguf",
            "moonshine-base-f16.gguf",
        ];

        for filename in gguf_files {
            create_test_gguf_file(temp_dir.path(), filename, 100 * 1024 * 1024);
        }

        let models = scan_available_asr_models_from_path(temp_dir.path());

        // Should recognize all 4 files
        assert_eq!(models.len(), 4);

        // All should be TranscribeCpp backend
        for model in &models {
            assert_eq!(model.backend, Some(BackendType::TranscribeCpp));
        }
    }

    #[test]
    fn test_single_directory_quant_selection() {
        // Test: Single directory with multiple quantization versions of same model
        // Should select the highest precision version
        let temp_dir = TempDir::new().unwrap();

        // Create multiple quantization versions of the same model
        create_test_gguf_file(temp_dir.path(), "qwen3-asr-1.7b-q5_k_m.gguf", 100 * 1024 * 1024);
        create_test_gguf_file(temp_dir.path(), "qwen3-asr-1.7b-q8_0.gguf", 150 * 1024 * 1024);
        create_test_gguf_file(temp_dir.path(), "qwen3-asr-1.7b-f16.gguf", 200 * 1024 * 1024);

        let models = scan_available_asr_models_from_path(temp_dir.path());

        // Should only return one model (highest precision)
        assert_eq!(models.len(), 1, "Should deduplicate to one model");
        let model = &models[0];
        assert_eq!(model.id, "qwen3-asr-1.7b");
        assert_eq!(model.quant, Some("F16".to_string()), "Should select F16 (highest precision)");
    }

    #[test]
    fn test_multi_directory_quant_comparison() {
        // Test: Two directories with different quantization versions
        // Should select the highest precision version across all directories
        let default_dir = TempDir::new().unwrap();
        let custom_dir = TempDir::new().unwrap();

        // Default directory: Q5_K_M version (lower precision)
        create_test_gguf_file(default_dir.path(), "whisper-large-q5_k_m.gguf", 100 * 1024 * 1024);

        // Custom directory: Q8_0 version (higher precision)
        create_test_gguf_file(custom_dir.path(), "whisper-large-q8_0.gguf", 150 * 1024 * 1024);

        // Simulate the multi-directory scanning logic
        let mut seen_ids: HashSet<String> = HashSet::new();
        let mut models: Vec<ModelPreset> = Vec::new();

        // Scan default directory first
        let default_models = scan_single_directory(default_dir.path());
        for model in default_models {
            seen_ids.insert(model.id.clone());
            models.push(model);
        }

        // Scan custom directory and compare quantization
        let custom_models = scan_single_directory(custom_dir.path());
        for custom_model in custom_models {
            if !seen_ids.contains(&custom_model.id) {
                seen_ids.insert(custom_model.id.clone());
                models.push(custom_model);
            } else {
                // Compare and potentially replace with higher precision version
                if let Some(existing) = models.iter_mut().find(|m| m.id == custom_model.id) {
                    let should_replace = match (&custom_model.quant, &existing.quant) {
                        (Some(custom_quant), Some(existing_quant)) => {
                            quant_priority(custom_quant) > quant_priority(existing_quant)
                        }
                        _ => false,
                    };
                    if should_replace {
                        *existing = custom_model;
                    }
                }
            }
        }

        // Verify result
        assert_eq!(models.len(), 1, "Should deduplicate to one model");
        let model = &models[0];
        assert_eq!(model.id, "whisper-large");
        assert_eq!(model.quant, Some("Q8_0".to_string()), "Should select Q8_0 from custom directory (higher precision than Q5_K_M)");
    }
}
