// HuggingFace 缓存管理模块
// 使用 hf-hub 共享 HuggingFace 缓存，避免重复下载模型

use std::path::PathBuf;

/// HuggingFace 缓存目录结构：
/// $HF_HOME/hub/models--<owner>--<repo>/snapshots/<commit_hash>/<filename>
///
/// 环境变量优先级：
/// 1. HF_HUB_CACHE
/// 2. HF_HOME/hub
/// 3. ~/.cache/huggingface/hub

/// 获取 HuggingFace 缓存目录路径
fn get_hf_cache_dir() -> PathBuf {
    // 检查环境变量 HF_HUB_CACHE
    if let Ok(cache_dir) = std::env::var("HF_HUB_CACHE") {
        return PathBuf::from(cache_dir);
    }

    // 检查环境变量 HF_HOME
    if let Ok(home_dir) = std::env::var("HF_HOME") {
        return PathBuf::from(home_dir).join("hub");
    }

    // 默认：~/.cache/huggingface/hub
    dirs::cache_dir()
        .map(|p| p.join("huggingface").join("hub"))
        .unwrap_or_else(|| PathBuf::from(".cache").join("huggingface").join("hub"))
}

/// 将 repo_id 转换为缓存目录名称
/// 例如："Qwen/Qwen2.5-7B-Instruct-GGUF" -> "models--Qwen--Qwen2.5-7B-Instruct-GGUF"
fn repo_id_to_cache_name(repo_id: &str) -> String {
    format!("models--{}", repo_id.replace("/", "--"))
}

/// 检查 HuggingFace 缓存中是否存在指定模型文件
///
/// 参数：
/// - repo_id: HuggingFace 仓库 ID，例如 "Qwen/Qwen2.5-7B-Instruct-GGUF"
/// - filename: 模型文件名，例如 "qwen2.5-7b-instruct-q4_k_m.gguf"
///
/// 返回：
/// - Some(PathBuf): 如果文件已缓存，返回缓存路径
/// - None: 如果文件未缓存
pub fn hf_cached_path(repo_id: &str, filename: &str) -> Option<PathBuf> {
    use hf_hub::Cache;

    log::debug!(
        "检查 HuggingFace 缓存: repo_id={}, filename={}",
        repo_id,
        filename
    );

    Cache::default()
        .model(repo_id.to_string())
        .get(filename)
        .map(|path| {
            log::info!(
                "找到已缓存模型: {} @ {} -> {}",
                repo_id,
                filename,
                path.display()
            );
            path
        })
}

/// 下载 GGUF 模型文件（异步）
///
/// 如果文件已缓存，直接返回缓存路径；
/// 如果未缓存，从 HuggingFace 下载并缓存。
///
/// 参数：
/// - repo_id: HuggingFace 仓库 ID，例如 "Qwen/Qwen2.5-7B-Instruct-GGUF"
/// - filename: 模型文件名，例如 "qwen2.5-7b-instruct-q4_k_m.gguf"
///
/// 返回：
/// - Ok(PathBuf): 下载成功，返回文件路径（缓存路径）
/// - Err(String): 下载失败，返回错误信息
pub async fn download_gguf_model(repo_id: &str, filename: &str) -> Result<PathBuf, String> {
    log::info!("开始下载/获取 GGUF 模型: {} @ {}", repo_id, filename);

    // 先检查缓存，如果已存在则直接返回
    if let Some(path) = hf_cached_path(repo_id, filename) {
        log::info!("模型已缓存，跳过下载: {}", path.display());
        return Ok(path);
    }

    // 使用 hf-hub API 下载
    download_from_hf_hub(repo_id, filename).await
}

/// 使用 hf-hub API 下载模型文件
async fn download_from_hf_hub(repo_id: &str, filename: &str) -> Result<PathBuf, String> {
    use hf_hub::api::tokio::Api;

    log::info!(
        "从 HuggingFace 下载: repo_id={}, filename={}",
        repo_id,
        filename
    );

    // 创建 Api 客户端（自动从环境变量读取 HF_TOKEN, HF_ENDPOINT, HF_HUB_CACHE 等）
    let api = Api::new().map_err(|e| format!("创建 HF Api 失败: {}", e))?;

    // 获取 repo handle（model_id 是完整的 repo_id，如 "Qwen/Qwen2.5-7B-Instruct-GGUF"）
    let repo = api.model(repo_id.to_string());

    // 获取文件（会自动检查缓存，如果已缓存则返回缓存路径，否则下载）
    let path = repo
        .get(filename)
        .await
        .map_err(|e| format!("下载文件失败: {} @ {} - {}", repo_id, filename, e))?;

    log::info!(
        "模型下载完成: {} @ {} -> {}",
        repo_id,
        filename,
        path.display()
    );

    Ok(path)
}

/// 获取 GGUF 模型的缓存或下载路径（异步）
///
/// 这是一个便捷函数，优先检查缓存，如果未缓存则下载。
pub async fn get_gguf_model_path(repo_id: &str, filename: &str) -> Result<PathBuf, String> {
    download_gguf_model(repo_id, filename).await
}

/// 检查 HuggingFace 缓存中是否存在指定仓库的任意版本
///
/// 参数：
/// - repo_id: HuggingFace 仓库 ID
///
/// 返回：如果仓库已缓存（至少有一个版本），返回 true
pub fn hf_repo_cached(repo_id: &str) -> bool {
    let cache_dir = get_hf_cache_dir();
    let repo_cache_name = repo_id_to_cache_name(repo_id);
    let repo_cache_dir = cache_dir.join(&repo_cache_name);

    repo_cache_dir.exists() && repo_cache_dir.join("snapshots").exists()
}

/// 获取已缓存仓库的所有 snapshot 版本
///
/// 参数：
/// - repo_id: HuggingFace 仓库 ID
///
/// 返回：所有已缓存的 commit hash 列表
pub fn get_cached_snapshots(repo_id: &str) -> Vec<String> {
    let cache_dir = get_hf_cache_dir();
    let repo_cache_name = repo_id_to_cache_name(repo_id);
    let snapshots_dir = cache_dir.join(&repo_cache_name).join("snapshots");

    if !snapshots_dir.exists() {
        return vec![];
    }

    std::fs::read_dir(&snapshots_dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repo_id_to_cache_name() {
        assert_eq!(
            repo_id_to_cache_name("Qwen/Qwen2.5-7B-Instruct-GGUF"),
            "models--Qwen--Qwen2.5-7B-Instruct-GGUF"
        );
        assert_eq!(
            repo_id_to_cache_name("openai-community/gpt2"),
            "models--openai-community--gpt2"
        );
    }

    #[test]
    fn test_get_hf_cache_dir() {
        let cache_dir = get_hf_cache_dir();
        // 应该返回一个有效的路径
        assert!(!cache_dir.as_os_str().is_empty());
    }
}
