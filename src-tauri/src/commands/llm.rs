//! LLM Tauri Commands Module
//! 提供 LLM 相关的 Tauri 命令

use crate::commands::performance::LlmPerformanceState;
use crate::config::AppServices;
#[cfg(feature = "local_llm")]
use crate::llm::clear_model_cache;
use crate::llm::{
    get_provider_meta_list, LlmConfig, LlmProfile, LlmProgressEvent, LlmProviderInstance,
    LlmResponse, LlmService, ProviderMeta, ProviderModelsCache, UserPromptPresets,
};
use crate::llm_models::{get_llm_model_presets, scan_available_llm_models, LlmModelPreset};
use crate::utils::downloader::{
    download_model_with_source, get_llm_model_path, llm_model_exists, DownloadResult,
};
use log::info;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;

/// LLM 处理请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProcessRequest {
    /// 要处理的文本
    pub text: String,
    /// 可选的模型覆盖
    pub model: Option<String>,
    /// 可选的温度参数覆盖
    pub temperature: Option<f32>,
}

/// LLM 健康检查响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmHealthResponse {
    /// 是否可用
    pub available: bool,
    /// Provider 名称
    pub provider: String,
    /// 可用模型列表
    pub models: Vec<String>,
    /// 错误信息（如果有）
    pub error: Option<String>,
}

/// LLM 模型列表响应（预设 + 状态）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelWithStatus {
    pub preset: LlmModelPreset,
    pub downloaded: bool,
    pub path: Option<String>,
    pub size_mb: Option<u64>,
}

/// LLM 模型下载请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadLlmModelRequest {
    pub preset_id: String,
    pub preferred_source: Option<String>,
    pub prefer_china: Option<bool>,
}

/// 获取 LLM 配置的辅助函数
fn get_llm_config(services: &State<'_, AppServices>) -> LlmConfig {
    let config = services.config.lock().unwrap();
    config.llm.clone()
}

/// 检查 LLM 服务状态
#[tauri::command]
pub async fn llm_health_check(
    services: State<'_, AppServices>,
) -> Result<LlmHealthResponse, String> {
    info!("[LLM] Running health check");

    let llm_config = get_llm_config(&services);
    let provider_name = format!("{:?}", llm_config.provider.provider_type);
    info!(
        "[LLM] Health check - provider: {}, base_url: {}, model: {}",
        provider_name, llm_config.provider.base_url, llm_config.provider.model
    );
    info!(
        "[LLM] Full config: enabled={}, temperature={}",
        llm_config.enabled, llm_config.temperature
    );

    let llm_service = match LlmService::new(llm_config) {
        Ok(service) => service,
        Err(e) => {
            info!("[LLM] Failed to create service: {}", e);
            return Ok(LlmHealthResponse {
                available: false,
                provider: provider_name,
                models: vec![],
                error: Some(e),
            });
        }
    };

    match llm_service.health_check().await {
        Ok(available) => {
            info!("[LLM] Health check result: available={}", available);
            let models = if available {
                match llm_service.list_models().await {
                    Ok(m) => {
                        info!("[LLM] Found {} models", m.len());
                        m
                    }
                    Err(e) => {
                        info!("[LLM] Failed to list models: {}", e);
                        vec![]
                    }
                }
            } else {
                vec![]
            };

            Ok(LlmHealthResponse {
                available,
                provider: provider_name,
                models,
                error: None,
            })
        }
        Err(e) => {
            info!("[LLM] Health check failed: {}", e);
            Ok(LlmHealthResponse {
                available: false,
                provider: provider_name,
                models: vec![],
                error: Some(e),
            })
        }
    }
}

/// 获取可用模型列表
#[tauri::command]
pub async fn llm_list_models(services: State<'_, AppServices>) -> Result<Vec<String>, String> {
    info!("[LLM] Listing models");

    let llm_config = get_llm_config(&services);
    info!(
        "[LLM] Config - provider: {:?}, base_url: {}, model: {}",
        llm_config.provider.provider_type, llm_config.provider.base_url, llm_config.provider.model
    );

    let llm_service = LlmService::new(llm_config)?;
    let models = llm_service.list_models().await?;
    info!("[LLM] Found {} models: {:?}", models.len(), models);
    Ok(models)
}

