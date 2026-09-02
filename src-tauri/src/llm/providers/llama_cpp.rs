//! 本地 llama.cpp Provider 实现
//! 直接在进程中加载 GGUF 模型，无 HTTP 开销

use async_trait::async_trait;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::mpsc::Sender;

#[cfg(feature = "local_llm")]
use llama_cpp_4::{
    context::params::LlamaContextParams, llama_backend::LlamaBackend, llama_batch::LlamaBatch,
    model::params::LlamaModelParams, model::LlamaChatMessage, model::LlamaModel,
    sampling::LlamaSampler, token::LlamaToken,
};

use super::super::config::LlmConfig;
use super::super::progress::LlmProgressEvent;
use super::super::provider::{LlmProvider, LlmResponse};

/// LLM 模型设置配置（从 config/llm_model_settings.json 编译时嵌入）
#[cfg(feature = "local_llm")]
const LLM_MODEL_SETTINGS_JSON: &str = include_str!("../../../config/llm_model_settings.json");

/// 模型设置配置结构
#[cfg(feature = "local_llm")]
#[derive(Debug, serde::Deserialize)]
struct LlmModelSettings {
    /// 需要禁用思考模式的模型文件名关键词列表
    models_disable_thinking: Vec<String>,
}

/// 全局配置解析结果（只解析一次）
#[cfg(feature = "local_llm")]
static GLOBAL_MODEL_SETTINGS: OnceLock<LlmModelSettings> = OnceLock::new();

/// 获取模型设置配置
#[cfg(feature = "local_llm")]
fn get_model_settings() -> &'static LlmModelSettings {
    GLOBAL_MODEL_SETTINGS.get_or_init(|| {
        serde_json::from_str(LLM_MODEL_SETTINGS_JSON)
            .expect("Failed to parse llm_model_settings.json")
    })
}

/// 检查模型是否需要禁用思考模式
/// 根据配置文件中的 models_disable_thinking 列表进行匹配
#[cfg(feature = "local_llm")]
fn needs_disable_thinking(model_filename: &str) -> bool {
    let settings = get_model_settings();
    settings
        .models_disable_thinking
        .iter()
        .any(|keyword| model_filename.contains(keyword))
}

/// 全局后端初始化（只初始化一次）
#[cfg(feature = "local_llm")]
static GLOBAL_BACKEND: OnceLock<LlamaBackend> = OnceLock::new();

/// 全局模型缓存（按路径 + GPU层数 缓存）
/// 缓存大小限制为 1，切换模型时自动卸载旧模型
/// 原因：本地 LLM 模型文件很大（6-14GB），用户通常只用一个模型
#[cfg(feature = "local_llm")]
static MODEL_CACHE: Mutex<Vec<(PathBuf, i32, Arc<LlamaModel>)>> = Mutex::new(Vec::new());

/// 最大缓存模型数量
#[cfg(feature = "local_llm")]
const MAX_MODEL_CACHE_SIZE: usize = 1;

/// 获取当前缓存的 LLM 模型信息（用于内存状态展示）
pub fn get_cached_llm_model_info() -> Option<(String, u64)> {
    #[cfg(feature = "local_llm")]
    {
        let cache = MODEL_CACHE.lock().unwrap();
        // log::info!("[get_cached_llm_model_info] Cache size: {}", cache.len());
        if let Some((path, _n_gpu_layers, _)) = cache.first() {
            let model_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            // 获取文件大小
            let size_mb = std::fs::metadata(path)
                .ok()
                .map(|m| m.len() / (1024 * 1024))
                .unwrap_or(0);
            // log::info!("[get_cached_llm_model_info] Found model: {} ({}MB)", model_name, size_mb);
            return Some((model_name, size_mb));
        }
        // log::info!("[get_cached_llm_model_info] Cache is empty");
    }
    #[cfg(not(feature = "local_llm"))]
    {
        // log::info!("[get_cached_llm_model_info] local_llm feature not enabled");
    }
    None
}

