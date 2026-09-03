//! LLM Tauri Commands Module
//! 提供 LLM 相关的 Tauri 命令

use crate::commands::performance::LlmPerformanceState;
use crate::config::AppServices;
use crate::llm::{
    get_provider_meta_list, LlmConfig, LlmProfile, LlmProgressEvent, LlmProviderInstance,
    LlmResponse, LlmService, ProviderMeta, ProviderModelsCache, UserPromptPresets,
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

/// 从全局配置构建 LlmConfig 的辅助函数
/// 返回 (LlmConfig, ProviderMeta, LlmProviderInstance) 或错误信息
fn build_llm_config_from_global(
    services: &State<'_, AppServices>,
) -> Result<(LlmConfig, ProviderMeta, LlmProviderInstance), String> {
    let config = services.config.lock().unwrap();

    // 获取全局 LLM 配置
    let global_llm = &config.global_model_config.llm;

    // 检查是否配置了 LLM
    if global_llm.provider_id.is_empty() || global_llm.model.is_empty() {
        return Err("全局 LLM 未配置".to_string());
    }

    let provider_id = &global_llm.provider_id;

    // 获取 provider 元数据
    let meta = get_provider_meta_list()
        .into_iter()
        .find(|m| m.id == *provider_id)
        .ok_or_else(|| format!("未找到 Provider 元数据: {}", provider_id))?;

    // 获取 provider 实例配置
    let instance = config
        .llm_providers
        .get(provider_id)
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

    // 构建 LlmConfig
    let llm_config = LlmConfig {
        enabled: true,
        provider: crate::llm::LlmProviderConfig {
            provider_type: meta
                .id
                .parse()
                .unwrap_or(crate::llm::LlmProviderType::Custom),
            enabled: true,
            base_url: instance.base_url.clone(),
            api_key: instance.api_key.clone(),
            model: global_llm.model.clone(),
            timeout_secs: 3600,
        },
        user_prompt_template: String::new(), // 健康检查不需要提示词
        max_tokens: global_llm.max_tokens,
        temperature: global_llm.temperature,
    };

    Ok((llm_config, meta, instance))
}

/// 检查 LLM 服务状态
#[tauri::command]
pub async fn llm_health_check(
    services: State<'_, AppServices>,
) -> Result<LlmHealthResponse, String> {
    info!("[LLM] Running health check");

    // 使用新的全局配置
    let (llm_config, provider_meta, provider_instance) = match build_llm_config_from_global(&services) {
        Ok(result) => result,
        Err(e) => {
            info!("[LLM] Failed to build config: {}", e);
            return Ok(LlmHealthResponse {
                available: false,
                provider: String::new(),
                models: vec![],
                error: Some(e),
            });
        }
    };

    let provider_name = provider_meta.label.clone();
    info!(
        "[LLM] Health check - provider: {}, base_url: {}, model: {}",
        provider_name, llm_config.provider.base_url, llm_config.provider.model
    );
    info!(
        "[LLM] Full config: enabled={}, temperature={}",
        llm_config.enabled, llm_config.temperature
    );

    let llm_service = match LlmService::from_provider_instance(llm_config.clone(), provider_meta, provider_instance) {
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

    let (llm_config, provider_meta, provider_instance) = build_llm_config_from_global(&services)?;
    info!(
        "[LLM] Config - provider: {}, base_url: {}, model: {}",
        provider_meta.label, llm_config.provider.base_url, llm_config.provider.model
    );

    let llm_service = LlmService::from_provider_instance(llm_config, provider_meta, provider_instance)?;
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

    let (mut llm_config, provider_meta, provider_instance) = build_llm_config_from_global(&services)?;

    // 应用覆盖参数
    if let Some(model) = request.model {
        llm_config.provider.model = model;
    }
    if let Some(temperature) = request.temperature {
        llm_config.temperature = temperature;
    }

    // 获取超时时间（在 move 之前）
    let timeout_secs = llm_config.provider.timeout_secs;
    let llm_service = LlmService::from_provider_instance(llm_config, provider_meta, provider_instance)?;

    // 添加超时保护（默认30秒，可从配置覆盖）
    let timeout = std::time::Duration::from_secs(timeout_secs as u64);

    tokio::time::timeout(timeout, llm_service.process_text(&request.text))
        .await
        .map_err(|_| format!("LLM 请求超时（{}秒）", timeout_secs))?
}

/// 处理文本（按场景 ID，使用全局 LLM 配置 + 场景提示词）
/// 如果前端传递了 prompt，直接使用；否则从场景配置中查找提示词
#[tauri::command]
pub async fn llm_process_text_for_scene(
    services: State<'_, AppServices>,
    llm_performance: State<'_, LlmPerformanceState>,
    scene_id: String,
    text: String,
    prompt: Option<String>,
) -> Result<LlmResponse, String> {
    info!(
        "[LLM] Processing text for scene: {}, {} chars",
        scene_id,
        text.len()
    );

    // 获取全局 LLM 配置 + 场景提示词
    let (llm_config, prompt_type, custom_prompt, provider_id) = {
        let config = services.config.lock().unwrap();

        // 获取场景配置（用于获取提示词）
        let scene = config
            .scenes
            .iter()
            .find(|s| s.id == scene_id);

        let scene = match scene {
            Some(s) => s,
            None => {
                info!("[LLM] Scene {} not found", scene_id);
                return Ok(LlmResponse {
                    success: false,
                    text: text.clone(),
                    error: Some("Scene not found".to_string()),
                    tokens_used: None,
                });
            }
        };

        // 检查是否配置了全局 LLM
        let global_llm = &config.global_model_config.llm;

        // 如果没有配置 provider_id 或 model，返回错误
        if global_llm.provider_id.is_empty() || global_llm.model.is_empty() {
            info!("[LLM] Global LLM not configured for scene {}", scene_id);
            return Ok(LlmResponse {
                success: false,
                text: text.clone(),
                error: Some("Global LLM not configured".to_string()),
                tokens_used: None,
            });
        }

        (
            global_llm.clone(),
            scene.prompt_type.clone(),
            scene.custom_prompt.clone(),
            global_llm.provider_id.clone(),
        )
    };

    info!(
        "[LLM] Global LLM config: provider_id={}, model={}, max_tokens={}, temperature={}",
        llm_config.provider_id, llm_config.model, llm_config.max_tokens, llm_config.temperature
    );
    info!("[LLM] Scene prompt_type: {:?}, custom_prompt: {:?}", prompt_type, custom_prompt.as_ref().map(|p| p.chars().take(50).collect::<String>()));

    // 获取 Provider 配置
    let (provider_meta, provider_instance) = {
        let config = services.config.lock().unwrap();

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

    // 获取提示词预设
    let presets = {
        let config = services.config.lock().unwrap();
        config.llm_prompt_presets.clone()
    };

    // 确定提示词（优先级：前端传递的 prompt > custom_prompt > prompt_type 预设 > 默认 "lightPolish"）
    let user_prompt = if let Some(frontend_prompt) = prompt {
        // 0. 前端传递的提示词最高优先级
        info!("[LLM] Using prompt from frontend");
        frontend_prompt
    } else if let Some(ref custom) = custom_prompt {
        // 1. 场景自定义提示词优先
        info!("[LLM] Using scene custom_prompt");
        custom.clone()
    } else {
        // 2. 根据 prompt_type 查找预设
        let effective_prompt_type = if prompt_type.is_empty() {
            // 3. 默认使用 "lightPolish"
            "lightPolish"
        } else {
            &prompt_type
        };

        match effective_prompt_type {
            "lightPolish" => presets.as_ref()
                .and_then(|p| if p.light_polish.is_empty() { None } else { Some(&p.light_polish) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            "translate" => presets.as_ref()
                .and_then(|p| if p.translate.is_empty() { None } else { Some(&p.translate) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            "professionalPolish" => presets.as_ref()
                .and_then(|p| if p.professional_polish.is_empty() { None } else { Some(&p.professional_polish) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            "meetingSecretary" => presets.as_ref()
                .and_then(|p| if p.meeting_secretary.is_empty() { None } else { Some(&p.meeting_secretary) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            preset_name => {
                // 尝试从自定义预设中查找
                presets.as_ref()
                    .and_then(|p| p.custom_presets.get(preset_name))
                    .cloned()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| {
                        // 未找到预设，使用默认 lightPolish
                        presets.as_ref()
                            .and_then(|p| if p.light_polish.is_empty() { None } else { Some(&p.light_polish) })
                            .cloned()
                            .unwrap_or_else(|| "{{text}}".to_string())
                    })
            }
        }
    };

    // 注入用户词典到提示词
    let user_prompt = {
        let config = services.config.lock().unwrap();
        let dict = &config.user_dictionary;

        if dict.enabled && !dict.entries.is_empty() {
            // 构建词典提示
            let dict_words: Vec<String> = dict.entries.iter().map(|e| {
                if e.aliases.is_empty() {
                    e.word.clone()
                } else {
                    format!("{} (别名: {})", e.word, e.aliases.join(", "))
                }
            }).collect();

            let dict_prompt = format!(
                "\n\n[用户词典 - 请确保以下词汇被正确识别和使用]\n{}",
                dict_words.join("\n")
            );

            info!("[LLM] Injecting dictionary with {} entries", dict.entries.len());

            // 追加词典提示到用户提示词
            format!("{}{}", user_prompt, dict_prompt)
        } else {
            user_prompt
        }
    };

    info!("[LLM] User prompt type: {}", if custom_prompt.is_some() { "custom" } else { &prompt_type });
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
            model: llm_config.model.clone(),
            timeout_secs: 3600, // 60分钟，大文本处理需要足够时间
        },
        user_prompt_template: user_prompt.clone(),
        max_tokens: llm_config.max_tokens,
        temperature: llm_config.temperature,
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
    let model_id = llm_config.provider.model.clone();

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

/// 处理文本（按场景 ID，使用全局 LLM 配置 + 场景提示词，带进度事件）
/// 通过 Tauri 事件 "llm-progress" 发送进度更新
/// 如果前端传递了 prompt，直接使用；否则从场景配置中查找提示词
#[tauri::command]
pub async fn llm_process_text_for_scene_with_progress(
    app: AppHandle,
    services: State<'_, AppServices>,
    llm_performance: State<'_, LlmPerformanceState>,
    scene_id: String,
    text: String,
    prompt: Option<String>,
) -> Result<LlmResponse, String> {
    info!(
        "[LLM] Processing text for scene with progress: {}, {} chars",
        scene_id,
        text.len()
    );

    // 获取全局 LLM 配置 + 场景提示词
    let (llm_config, prompt_type, custom_prompt, provider_id) = {
        let config = services.config.lock().unwrap();

        // 获取场景配置（用于获取提示词）
        let scene = config
            .scenes
            .iter()
            .find(|s| s.id == scene_id);

        let scene = match scene {
            Some(s) => s,
            None => {
                info!("[LLM] Scene {} not found", scene_id);
                return Ok(LlmResponse {
                    success: false,
                    text: text.clone(),
                    error: Some("Scene not found".to_string()),
                    tokens_used: None,
                });
            }
        };

        // 检查是否配置了全局 LLM
        let global_llm = &config.global_model_config.llm;

        // 如果没有配置 provider_id 或 model，返回错误
        if global_llm.provider_id.is_empty() || global_llm.model.is_empty() {
            info!("[LLM] Global LLM not configured for scene {}", scene_id);
            return Ok(LlmResponse {
                success: false,
                text: text.clone(),
                error: Some("Global LLM not configured".to_string()),
                tokens_used: None,
            });
        }

        (
            global_llm.clone(),
            scene.prompt_type.clone(),
            scene.custom_prompt.clone(),
            global_llm.provider_id.clone(),
        )
    };

    info!(
        "[LLM] Global LLM config: provider_id={}, model={}, max_tokens={}, temperature={}",
        llm_config.provider_id, llm_config.model, llm_config.max_tokens, llm_config.temperature
    );
    info!("[LLM] Scene prompt_type: {:?}, custom_prompt: {:?}", prompt_type, custom_prompt.as_ref().map(|p| p.chars().take(50).collect::<String>()));

    // 获取 Provider 配置
    let (provider_meta, provider_instance) = {
        let config = services.config.lock().unwrap();

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

    // 获取提示词预设
    let presets = {
        let config = services.config.lock().unwrap();
        config.llm_prompt_presets.clone()
    };

    // 确定提示词（优先级：前端传递的 prompt > custom_prompt > prompt_type 预设 > 默认 "lightPolish"）
    let user_prompt = if let Some(frontend_prompt) = prompt {
        // 0. 前端传递的提示词最高优先级
        info!("[LLM] Using prompt from frontend");
        frontend_prompt
    } else if let Some(ref custom) = custom_prompt {
        // 1. 场景自定义提示词优先
        info!("[LLM] Using scene custom_prompt");
        custom.clone()
    } else {
        // 2. 根据 prompt_type 查找预设
        let effective_prompt_type = if prompt_type.is_empty() {
            // 3. 默认使用 "lightPolish"
            "lightPolish"
        } else {
            &prompt_type
        };

        match effective_prompt_type {
            "lightPolish" => presets.as_ref()
                .and_then(|p| if p.light_polish.is_empty() { None } else { Some(&p.light_polish) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            "translate" => presets.as_ref()
                .and_then(|p| if p.translate.is_empty() { None } else { Some(&p.translate) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            "professionalPolish" => presets.as_ref()
                .and_then(|p| if p.professional_polish.is_empty() { None } else { Some(&p.professional_polish) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            "meetingSecretary" => presets.as_ref()
                .and_then(|p| if p.meeting_secretary.is_empty() { None } else { Some(&p.meeting_secretary) })
                .cloned()
                .unwrap_or_else(|| "{{text}}".to_string()),
            preset_name => {
                // 尝试从自定义预设中查找
                presets.as_ref()
                    .and_then(|p| p.custom_presets.get(preset_name))
                    .cloned()
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| {
                        // 未找到预设，使用默认 lightPolish
                        presets.as_ref()
                            .and_then(|p| if p.light_polish.is_empty() { None } else { Some(&p.light_polish) })
                            .cloned()
                            .unwrap_or_else(|| "{{text}}".to_string())
                    })
            }
        }
    };

    // 注入用户词典到提示词
    let user_prompt = {
        let config = services.config.lock().unwrap();
        let dict = &config.user_dictionary;

        if dict.enabled && !dict.entries.is_empty() {
            // 构建词典提示
            let dict_words: Vec<String> = dict.entries.iter().map(|e| {
                if e.aliases.is_empty() {
                    e.word.clone()
                } else {
                    format!("{} (别名: {})", e.word, e.aliases.join(", "))
                }
            }).collect();

            let dict_prompt = format!(
                "\n\n[用户词典 - 请确保以下词汇被正确识别和使用]\n{}",
                dict_words.join("\n")
            );

            info!("[LLM] Injecting dictionary with {} entries", dict.entries.len());

            // 追加词典提示到用户提示词
            format!("{}{}", user_prompt, dict_prompt)
        } else {
            user_prompt
        }
    };

    info!("[LLM] User prompt type: {}", if custom_prompt.is_some() { "custom" } else { &prompt_type });
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
            model: llm_config.model.clone(),
            timeout_secs: 3600, // 60分钟，大文本处理需要足够时间
        },
        user_prompt_template: user_prompt.clone(),
        max_tokens: llm_config.max_tokens,
        temperature: llm_config.temperature,
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
    let model_id = llm_config.provider.model.clone();

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
/// DEPRECATED: 请使用 Scene.promptType 和 Scene.customPrompt
#[tauri::command]
#[allow(deprecated)]
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
/// DEPRECATED: 请使用 Scene.promptType 和 Scene.customPrompt
#[tauri::command]
#[allow(deprecated)]
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

    // 获取原来的 profile（保存前）
    let old_profile = config
        .llm_profiles
        .iter()
        .find(|p| p.scene_id == profile.scene_id)
        .cloned();

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

    // 保存到文件
    let config_path = crate::config::get_config_path()?;
    let content =
        serde_json::to_string_pretty(&*config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))?;

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