/// 处理文本（LLM 后处理）
#[tauri::command]
pub async fn llm_process_text(
    services: State<'_, AppServices>,
    request: LlmProcessRequest,
) -> Result<LlmResponse, String> {
    info!("[LLM] Processing text: {} chars", request.text.len());

    let mut llm_config = get_llm_config(&services);

    // 应用覆盖参数
    if let Some(model) = request.model {
        llm_config.provider.model = model;
    }
    if let Some(temperature) = request.temperature {
        llm_config.temperature = temperature;
    }

    // 获取超时时间（在 move 之前）
    let timeout_secs = llm_config.provider.timeout_secs;
    let llm_service = LlmService::new(llm_config)?;

    // 添加超时保护（默认30秒，可从配置覆盖）
    let timeout = std::time::Duration::from_secs(timeout_secs as u64);

    tokio::time::timeout(timeout, llm_service.process_text(&request.text))
        .await
        .map_err(|_| format!("LLM 请求超时（{}秒）", timeout_secs))?
}

/// 处理文本（按场景 ID，使用场景级 Profile 配置）
#[tauri::command]
pub async fn llm_process_text_for_scene(
    services: State<'_, AppServices>,
    llm_performance: State<'_, LlmPerformanceState>,
    scene_id: String,
    text: String,
) -> Result<LlmResponse, String> {
    info!(
        "[LLM] Processing text for scene: {}, {} chars",
        scene_id,
        text.len()
    );

    // 获取场景级 profile
    let profile = {
        let config = services.config.lock().unwrap();
        config
            .llm_profiles
            .iter()
            .find(|p| p.scene_id == scene_id)
            .cloned()
    };

    let profile = match profile {
        Some(p) => {
            info!(
                "[LLM] Found profile for scene {}: enabled={}, provider_id={:?}, model={}",
                scene_id, p.enabled, p.provider_id, p.model
            );
            p
        }
        None => {
            info!(
                "[LLM] No profile found for scene {}, LLM not enabled",
                scene_id
            );
            return Ok(LlmResponse {
                success: false,
                text: text.clone(),
                error: Some("No LLM profile for this scene".to_string()),
                tokens_used: None,
            });
        }
    };

    if !profile.enabled {
        info!("[LLM] Profile for scene {} is disabled", scene_id);
        return Ok(LlmResponse {
            success: false,
            text: text.clone(),
            error: Some("LLM disabled for this scene".to_string()),
            tokens_used: None,
        });
    }

    // 获取 Provider 配置
    let (provider_meta, provider_instance) = {
        let config = services.config.lock().unwrap();

        // 确定要使用的 provider_id
        let provider_id = profile.provider_id.clone().unwrap_or_else(|| {
            // 如果 profile 没有指定 provider，使用全局配置或默认
            config.llm.provider.provider_type.to_provider_id()
        });

        info!("[LLM] Using provider_id: {}", provider_id);

        // 获取 provider 元数据
        let meta = get_provider_meta_list()
            .into_iter()
            .find(|m| m.id == provider_id)
            .ok_or_else(|| format!("未找到 Provider: {}", provider_id))?;

        // 获取 provider 实例配置
        let instance = config
            .llm_providers
            .get(&provider_id)
            .cloned()
            .unwrap_or_else(|| {
                // 如果没有配置实例，使用默认配置
                LlmProviderInstance {
                    meta_id: provider_id.clone(),
                    enabled: true,
                    base_url: meta.base_url.clone(),
                    api_key: None,
                    default_model: None,
                    n_gpu_layers: None,
                    context_limit: None,
                    max_tokens: None,
                }
            });

        (meta, instance)
    };

    // 获取提示词预设（单一存储，不再按语言分）
    let presets = {
        let config = services.config.lock().unwrap();
        config.llm_prompt_presets.clone()
    };

    // 根据 user_prompt_type 确定 user_prompt
    // user_prompt_type 可能是内置类型 ("lightPolish", "translate", "professionalPolish", "meetingSecretary")
    // 或自定义预设名称（如 "正式表达"）
    // 如果预设为空或预设字段为空，使用 profile.user_prompt_custom
    let user_prompt = match profile.user_prompt_type.as_str() {
        "lightPolish" => presets.as_ref()
            .and_then(|p| if p.light_polish.is_empty() { None } else { Some(&p.light_polish) })
            .cloned()
            .unwrap_or_else(|| profile.user_prompt_custom.clone()),
        "translate" => presets.as_ref()
            .and_then(|p| if p.translate.is_empty() { None } else { Some(&p.translate) })
            .cloned()
            .unwrap_or_else(|| profile.user_prompt_custom.clone()),
        "professionalPolish" => presets.as_ref()
            .and_then(|p| if p.professional_polish.is_empty() { None } else { Some(&p.professional_polish) })
            .cloned()
            .unwrap_or_else(|| profile.user_prompt_custom.clone()),
        "meetingSecretary" => presets.as_ref()
            .and_then(|p| if p.meeting_secretary.is_empty() { None } else { Some(&p.meeting_secretary) })
            .cloned()
            .unwrap_or_else(|| profile.user_prompt_custom.clone()),
        preset_name => {
            // 尝试从自定义预设中查找
            presets.as_ref()
                .and_then(|p| p.custom_presets.get(preset_name))
                .cloned()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| profile.user_prompt_custom.clone())
        }
    };

    info!("[LLM] User prompt type: {}", profile.user_prompt_type);
    info!(
        "[LLM] User prompt template (with placeholder): {}",
        user_prompt
    );
    info!("[LLM] Input text (recognized speech): {}", text);

    // 构建 LlmConfig
    let llm_config = crate::llm::LlmConfig {
        enabled: true,
        provider: crate::llm::LlmProviderConfig {
            provider_type: provider_meta
                .id
                .parse()
                .unwrap_or(crate::llm::LlmProviderType::Custom),
            enabled: true,
            base_url: provider_instance.base_url.clone(),
            api_key: provider_instance.api_key.clone(),
            model: profile.model.clone(),
            timeout_secs: 3600, // 60分钟，大文本处理需要足够时间
        },
        user_prompt_template: user_prompt.clone(),
        max_tokens: profile.max_tokens,
        temperature: profile.temperature,
    };

    info!(
        "[LLM] Using provider: {}, model: {}",
        provider_meta.label, llm_config.provider.model
    );

    // 创建 LlmService
    let llm_service =
        LlmService::from_provider_instance(llm_config.clone(), provider_meta, provider_instance)?;

    // 获取超时时间
    let timeout_secs = llm_config.provider.timeout_secs;

    // 添加超时保护
    let timeout = std::time::Duration::from_secs(timeout_secs as u64);

    // 记录开始时间
    let start_time = Instant::now();
    let text_len = text.len() as u32;
    let model_id = profile.model.clone();

    let result = tokio::time::timeout(timeout, llm_service.process_text(&text))
        .await
        .map_err(|_| format!("LLM 请求超时（{}秒）", timeout_secs))?;

    // 记录性能数据（使用毫秒）
    let elapsed_ms = start_time.elapsed().as_millis() as f64;
    llm_performance.0.record(&model_id, text_len, elapsed_ms);
    info!(
        "[LLM] Process completed in {:.0}ms for {} chars",
        elapsed_ms, text_len
    );

    result
}