/// 清理模型缓存（退出前显式调用）
/// 释放 GPU/CPU 内存，确保资源及时回收
pub fn clear_model_cache() {
    #[cfg(feature = "local_llm")]
    {
        log::info!("[LlamaCpp] 开始清理模型缓存...");
        let mut cache = MODEL_CACHE.lock().unwrap();
        let count = cache.len();
        if count > 0 {
            cache.clear();
            log::info!("[LlamaCpp] 已清理 {} 个缓存模型", count);
        } else {
            log::info!("[LlamaCpp] 缓存为空，无需清理");
        }
    }
    #[cfg(not(feature = "local_llm"))]
    {
        log::info!("[LlamaCpp] local_llm feature 未启用，跳过清理");
    }
}

/// 获取或初始化后端
#[cfg(feature = "local_llm")]
fn get_backend() -> &'static LlamaBackend {
    GLOBAL_BACKEND.get_or_init(|| LlamaBackend::init().expect("Failed to initialize llama backend"))
}

/// 获取或加载模型（带缓存）
#[cfg(feature = "local_llm")]
fn get_or_load_model(model_path: &PathBuf, n_gpu_layers: i32) -> Result<Arc<LlamaModel>, String> {
    // 检查缓存（需要考虑 n_gpu_layers，因为不同的 GPU 配置需要重新加载）
    {
        let cache = MODEL_CACHE.lock().unwrap();
        if let Some((_cached_path, cached_layers, model)) = cache
            .iter()
            .find(|(path, _, _)| path == model_path)
            .map(|(path, layers, model)| (path.clone(), *layers, model.clone()))
        {
            // 如果 GPU 层数配置相同，使用缓存
            if cached_layers == n_gpu_layers {
                log::info!(
                    "[LlamaCpp] Using cached model: {:?}, n_gpu_layers={}",
                    model_path,
                    n_gpu_layers
                );
                return Ok(model);
            }
            log::info!("[LlamaCpp] Model cached with different n_gpu_layers (cached={}, new={}), reloading", cached_layers, n_gpu_layers);
        }
    }

    // 加载新模型
    log::info!(
        "[LlamaCpp] Loading model: {:?}, n_gpu_layers={}",
        model_path,
        n_gpu_layers
    );

    // 检查文件是否存在
    if !model_path.exists() {
        return Err(format!("模型文件不存在: {:?}", model_path));
    }

    // 检查文件大小
    let file_size = std::fs::metadata(model_path).map(|m| m.len()).unwrap_or(0);
    log::info!(
        "[LlamaCpp] Model file size: {} bytes ({} MB)",
        file_size,
        file_size / (1024 * 1024)
    );

    let backend = get_backend();

    // 转换 n_gpu_layers: -1 表示全部层，使用 u32::MAX
    let gpu_layers_param = if n_gpu_layers < 0 {
        u32::MAX // llama.cpp 会将其解释为加载所有层
    } else {
        n_gpu_layers as u32
    };

    let model_params = LlamaModelParams::default().with_n_gpu_layers(gpu_layers_param);

    let model = LlamaModel::load_from_file(backend, model_path, &model_params)
        .map_err(|e| format!("模型加载失败: {:?}", e))?;

    let model = Arc::new(model);

    // 更新缓存：清空旧缓存，只保留当前模型
    // 本地 LLM 模型很大，切换时需要卸载旧模型释放内存/VRAM
    {
        let mut cache = MODEL_CACHE.lock().unwrap();

        // 记录卸载的旧模型（用于日志）
        if !cache.is_empty() {
            let old_models: Vec<String> = cache
                .iter()
                .map(|(path, _, _)| {
                    path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string()
                })
                .collect();
            log::info!(
                "[LlamaCpp] Unloading old models to free memory: {:?}",
                old_models
            );
        }

        // 清空缓存，只保留新模型
        cache.clear();
        cache.push((model_path.clone(), n_gpu_layers, model.clone()));
        log::info!(
            "[LlamaCpp] Model cached (cache size limit: {}), current: {:?}",
            MAX_MODEL_CACHE_SIZE,
            model_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
        );
    }

    Ok(model)
}

