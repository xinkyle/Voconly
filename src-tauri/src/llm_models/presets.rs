//! LLM 模型预设列表
//! 硬编码支持的 GGUF 模型（用于下载源信息）
//! 动态扫描目录获取已存在的模型

use crate::presets::is_llm_model;
use crate::utils::downloader::{get_llm_model_storage_dir, DownloadSourceInfo};
use serde::{Deserialize, Serialize};
use std::fs;

/// LLM 模型预设
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelPreset {
    /// 预设 ID（用于下载文件名，不含 .gguf 后缀）
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 文件大小描述
    pub size: String,
    /// 描述信息
    pub description: String,
    /// 下载源列表（HuggingFace/ModelScope）
    pub download_urls: Vec<DownloadSourceInfo>,
    /// 默认 GPU 层数（-1 = 全部加载到 GPU，0 = CPU）
    pub n_gpu_layers: i32,
    /// 默认上下文长度
    pub n_ctx: u32,
    /// 是否推荐
    pub recommended: bool,
}

/// 扫描 llm_models 目录，获取已存在的 .gguf 文件列表
/// 返回模型预设列表（所有模型 downloaded=true）
pub fn scan_available_llm_models() -> Vec<LlmModelPreset> {
    let storage_dir = match get_llm_model_storage_dir() {
        Ok(dir) => dir,
        Err(e) => {
            log::warn!("无法获取 LLM 模型存储目录: {}", e);
            return Vec::new();
        }
    };

    if !storage_dir.exists() {
        log::info!("LLM 模型目录不存在: {:?}", storage_dir);
        return Vec::new();
    }

    let entries = match fs::read_dir(&storage_dir) {
        Ok(entries) => entries,
        Err(e) => {
            log::warn!("无法读取 LLM 模型目录: {}", e);
            return Vec::new();
        }
    };

    // 获取硬编码预设列表（用于匹配名称/描述）
    let presets = get_llm_model_presets();

    let models: Vec<LlmModelPreset> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            // Check file extension
            let path = e.path();
            let is_gguf = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext == "gguf")
                .unwrap_or(false);

            if !is_gguf {
                return None;
            }

            // Get filename and ID
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            let id = filename.strip_suffix(".gguf").unwrap_or(filename);

            // Check if this is a real LLM model (exclude ASR models)
            if is_llm_model(id) {
                Some(e)
            } else {
                None
            }
        })
        .map(|e| {
            let path = e.path();
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown.gguf");

            // 去掉 .gguf 后缀作为 ID
            let id = filename
                .strip_suffix(".gguf")
                .unwrap_or(filename)
                .to_string();

            // 尝试匹配预设
            let preset = presets.iter().find(|p| p.id == id);

            // 获取文件大小
            let size_mb = fs::metadata(&path).ok().map(|m| m.len() / (1024 * 1024));

            if let Some(p) = preset {
                // 使用预设信息
                LlmModelPreset {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    size: size_mb
                        .map(|s| format!("{}MB", s))
                        .unwrap_or_else(|| p.size.clone()),
                    description: p.description.clone(),
                    download_urls: p.download_urls.clone(),
                    n_gpu_layers: p.n_gpu_layers,
                    n_ctx: p.n_ctx,
                    recommended: p.recommended,
                }
            } else {
                // 使用文件名生成基本信息，默认使用GPU
                LlmModelPreset {
                    id: id.clone(),
                    name: id.clone(),
                    size: size_mb
                        .map(|s| format!("{}MB", s))
                        .unwrap_or_else(|| "未知大小".to_string()),
                    description: "用户自定义模型".to_string(),
                    download_urls: Vec::new(), // 无下载源
                    n_gpu_layers: -1,          // 默认全部GPU（-1表示自动检测）
                    n_ctx: 4096,               // 正常值
                    recommended: false,
                }
            }
        })
        .collect();

    log::info!("扫描到 {} 个 GGUF 模型", models.len());
    models
}

/// 获取硬编码的 LLM 模型预设列表
pub fn get_llm_model_presets() -> Vec<LlmModelPreset> {
    vec![
        // Qwen3.5-9B Q4_K_M - 支持GPU
        LlmModelPreset {
            id: "Qwen3.5-9B-Q4_K_M".to_string(),
            name: "Qwen3.5-9B Q4_K_M".to_string(),
            size: "~5.7GB".to_string(),
            description: "通义千问3.5 9B 模型，Q4_K_M量化，支持GPU加速".to_string(),
            download_urls: vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/Qwen3.5-9B-Q4_K_M-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly-org/Qwen3.5-9B-Q4_K_M-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            n_gpu_layers: -1,  // 全部加载到GPU
            n_ctx: 4096,
            recommended: false,
        },
        // Qwen3-4B-Instruct-2507 Q4_K_M - 支持GPU
        LlmModelPreset {
            id: "Qwen3-4B-Instruct-2507-Q4_K_M".to_string(),
            name: "Qwen3-4B-Instruct-2507 Q4_K_M".to_string(),
            size: "~2.5GB".to_string(),
            description: "通义千问3 4B 指令模型，Q4_K_M量化，支持GPU加速".to_string(),
            download_urls: vec![
                DownloadSourceInfo {
                    name: "ModelScope".to_string(),
                    url: "https://modelscope.cn/models/voconly/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
                    is_china_accessible: true,
                    priority: 0,
                },
                DownloadSourceInfo {
                    name: "HuggingFace".to_string(),
                    url: "https://huggingface.co/voconly-org/Qwen3-4B-Instruct-2507-Q4_K_M-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
                    is_china_accessible: false,
                    priority: 1,
                },
            ],
            n_gpu_layers: -1,  // 全部加载到GPU（-1表示自动检测全部层）
            n_ctx: 4096,  // 正常值
            recommended: true,
        },
    ]
}