/// 处理文本（按场景 ID，带进度事件）
/// 通过 Tauri 事件 "llm-progress" 发送进度更新
#[tauri::command]
pub async fn llm_process_text_for_scene_with_progress(
    app: AppHandle,
    services: State<'_, AppServices>,
    llm_performance: State<'_, LlmPerformanceState>,
    scene_id: String,
    text: String,
) -> Result<LlmResponse, String> {
    info!(
        "[LLM] Processing text for scene with progress: {}, {} chars",
        scene_id,
        text.len()
    );

    // 获取场景级 profile
    let profile = {
        let config = services.config.lock().unwrap();
        config
            .llm_profiles
            .iter()
            .find(|p| p.scene_id == scene_id)
            .cloned()
    };

    let profile = match profile {
        Some(p) => {
            info!(
                "[LLM] Found profile for scene {}: enabled={}, provider_id={:?}, model={}",
                scene_id, p.enabled, p.provider_id, p.model
            );
            p
        }
        None => {
            info!(
                "[LLM] No profile found for scene {}, LLM not enabled",
                scene_id
            );
            return Ok(LlmResponse {
                success: false,
                text: text.clone(),
                error: Some("No LLM profile for this scene".to_string()),
                tokens_used: None,
            });
        }
    };

    if !profile.enabled {
        info!("[LLM] Profile for scene {} is disabled", scene_id);
        return Ok(LlmResponse {
            success: false,
            text: text.clone(),
            error: Some("LLM disabled for this scene".to_string()),
            tokens_used: None,
        });
    }

    // 获取 Provider 配置
    let (provider_meta, provider_instance) = {
        let config = services.config.lock().unwrap();

        // 确定要使用的 provider_id
        let provider_id = profile.provider_id.clone().unwrap_or_else(|| {
            // 如果 profile 没有指定 provider，使用全局配置或默认
            config.llm.provider.provider_type.to_provider_id()
        });

        info!("[LLM] Using provider_id: {}", provider_id);

        // 获取 provider 元数据
        let meta = get_provider_meta_list()
            .into_iter()
            .find(|m| m.id == provider_id)
            .ok_or_else(|| format!("未找到 Provider: {}", provider_id))?;

        // 获取 provider 实例配置
        let instance = config
            .llm_providers
            .get(&provider_id)
            .cloned()
            .unwrap_or_else(|| {
                // 如果没有配置实例，使用默认配置
                LlmProviderInstance {
                    meta_id: provider_id.clone(),
                    enabled: true,
                    base_url: meta.base_url.clone(),
                    api_key: None,
                    default_model: None,
                    n_gpu_layers: None,
                    context_limit: None,
                    max_tokens: None,
                }
            });

        (meta, instance)
    };

    // 获取提示词预设（单一存储，不再按语言分）
    let presets = {
        let config = services.config.lock().unwrap();
        config.llm_prompt_presets.clone()
    };

    // 根据 user_prompt_type 确定 user_prompt
    // user_prompt_type 可能是内置类型 ("lightPolish", "translate", "professionalPolish", "meetingSecretary")
    // 或自定义预设名称（如 "正式表达"）
    // 如果预设为 None（用户未保存过），使用 user_prompt_custom 作为后备
    let user_prompt = match (&presets, profile.user_prompt_type.as_str()) {
        (Some(p), "lightPolish") => p.light_polish.clone(),
        (Some(p), "translate") => p.translate.clone(),
        (Some(p), "professionalPolish") => p.professional_polish.clone(),
        (Some(p), "meetingSecretary") => p.meeting_secretary.clone(),
        (Some(p), preset_name) => {
            // 尝试从自定义预设中查找
            p.custom_presets
                .get(preset_name)
                .cloned()
                .unwrap_or_else(|| profile.user_prompt_custom.clone())
        }
        (None, _) => {
            // 预设为空，使用 user_prompt_custom
            profile.user_prompt_custom.clone()
        }
    };

    info!("[LLM] User prompt type: {}", profile.user_prompt_type);
    info!(
        "[LLM] User prompt template (with placeholder): {}",
        user_prompt
    );

    // 构建 LlmConfig
    let llm_config = crate::llm::LlmConfig {
        enabled: true,
        provider: crate::llm::LlmProviderConfig {
            provider_type: provider_meta
                .id
                .parse()
                .unwrap_or(crate::llm::LlmProviderType::Custom),
            enabled: true,
            base_url: provider_instance.base_url.clone(),
            api_key: provider_instance.api_key.clone(),
            model: profile.model.clone(),
            timeout_secs: 3600, // 60分钟，大文本处理需要足够时间
        },
        user_prompt_template: user_prompt.clone(),
        max_tokens: profile.max_tokens,
        temperature: profile.temperature,
    };

    info!(
        "[LLM] Using provider: {}, model: {}",
        provider_meta.label, llm_config.provider.model
    );

    // 保存 provider_id 用于后续日志
    let provider_id_for_log = provider_meta.id.clone();

    // 创建 LlmService
    let llm_service =
        LlmService::from_provider_instance(llm_config.clone(), provider_meta, provider_instance)?;

    // 获取超时时间
    let timeout_secs = llm_config.provider.timeout_secs;
    let timeout = std::time::Duration::from_secs(timeout_secs as u64);

    // 创建进度 channel（容量 16，足够缓冲进度事件）
    let (progress_tx, mut progress_rx) = mpsc::channel::<LlmProgressEvent>(16);

    info!(
        "[LLM] 创建进度 channel，开始处理文本，provider_id={}",
        provider_id_for_log
    );

    // 后台任务：转发进度到 Tauri 事件
    let app_clone = app.clone();
    let _forward_task = tokio::spawn(async move {
        log::info!("[LLM Progress Forward] 转发任务已启动，等待进度事件...");
        let mut event_count = 0u32;
        while let Some(progress) = progress_rx.recv().await {
            event_count += 1;
            log::info!(
                "[LLM Progress Forward] #{}: stage={:?}, current={}, total={}, percentage={}%",
                event_count,
                progress.stage,
                progress.current,
                progress.total,
                progress.percentage
            );
            if let Err(e) = app_clone.emit("llm-progress", &progress) {
                log::warn!("[LLM] Failed to emit progress event: {}", e);
            }
        }
        log::info!(
            "[LLM] Progress forwarding task completed, total events sent: {}",
            event_count
        );
        event_count
    });

    // 记录开始时间
    let start_time = Instant::now();
    let text_len = text.len() as u32;
    let model_id = profile.model.clone();

    // 调用带进度的处理方法
    let result = tokio::time::timeout(
        timeout,
        llm_service.process_text_with_progress(&text, Some(progress_tx)),
    )
    .await
    .map_err(|_| format!("LLM 请求超时（{}秒）", timeout_secs))?;

    // 记录性能数据（使用毫秒）
    let elapsed_ms = start_time.elapsed().as_millis() as f64;
    llm_performance.0.record(&model_id, text_len, elapsed_ms);
    info!(
        "[LLM] Process completed in {:.0}ms for {} chars",
        elapsed_ms, text_len
    );

    result
}