/// 本地 llama.cpp Provider
pub struct LlamaCppProvider {
    /// 模型文件路径
    model_path: PathBuf,
    /// GPU 层数（-1 = 全部，0 = CPU，>0 = 指定层数）
    n_gpu_layers: i32,
    /// 上下文长度（暂未使用，保留用于未来优化）
    #[allow(dead_code)]
    n_ctx: u32,
}

impl LlamaCppProvider {
    /// 创建新的 llama.cpp Provider
    /// n_gpu_layers: -1 = 全部层加载到 GPU，0 = CPU，>0 = 指定层数
    pub fn new(model_path: PathBuf, n_gpu_layers: i32, n_ctx: u32) -> Self {
        Self {
            model_path,
            n_gpu_layers,
            n_ctx,
        }
    }
}

#[async_trait]
impl LlmProvider for LlamaCppProvider {
    async fn health_check(&self) -> Result<bool, String> {
        #[cfg(feature = "local_llm")]
        {
            Ok(self.model_path.exists())
        }

        #[cfg(not(feature = "local_llm"))]
        {
            Err("local_llm feature 未启用".to_string())
        }
    }

    async fn list_models(&self) -> Result<Vec<String>, String> {
        #[cfg(feature = "local_llm")]
        {
            // 扫描 llm_models 目录，返回所有 .gguf 文件名
            let available_models = crate::llm_models::scan_available_llm_models();
            let model_ids: Vec<String> = available_models.iter().map(|m| m.id.clone()).collect();
            Ok(model_ids)
        }

        #[cfg(not(feature = "local_llm"))]
        {
            Ok(vec![])
        }
    }

    async fn process_text(&self, text: &str, config: &LlmConfig) -> Result<LlmResponse, String> {
        // 调用带进度版本，不传进度通道
        self.process_text_with_progress(text, config, None).await
    }