/// 获取 LLM Profile（按场景 ID）
#[tauri::command]
pub fn get_llm_profile(
    services: State<'_, AppServices>,
    scene_id: String,
) -> Result<Option<LlmProfile>, String> {
    info!("[LLM] Getting profile for scene: {}", scene_id);

    let config = services.config.lock().unwrap();
    let profile = config
        .llm_profiles
        .iter()
        .find(|p| p.scene_id == scene_id)
        .cloned();

    info!("[LLM] Profile found: {:?}", profile.is_some());
    Ok(profile)
}

/// 保存 LLM Profile（创建或更新）
#[tauri::command]
pub fn save_llm_profile(
    services: State<'_, AppServices>,
    profile: LlmProfile,
) -> Result<LlmProfile, String> {
    info!(
        "[LLM] Saving profile for scene: {}, id: {}",
        profile.scene_id, profile.id
    );
    info!(
        "[LLM] Profile details: enabled={}, provider_id={:?}, model={}",
        profile.enabled, profile.provider_id, profile.model
    );

    let mut config = services.config.lock().unwrap();

    // 获取原来的 profile（保存前），用于判断是否需要清除本地模型
    let old_profile = config
        .llm_profiles
        .iter()
        .find(|p| p.scene_id == profile.scene_id)
        .cloned();

    // 判断是否从本地模型切换到远程 provider
    let was_local_llm = old_profile
        .as_ref()
        .map(|p| p.provider_id.as_deref() == Some("llama_cpp"))
        .unwrap_or(false);
    let is_now_remote = profile.provider_id.as_deref() != Some("llama_cpp");

    // 查找是否存在该场景的 profile
    if let Some(existing) = config
        .llm_profiles
        .iter_mut()
        .find(|p| p.scene_id == profile.scene_id)
    {
        // 更新现有 profile
        info!(
            "[LLM] Updating existing profile, old provider_id: {:?}, new provider_id: {:?}",
            existing.provider_id, profile.provider_id
        );
        *existing = profile.clone();
    } else {
        // 添加新 profile
        info!(
            "[LLM] Adding new profile with provider_id: {:?}",
            profile.provider_id
        );
        config.llm_profiles.push(profile.clone());
    }

    // 如果从本地模型切换到远程 provider，检查是否需要清除本地模型缓存
    let should_clear_cache = was_local_llm && is_now_remote;

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content =
        serde_json::to_string_pretty(&*config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))?;

    // 在释放锁后清除缓存（避免锁冲突）
    drop(config);

    // 如果从本地模型切换到远程 provider，检查其他场景是否还在使用本地模型
    if should_clear_cache {
        // 重新获取锁检查其他场景
        let config = services.config.lock().unwrap();
        let other_scenes_using_local_llm = config
            .llm_profiles
            .iter()
            .filter(|p| p.scene_id != profile.scene_id) // 排除当前场景
            .filter(|p| p.enabled) // 只检查启用的 profile
            .filter(|p| p.provider_id.as_deref() == Some("llama_cpp")) // 使用本地模型的
            .count();

        info!(
            "[LLM] 检查本地模型使用情况: 其他场景使用本地模型数量 = {}",
            other_scenes_using_local_llm
        );

        if other_scenes_using_local_llm == 0 {
            // 没有其他场景使用本地模型，清除缓存
            #[cfg(feature = "local_llm")]
            {
                info!("[LLM] 没有其他场景使用本地模型，清除本地模型缓存");
                clear_model_cache();
            }
            #[cfg(not(feature = "local_llm"))]
            {
                info!("[LLM] local_llm feature 未启用，跳过清除缓存");
            }
        } else {
            info!("[LLM] 其他场景仍在使用本地模型，保留缓存");
        }
    }

    info!("[LLM] Profile saved successfully");
    Ok(profile)
}

/// 获取提示词预设（单一存储）
#[tauri::command]
pub fn get_llm_prompt_presets(
    services: State<'_, AppServices>,
) -> Result<Option<UserPromptPresets>, String> {
    info!("[LLM] Getting prompt presets");

    let config = services.config.lock().unwrap();
    Ok(config.llm_prompt_presets.clone())
}

/// 保存提示词预设（单一存储）
#[tauri::command]
pub fn save_llm_prompt_presets(
    services: State<'_, AppServices>,
    presets: UserPromptPresets,
) -> Result<UserPromptPresets, String> {
    info!("[LLM] Saving prompt presets");

    let mut config = services.config.lock().unwrap();

    // 更新预设
    config.llm_prompt_presets = Some(presets.clone());

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content =
        serde_json::to_string_pretty(&*config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))?;

    info!("[LLM] Prompt presets saved successfully");
    Ok(presets)
}

// ============== Provider 管理命令 ==============

/// Provider 列表响应（包含配置状态）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderWithConfig {
    pub meta: ProviderMeta,
    pub instance: Option<LlmProviderInstance>,
}

/// 获取 Provider 列表（包含配置状态）
#[tauri::command]
pub fn get_provider_list(
    services: State<'_, AppServices>,
) -> Result<Vec<ProviderWithConfig>, String> {
    info!("[LLM] Getting provider list");

    let config = services.config.lock().unwrap();
    let meta_list = get_provider_meta_list();

    let result: Vec<ProviderWithConfig> = meta_list
        .into_iter()
        .map(|meta| {
            let instance = config.llm_providers.get(&meta.id).cloned();

            // llama.cpp 默认处于已配置状态（确保本地 LLM 加载功能始终可用）
            let instance = if meta.id == "llama_cpp" && instance.is_none() {
                Some(LlmProviderInstance {
                    meta_id: "llama_cpp".to_string(),
                    enabled: true,
                    base_url: "".to_string(),
                    api_key: None,
                    default_model: None,
                    n_gpu_layers: None, // 前端会根据 GPU 检测结果自动设置
                    context_limit: None,
                    max_tokens: None,
                })
            } else {
                instance
            };

            ProviderWithConfig { meta, instance }
        })
        .collect();

    info!("[LLM] Found {} providers", result.len());
    Ok(result)
}