    async fn process_text_with_progress(
        &self,
        text: &str,
        config: &LlmConfig,
        progress_tx: Option<Sender<LlmProgressEvent>>,
    ) -> Result<LlmResponse, String> {
        #[cfg(not(feature = "local_llm"))]
        {
            return Err("local_llm feature 未启用，请重新编译启用该功能".to_string());
        }

        #[cfg(feature = "local_llm")]
        {
            // 文本长度检查
            // 换算比例：1 中文字符 ≈ 1.5~2 token，保守估计用 2
            // 所以：max_chars = n_ctx / 2
            let char_count = text.chars().count();
            let max_chars = self.n_ctx / 2;

            log::info!(
                "[LlamaCpp] 长度检查: char_count={}, n_ctx={}, max_chars={}",
                char_count,
                self.n_ctx,
                max_chars
            );

            if char_count > max_chars as usize {
                log::warn!(
                    "[LlamaCpp] 文本过长 ({} chars > {} max_chars), 跳过 LLM 处理",
                    char_count,
                    max_chars
                );
                return Ok(LlmResponse {
                    success: false,
                    text: text.to_string(),
                    error: Some(format!(
                        "CONTEXT_TOO_LONG:{}:{}:{}",
                        char_count, max_chars, self.n_ctx
                    )),
                    tokens_used: None,
                });
            }
            log::info!("[LlamaCpp] 长度检查通过，继续处理");

            use llama_cpp_4::model::AddBos;
            use llama_cpp_4::model::Special;
            use std::time::Instant;

            let start = Instant::now();

            // 获取后端（全局初始化一次）
            let backend = get_backend();

            // 获取或加载模型（带缓存）
            let model = get_or_load_model(&self.model_path, self.n_gpu_layers)?;

            log::info!("[LlamaCpp] Model ready, starting generation");

            // 配置上下文参数
            // 使用配置的 n_ctx 值（默认 4096，可根据需要在配置中调整）
            let n_ctx = if self.n_ctx > 0 {
                self.n_ctx
            } else {
                4096 // 默认值
            };
            log::info!("[LlamaCpp] Using n_ctx: {}", n_ctx);
            let ctx_params =
                LlamaContextParams::default().with_n_ctx(std::num::NonZeroU32::new(n_ctx));

            // 创建上下文
            let mut ctx = model
                .new_context(backend, ctx_params)
                .map_err(|e| format!("创建上下文失败: {:?}", e))?;

            // 简化的提示词处理：
            // - 如果提示词包含 {text} 占位符，直接替换，结果作为 user message
            // - 如果不包含，提示词作为 system prompt，用户文本单独作为 user content
            let template = &config.user_prompt_template;
            let (system_prompt, user_content) = if template.contains("{text}") {
                // 有占位符：替换后作为 user message，无 system prompt
                let user_msg = template.replace("{text}", text);
                (String::new(), user_msg)
            } else {
                // 无占位符：提示词作为 system prompt，用户文本简单包装后作为 user content
                let user_msg = format!("<content>\n{}\n</content>", text);
                (template.clone(), user_msg)
            };

            // 详细日志：显示最终发送给LLM的完整内容
            log::info!("═══════════════════════════════════════════════════════════════");
            log::info!("[LlamaCpp] 最终发送给LLM的提示词:");
            log::info!("───────────────────────────────────────────────────────────────");
            log::info!("[System Prompt]:\n{}", system_prompt);
            log::info!("───────────────────────────────────────────────────────────────");
            log::info!("[User Content (包装后的用户文本)]:\n{}", user_content);
            log::info!("───────────────────────────────────────────────────────────────");
            log::info!("[原始用户文本]:\n{}", text);
            log::info!("═══════════════════════════════════════════════════════════════");

            // 检测是否为需要禁用思考的 Qwen3.5 系列模型
            // Qwen3.5-9B 等模型的思考模式会显著增加推理时间，需要特殊处理
            let model_filename = self
                .model_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            // 根据配置文件判断是否需要禁用思考模式
            let needs_disable_thinking = needs_disable_thinking(model_filename);

            // 构建消息列表（用于 apply_chat_template）
            let mut chat_messages: Vec<LlamaChatMessage> = Vec::new();

            // 添加 system message（如果有）
            if !system_prompt.is_empty() {
                chat_messages.push(
                    LlamaChatMessage::new("system".to_string(), system_prompt.clone())
                        .map_err(|e| format!("创建系统消息失败: {:?}", e))?,
                );
            }

            // 添加 user message
            chat_messages.push(
                LlamaChatMessage::new("user".to_string(), user_content.clone())
                    .map_err(|e| format!("创建用户消息失败: {:?}", e))?,
            );

            log::info!("[LlamaCpp] Chat messages count: {}", chat_messages.len());

            // 根据模型类型选择不同的 prompt 构建方式
            let full_prompt = if needs_disable_thinking {
                // Qwen3.5 等需要禁用思考的模型：手动构建 prompt 并预填空思考块
                // 格式: <|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n
                // 参考: https://qwen.readthedocs.io/en/latest/run_locally/llama.cpp
                log::info!(
                    "[LlamaCpp] Detected Qwen3.5 model ({}), using non-thinking template",
                    model_filename
                );
                let mut prompt = String::new();

                if !system_prompt.is_empty() {
                    prompt.push_str(&format!(
                        "<|im_start|>system\n{}<|im_end|>\n",
                        system_prompt
                    ));
                }

                prompt.push_str(&format!("<|im_start|>user\n{}<|im_end|>\n", user_content));

                // 预填空的思考块：告诉模型"思考已完成，直接回答"
                prompt.push_str("<|im_start|>assistant\n<think>\n\n</think>\n\n");
                prompt
            } else {
                // 其他模型：使用 llama.cpp 内置的 chat template
                log::info!(
                    "[LlamaCpp] Using built-in chat template for model: {}",
                    model_filename
                );
                model
                    .apply_chat_template(None, &chat_messages, true)
                    .map_err(|e| format!("应用 Chat Template 失败: {:?}", e))?
            };

            log::info!("[LlamaCpp] Full prompt length: {} chars", full_prompt.len());
            log::info!("[LlamaCpp] Full prompt:\n{}", full_prompt);

            // 对输入进行分词
            // 注意：使用 AddBos::Never，因为 chat template 已经包含了必要的 BOS token
            let tokens = model
                .str_to_token(&full_prompt, AddBos::Never)
                .map_err(|e| format!("分词失败: {:?}", e))?;
            log::info!("[LlamaCpp] 输入 tokens: {}", tokens.len());

            // ====== 关键检查：防止 llama.cpp native assertion crash ======
            // 测试证明：当 tokens 数量超过 n_ctx 或 n_batch 时，llama.cpp 会触发 C++ assertion
            // (GGML_ASSERT)，直接 abort() 进程，无法被 Rust catch_unwind 捕获。
            // 必须在调用 batch.add() 之前进行检查，否则应用会崩溃退出。
            //
            // 有两个限制需要检查：
            // 1. n_batch: 一次性添加超过此数量的 tokens 会触发 GGML_ASSERT
            //    (GGML_ASSERT(n_tokens_all <= cparams.n_batch) failed)
            //    注意：n_batch 的默认值取决于 llama.cpp 版本
            //    从实际运行日志观察到：llama_context: n_batch = 2048（新版本默认值）
            // 2. n_ctx: 上下文总长度限制，需要为输出预留空间
            //
            // 输出预留策略：润色场景下输出长度与输入相近，预留 n_ctx / 8 即可
            // 例如：n_ctx=4096 → 预留512，n_ctx=8192 → 预留1024
            // 这样既保证有足够空间输出，又能最大化利用上下文窗口
            let output_reserve = (n_ctx / 8) as usize;
            let max_by_ctx = (n_ctx as usize).saturating_sub(output_reserve);

            // n_batch 的实际值从 llama.cpp 日志观察得出
            // 新版本 llama.cpp 的 n_batch 默认值是 2048（而非旧版的 512）
            // 注意：这是 llama.cpp 内部参数，LlamaContextParams 不暴露设置接口
            let n_batch: usize = 2048;
            let max_by_batch = n_batch;

            // 最终限制是两者中的较小值
            let max_input_tokens = std::cmp::min(max_by_ctx, max_by_batch);

            log::info!(
                "[LlamaCpp] Precheck: tokens={}, n_ctx={}, n_batch={}, output_reserve={}, max_by_ctx={}, max_by_batch={}, max_input_tokens={}",
                tokens.len(), n_ctx, n_batch, output_reserve, max_by_ctx, max_by_batch, max_input_tokens
            );

            if tokens.len() > max_input_tokens {
                log::warn!(
                    "[LlamaCpp] 输入过长 ({} tokens > max {})，跳过 LLM 处理，返回原文",
                    tokens.len(),
                    max_input_tokens
                );
                log::warn!(
                    "[LlamaCpp] 检查详情: n_ctx={}, n_batch={}, output_reserve={}, max_by_ctx={}, max_by_batch={}",
                    n_ctx, n_batch, output_reserve, max_by_ctx, max_by_batch
                );

                // 返回特殊错误，前端可识别并降级处理
                // 返回原始转录文本（未经 LLM 处理）
                return Ok(LlmResponse {
                    success: false,
                    text: text.to_string(),
                    error: Some(format!(
                        "CONTEXT_TOO_LONG:{}:{}:n_batch={}",
                        tokens.len(),
                        n_ctx,
                        n_batch
                    )),
                    tokens_used: None,
                });
            }

            // 创建批次并添加 tokens
            let n_tokens = tokens.len();
            let mut batch = LlamaBatch::new(n_tokens + config.max_tokens as usize, 1);

            for (i, &token) in tokens.iter().enumerate() {
                batch
                    .add(token, i as i32, &[0], i == n_tokens - 1)
                    .map_err(|e| format!("添加 token 到批次失败: {:?}", e))?;
            }

            // 解码输入
            ctx.decode(&mut batch)
                .map_err(|e| format!("解码失败: {:?}", e))?;

            // 生成输出
            // 对于润色任务，max_tokens 不需要太大（输出长度 ≈ 输入长度）
            // 取 输入长度 * 1.5 和 配置值 的较小者
            let max_tokens = std::cmp::min(
                config.max_tokens as usize,
                (tokens.len() * 3 / 2).max(100), // 至少 100 tokens
            );

            // 关键日志：记录 max_tokens 计算依据
            log::info!(
                "[LlamaCpp] max_tokens 计算: config.max_tokens={}, input_tokens={}, 计算结果 max_tokens={} (取 min({}, {}))",
                config.max_tokens, tokens.len(), max_tokens, config.max_tokens, (tokens.len() * 3 / 2).max(100)
            );

            let mut result_tokens: Vec<LlamaToken> = Vec::new();
            let mut n_generated = 0;
            let mut n_past = n_tokens as i32;

            // 创建采样器链：temperature -> dist（随机采样）
            // 使用配置中的 temperature，seed 使用随机值
            let seed = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as u32;

            // 如果 temperature <= 0，使用贪婪采样（确定性）
            // 否则使用温度 + 随机采样
            let mut sampler = if config.temperature <= 0.0 {
                LlamaSampler::greedy()
            } else {
                LlamaSampler::chain_simple([
                    LlamaSampler::temp(config.temperature),
                    LlamaSampler::dist(seed),
                ])
            };

            log::info!(
                "[LlamaCpp] Using temperature: {}, sampler: {}",
                config.temperature,
                if config.temperature <= 0.0 {
                    "greedy"
                } else {
                    "temp+dist"
                }
            );

            // 生成阶段开始时间
            let gen_start = Instant::now();

            while n_generated < max_tokens {
                // 采样下一个 token
                let new_token = sampler.sample(&ctx, batch.n_tokens() - 1);

                // 检查是否结束
                if model.is_eog_token(new_token) {
                    log::info!(
                        "[LlamaCpp] 生成结束 (EOS token) at n_generated={}, max_tokens={}",
                        n_generated,
                        max_tokens
                    );
                    break;
                }

                result_tokens.push(new_token);
                n_generated += 1;

                // 告诉 sampler 已生成的 token（用于重复惩罚）
                sampler.accept(new_token);

                // 清空批次，添加新 token
                batch.clear();
                batch
                    .add(new_token, n_past, &[0], true)
                    .map_err(|e| format!("添加生成 token 到批次失败: {:?}", e))?;
                n_past += 1;

                ctx.decode(&mut batch)
                    .map_err(|e| format!("解码生成 token 失败: {:?}", e))?;
            }

            // 记录生成结束原因
            let generation_end_reason = if n_generated >= max_tokens {
                "max_tokens reached"
            } else {
                "EOS token"
            };
            log::info!(
                "[LlamaCpp] 生成循环结束: reason={}, n_generated={}, max_tokens={}",
                generation_end_reason,
                n_generated,
                max_tokens
            );

            // 将 tokens 转换为字符串
            let mut result = String::new();
            for token in result_tokens {
                // 检查是否是结束标记（如 <|im_end|>）
                if model.is_eog_token(token) {
                    continue;
                }
                if let Ok(piece) = model.token_to_str(token, Special::Plaintext) {
                    result.push_str(&piece);
                }
            }

            // 清理输出：移除 ChatML 等模板的特殊标记
            let result = result
                .replace("<|im_end|>", "")
                .replace("#####", "")
                .trim()
                .to_string();

            let elapsed = start.elapsed();
            let gen_elapsed = gen_start.elapsed().as_secs_f64();
            log::info!(
                "[LlamaCpp] 生成完成，耗时 {:.2}s (生成阶段 {:.2}s)，输出 {} chars, {} tokens",
                elapsed.as_secs_f64(),
                gen_elapsed,
                result.len(),
                n_generated
            );

            // 发送完成进度
            if let Some(tx) = &progress_tx {
                let _ = tx.try_send(LlmProgressEvent::complete(n_generated as u32, gen_elapsed));
            }

            // 去掉末尾的换行符
            let trimmed_result = result.trim_end_matches('\n');

            Ok(LlmResponse {
                success: true,
                text: trimmed_result.to_string(),
                error: None,
                tokens_used: Some(n_generated as u32),
            })
        }
    }
}