/// 保存 Provider 配置
#[tauri::command]
pub fn save_provider_config(
    services: State<'_, AppServices>,
    provider_id: String,
    instance: LlmProviderInstance,
) -> Result<LlmProviderInstance, String> {
    info!("[LLM] Saving provider config: {}", provider_id);
    info!(
        "[LLM] Instance: enabled={}, base_url={}",
        instance.enabled, instance.base_url
    );

    let mut config = services.config.lock().unwrap();
    config
        .llm_providers
        .insert(provider_id.clone(), instance.clone());

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content =
        serde_json::to_string_pretty(&*config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))?;

    info!("[LLM] Provider config saved successfully");
    Ok(instance)
}

/// 删除 Provider 配置
#[tauri::command]
pub fn delete_provider_config(
    services: State<'_, AppServices>,
    provider_id: String,
) -> Result<(), String> {
    info!("[LLM] Deleting provider config: {}", provider_id);

    let mut config = services.config.lock().unwrap();
    config.llm_providers.remove(&provider_id);

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content =
        serde_json::to_string_pretty(&*config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))?;

    info!("[LLM] Provider config deleted successfully");
    Ok(())
}

/// 从 Provider 获取模型列表
#[tauri::command]
pub async fn fetch_provider_models(
    provider_id: String,
    base_url: String,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    info!("[LLM] Fetching models for provider: {}", provider_id);
    info!("[LLM] Base URL: {}", base_url);

    // 获取 Provider 元数据
    let meta = get_provider_meta_list()
        .into_iter()
        .find(|m| m.id == provider_id)
        .ok_or_else(|| format!("未找到 Provider: {}", provider_id))?;

    // 创建临时实例
    let instance = LlmProviderInstance {
        meta_id: provider_id.clone(),
        enabled: true,
        base_url,
        api_key,
        default_model: None,
        n_gpu_layers: None,
        context_limit: None,
        max_tokens: None,
    };

    // 创建服务并获取模型列表
    let service = LlmService::from_provider_instance(LlmConfig::default(), meta, instance)?;

    let models = service.list_models().await?;
    info!(
        "[LLM] Found {} models for provider {}",
        models.len(),
        provider_id
    );
    Ok(models)
}

/// 检查 Provider 连接状态
#[tauri::command]
pub async fn check_provider_connection(
    provider_id: String,
    base_url: String,
    api_key: Option<String>,
) -> Result<LlmHealthResponse, String> {
    info!("[LLM] Checking connection for provider: {}", provider_id);

    // 特殊处理 llama.cpp - 检查模型文件而非 HTTP 连接
    if provider_id == "llama_cpp" {
        #[cfg(feature = "local_llm")]
        {
            // 扫描目录获取已存在的 .gguf 文件
            let available_models = scan_available_llm_models();

            if available_models.is_empty() {
                return Ok(LlmHealthResponse {
                    available: false,
                    provider: "llama.cpp".to_string(),
                    models: vec![],
                    error: Some(
                        "未找到 GGUF 模型文件，请下载或手动放置模型到 llm_models 目录".to_string(),
                    ),
                });
            }

            let model_ids: Vec<String> = available_models.iter().map(|m| m.id.clone()).collect();
            info!(
                "[LLM] Found {} GGUF models: {:?}",
                model_ids.len(),
                model_ids
            );

            return Ok(LlmHealthResponse {
                available: true,
                provider: "llama.cpp".to_string(),
                models: model_ids,
                error: None,
            });
        }

        #[cfg(not(feature = "local_llm"))]
        {
            return Ok(LlmHealthResponse {
                available: false,
                provider: "llama.cpp".to_string(),
                models: vec![],
                error: Some("local_llm feature 未启用，请重新编译启用该功能".to_string()),
            });
        }
    }

    // 获取 Provider 元数据
    let meta = get_provider_meta_list()
        .into_iter()
        .find(|m| m.id == provider_id)
        .ok_or_else(|| format!("未找到 Provider: {}", provider_id))?;

    // 创建临时实例
    let instance = LlmProviderInstance {
        meta_id: provider_id.clone(),
        enabled: true,
        base_url,
        api_key,
        default_model: None,
        n_gpu_layers: None,
        context_limit: None,
        max_tokens: None,
    };

    // 创建服务并检查连接
    let service = LlmService::from_provider_instance(LlmConfig::default(), meta.clone(), instance)?;

    let available = service.health_check().await?;
    let models = if available {
        service.list_models().await.unwrap_or_default()
    } else {
        vec![]
    };

    Ok(LlmHealthResponse {
        available,
        provider: meta.label,
        models,
        error: if available {
            None
        } else {
            Some("连接失败".to_string())
        },
    })
}

// ============== LLM 模型管理命令 ==============

/// 获取 LLM 模型列表（已存在的文件 + 可下载的预设）
#[tauri::command]
pub fn get_llm_model_list() -> Result<Vec<LlmModelWithStatus>, String> {
    info!("[LLM] Getting LLM model list");

    // 1. 扫描目录获取已存在的 .gguf 文件
    let available_models = scan_available_llm_models();
    info!(
        "[LLM] Found {} available models in directory",
        available_models.len()
    );

    // 2. 获取预设列表（用于下载源信息）
    let presets = get_llm_model_presets();

    // 3. 构建结果列表
    let mut result: Vec<LlmModelWithStatus> = Vec::new();

    // 添加已存在的模型（全部 downloaded=true）
    for model in available_models {
        let path = crate::utils::downloader::get_llm_model_path(&model.id)
            .ok()
            .map(|p| p.to_string_lossy().to_string());

        let size_mb = path
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok().map(|m| m.len() / (1024 * 1024)));

        result.push(LlmModelWithStatus {
            preset: model,
            downloaded: true,
            path,
            size_mb,
        });
    }

    // 添加未下载的预设（downloaded=false）
    for preset in presets {
        // 检查是否已经在已存在列表中
        if !result.iter().any(|m| m.preset.id == preset.id) {
            result.push(LlmModelWithStatus {
                preset,
                downloaded: false,
                path: None,
                size_mb: None,
            });
        }
    }

    info!(
        "[LLM] Total {} models ({} downloaded, {} presets)",
        result.len(),
        result.iter().filter(|m| m.downloaded).count(),
        result.iter().filter(|m| !m.downloaded).count()
    );

    Ok(result)
}

/// 下载 LLM 模型
#[tauri::command]
pub async fn download_llm_model(
    app: AppHandle,
    services: tauri::State<'_, AppServices>,
    request: DownloadLlmModelRequest,
) -> Result<DownloadResult, String> {
    info!("[LLM] Downloading LLM model: {}", request.preset_id);

    let presets = get_llm_model_presets();
    let preset = presets
        .into_iter()
        .find(|p| p.id == request.preset_id)
        .ok_or_else(|| format!("未找到 LLM 模型预设: {}", request.preset_id))?;

    let result = download_model_with_source(
        app,
        services,
        request.preset_id.clone(),
        preset.download_urls.clone(),
        request.preferred_source,
        request.prefer_china,
    )
    .await?;

    // Note: Download status is determined by filesystem scanning, not config persistence

    info!(
        "[LLM] Download result: success={}, path={:?}",
        result.success, result.path
    );
    Ok(result)
}

/// 删除已下载的 LLM 模型
#[tauri::command]
pub fn delete_llm_model(preset_id: String) -> Result<(), String> {
    info!("[LLM] Deleting LLM model: {}", preset_id);

    let path = get_llm_model_path(&preset_id)?;

    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("删除模型文件失败: {}", e))?;
        info!("[LLM] Model file deleted: {:?}", path);
    } else {
        info!("[LLM] Model file not found: {:?}", path);
    }

    Ok(())
}

/// 检查 LLM 模型是否已下载
#[tauri::command]
pub fn check_llm_model_exists(preset_id: String) -> bool {
    llm_model_exists(&preset_id)
}

/// 获取 LLM 模型存储路径
#[tauri::command]
pub fn get_llm_model_storage_path_cmd(preset_id: String) -> Result<String, String> {
    let path = get_llm_model_path(&preset_id)?;
    Ok(path.to_string_lossy().to_string())
}

// ============== GPU 检测命令 ==============

/// GPU 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    /// GPU 是否可用
    pub available: bool,
    /// GPU 类型 (cuda, metal, vulkan)
    pub gpu_type: String,
    /// 最大设备数
    pub max_devices: usize,
    /// 推荐的 GPU 层数 (-1 = 全部，0 = CPU)
    pub recommended_layers: i32,
}

/// 检测 GPU 可用性
#[tauri::command]
pub fn detect_gpu() -> GpuInfo {
    #[cfg(feature = "local_llm")]
    {
        let max_devices = llama_cpp_4::max_devices();

        // 检测 GPU 类型
        let gpu_type = {
            #[cfg(feature = "cuda")]
            {
                "cuda".to_string()
            }
            #[cfg(all(not(feature = "cuda"), feature = "metal"))]
            {
                "metal".to_string()
            }
            #[cfg(all(not(feature = "cuda"), not(feature = "metal"), feature = "vulkan"))]
            {
                "vulkan".to_string()
            }
            #[cfg(all(not(feature = "cuda"), not(feature = "metal"), not(feature = "vulkan")))]
            {
                "none".to_string()
            }
        };

        let available = max_devices > 0 && gpu_type != "none";

        info!(
            "[LLM] GPU detection: available={}, type={}, max_devices={}",
            available, gpu_type, max_devices
        );

        GpuInfo {
            available,
            gpu_type,
            max_devices,
            // 如果 GPU 可用，推荐全部层加载；否则 CPU
            recommended_layers: if available { -1 } else { 0 },
        }
    }

    #[cfg(not(feature = "local_llm"))]
    {
        GpuInfo {
            available: false,
            gpu_type: "none".to_string(),
            max_devices: 0,
            recommended_layers: 0,
        }
    }
}

// ============== Provider 模型缓存命令 ==============

/// 获取 Provider 的缓存模型列表
#[tauri::command]
pub async fn get_cached_provider_models(
    app_handle: AppHandle,
    provider_id: String,
) -> Result<Vec<String>, String> {
    info!("[LLM] Getting cached models for provider: {}", provider_id);

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {}", e))?;

    let cache = ProviderModelsCache::load(&data_dir);
    let models = cache.get_models(&provider_id).unwrap_or_default();

    info!(
        "[LLM] Found {} cached models for provider {}",
        models.len(),
        provider_id
    );
    Ok(models)
}

/// 刷新 Provider 模型列表并保存缓存
#[tauri::command]
pub async fn refresh_provider_models(
    services: State<'_, AppServices>,
    app_handle: AppHandle,
    provider_id: String,
) -> Result<Vec<String>, String> {
    info!("[LLM] Refreshing models for provider: {}", provider_id);

    // 特殊处理 llama.cpp - 扫描本地文件而非 API
    if provider_id == "llama_cpp" {
        #[cfg(feature = "local_llm")]
        {
            let available_models = scan_available_llm_models();
            let model_ids: Vec<String> = available_models.iter().map(|m| m.id.clone()).collect();

            // 保存到缓存
            let data_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| format!("获取数据目录失败: {}", e))?;
            let mut cache = ProviderModelsCache::load(&data_dir);
            cache.update(&provider_id, model_ids.clone());
            cache.save(&data_dir)?;

            info!("[LLM] Cached {} models for llama.cpp", model_ids.len());
            return Ok(model_ids);
        }

        #[cfg(not(feature = "local_llm"))]
        {
            return Err("local_llm feature 未启用".to_string());
        }
    }

    // 获取 provider 配置
    let (meta, instance) = {
        let config = services.config.lock().unwrap();
        let meta = get_provider_meta_list()
            .into_iter()
            .find(|m| m.id == provider_id)
            .ok_or_else(|| format!("未找到 Provider: {}", provider_id))?;
        let instance = config
            .llm_providers
            .get(&provider_id)
            .cloned()
            .unwrap_or_else(|| LlmProviderInstance {
                meta_id: provider_id.clone(),
                enabled: true,
                base_url: meta.base_url.clone(),
                api_key: None,
                default_model: None,
                n_gpu_layers: None,
                context_limit: None,
                max_tokens: None,
            });
        (meta, instance)
    };

    // 创建服务并获取模型列表
    let service = LlmService::from_provider_instance(LlmConfig::default(), meta, instance)?;

    let models = service.list_models().await?;
    info!(
        "[LLM] Found {} models from API for provider {}",
        models.len(),
        provider_id
    );

    // 保存到缓存
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {}", e))?;
    let mut cache = ProviderModelsCache::load(&data_dir);
    cache.update(&provider_id, models.clone());
    cache.save(&data_dir)?;

    info!(
        "[LLM] Cached {} models for provider {}",
        models.len(),
        provider_id
    );
    Ok(models)
}
