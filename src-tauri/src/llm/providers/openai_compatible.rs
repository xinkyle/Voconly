//! OpenAI 兼容 Provider 实现
//! 通用实现，支持所有 OpenAI 兼容 API

use async_trait::async_trait;
use std::time::Duration;

use super::super::config::{AuthType, LlmConfig, LlmProviderInstance, ProviderMeta};
use super::super::provider::{LlmProvider, LlmResponse};
use super::super::migrate_prompt;
use super::policy::{get_disabled_thinking_options, get_thinking_control_protocol};

/// OpenAI 兼容 Provider
pub struct OpenAiCompatibleProvider {
    meta: ProviderMeta,
    instance: LlmProviderInstance,
    client: reqwest::Client,
}

impl OpenAiCompatibleProvider {
    /// 创建新的 OpenAI 兼容 Provider
    pub fn new(meta: ProviderMeta, instance: LlmProviderInstance) -> Self {
        Self {
            client: reqwest::Client::new(),
            meta,
            instance,
        }
    }

    /// 获取基础 URL（去除尾部斜杠）
    fn base_url(&self) -> &str {
        self.instance.base_url.trim_end_matches('/')
    }

    /// 构建认证请求
    fn build_auth_request(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.meta.auth_type {
            AuthType::None => request,
            AuthType::Bearer => {
                if let Some(api_key) = &self.instance.api_key {
                    request.bearer_auth(api_key)
                } else {
                    request
                }
            }
            AuthType::XApiKey => {
                if let Some(api_key) = &self.instance.api_key {
                    request.header("x-api-key", api_key)
                } else {
                    request
                }
            }
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAiCompatibleProvider {
    async fn health_check(&self) -> Result<bool, String> {
        // 对于 Ollama，使用原生 API 端点（去掉 /v1 前缀）
        if self.meta.id == "ollama" {
            // 去掉 /v1 后缀，使用原生 Ollama API
            let base = self.base_url().trim_end_matches("/v1");
            let url = format!("{}/api/tags", base);
            log::info!("[{}] Health check URL: {}", self.meta.label, url);
            let resp = self
                .client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("连接失败: {}", e))?;
            log::info!(
                "[{}] Health check response status: {}",
                self.meta.label,
                resp.status()
            );
            return Ok(resp.status().is_success());
        }

        // 对于其他 Provider，尝试获取模型列表
        let url = format!("{}/models", self.base_url());
        log::info!("[{}] Health check URL: {}", self.meta.label, url);

        let request = self.client.get(&url);
        let resp = self
            .build_auth_request(request)
            .send()
            .await
            .map_err(|e| format!("连接失败: {}", e))?;

        log::info!(
            "[{}] Health check response status: {}",
            self.meta.label,
            resp.status()
        );
        Ok(resp.status().is_success())
    }

    async fn list_models(&self) -> Result<Vec<String>, String> {
        // 对于 Ollama，使用原生 API 端点（去掉 /v1 前缀）
        if self.meta.id == "ollama" {
            // 去掉 /v1 后缀，使用原生 Ollama API
            let base = self.base_url().trim_end_matches("/v1");
            let url = format!("{}/api/tags", base);
            log::info!("[{}] List models URL: {}", self.meta.label, url);
            let resp = self
                .client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("获取模型列表失败: {}", e))?;

            let json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("解析响应失败: {}", e))?;

            let models = json["models"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m["name"].as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            log::info!("[{}] Parsed models: {:?}", self.meta.label, models);
            return Ok(models);
        }

        // 对于其他 Provider，使用 OpenAI 兼容的 /models 端点
        let url = format!("{}/models", self.base_url());
        log::info!("[{}] List models URL: {}", self.meta.label, url);

        let request = self.client.get(&url);
        let resp = self
            .build_auth_request(request)
            .send()
            .await
            .map_err(|e| format!("获取模型列表失败: {}", e))?;

        log::info!(
            "[{}] List models response status: {}",
            self.meta.label,
            resp.status()
        );

        if !resp.status().is_success() {
            let error = resp.text().await.unwrap_or_default();
            log::warn!("[{}] List models error: {}", self.meta.label, error);
            return Ok(vec![]);
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let models = json["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m["id"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        log::info!("[{}] Parsed models: {:?}", self.meta.label, models);
        Ok(models)
    }

    async fn process_text(&self, text: &str, config: &LlmConfig) -> Result<LlmResponse, String> {
        // 文本长度检查（本地 Provider）
        // 换算比例：1 中文字符 ≈ 1.5~2 token，保守估计用 2
        // 所以：max_chars = context_limit / 2
        let char_count = text.chars().count();
        let context_limit = self.instance.context_limit;

        log::info!(
            "[{}] 长度检查: char_count={}, context_limit={:?}, provider_id={}",
            self.meta.label,
            char_count,
            context_limit,
            self.meta.id
        );

        if let Some(limit) = context_limit {
            let max_chars = limit / 2;
            log::info!(
                "[{}] 长度判断: {} chars vs {} max_chars (limit={} tokens)",
                self.meta.label,
                char_count,
                max_chars,
                limit
            );
            if char_count > max_chars as usize {
                log::warn!(
                    "[{}] 文本过长 ({} chars > {} max_chars), 跳过 LLM 处理",
                    self.meta.label,
                    char_count,
                    max_chars
                );
                return Ok(LlmResponse {
                    success: false,
                    text: text.to_string(),
                    error: Some(format!(
                        "CONTEXT_TOO_LONG:{}:{}:{}",
                        char_count, max_chars, limit
                    )),
                    tokens_used: None,
                });
            }
            log::info!("[{}] 长度检查通过，继续处理", self.meta.label);
        } else {
            log::info!("[{}] context_limit 未设置，跳过长度检查", self.meta.label);
        }

        // 对于 Ollama，确保使用 /v1/chat/completions（OpenAI 兼容 API）
        let url = if self.meta.id == "ollama" {
            let base = self.base_url();
            // 如果 base_url 不包含 /v1，添加它
            if base.ends_with("/v1") {
                format!("{}/chat/completions", base)
            } else {
                format!("{}/v1/chat/completions", base)
            }
        } else {
            format!("{}/chat/completions", self.base_url())
        };

        log::info!("[{}] Process text URL: {}", self.meta.label, url);

        // 提示词处理：
        // - 系统提示词定义模型的角色和任务
        // - 用户文本作为待处理内容
        let system_prompt = migrate_prompt(&config.system_prompt);

        // 空提示词处理：跳过 LLM，返回原文
        if system_prompt.is_empty() {
            log::info!("[{}] No system prompt configured, returning original text", self.meta.label);
            return Ok(LlmResponse {
                success: true,
                text: text.to_string(),
                error: None,
                tokens_used: None,
            });
        }

        // 用户内容包装（帮助模型区分指令和待处理内容）
        let user_content = format!("<content>\n{}\n</content>", text);

        // 详细日志：显示最终发送给LLM的完整内容
        log::info!("═══════════════════════════════════════════════════════════════");
        log::info!("[{}] 最终发送给LLM的提示词:", self.meta.label);
        log::info!("───────────────────────────────────────────────────────────────");
        log::info!("[System Prompt]:\n{}", system_prompt);
        log::info!("───────────────────────────────────────────────────────────────");
        log::info!("[User Content]:\n{}", user_content);
        log::info!("═══════════════════════════════════════════════════════════════");

        // 动态计算 max_tokens
        // 对于在线 Provider（非 Ollama）：max_tokens = 输入字符数 * 5
        // 对于 Ollama（本地）：保持原有逻辑
        // 估算：中文字符 ≈ 1.5-2 tokens，保守用 2，所以 char_count * 5 已经足够
        let input_chars = system_prompt.chars().count() + user_content.chars().count();

        // 获取 Provider 实例级别的 max_tokens 配置（优先级高于全局 config）
        let instance_max_tokens = self.instance.max_tokens.unwrap_or(1024);

        let dynamic_max_tokens = if self.meta.id == "ollama" {
            // Ollama 是本地模型，使用 1.5 倍
            // 但也要考虑 context_limit 和 instance.max_tokens
            let computed = (input_chars * 3 / 2).max(100) as u32;
            let limit = self.instance.context_limit.unwrap_or(4096);
            computed.min(limit).min(instance_max_tokens)
        } else {
            // 在线 Provider，使用 5 倍，保证 reasoning 模型有足够空间
            // 保守估计：char_count * 5 ≈ token_count * 2.5（考虑中文字符 ≈ 2 tokens）
            let computed = (input_chars * 5) as u32;
            // 使用 instance.max_tokens 作为上限（默认 16384）
            computed.min(instance_max_tokens.max(16384))
        };

        log::info!(
            "[{}] 动态 max_tokens: input_chars={}, computed={}, final={}",
            self.meta.label,
            input_chars,
            input_chars * 5,
            dynamic_max_tokens
        );

        // 构建请求体
        // 对于 Ollama，添加 options.num_ctx、options.num_gpu 和 keep_alive 参数
        let mut body = if self.meta.id == "ollama" {
            let num_ctx = self.instance.context_limit.unwrap_or(4096);
            let num_gpu = -1; // 自动检测 GPU
            let keep_alive = if self.instance.keep_alive.is_empty() {
                "5m".to_string()
            } else {
                self.instance.keep_alive.clone()
            };

            log::info!(
                "[{}] Ollama options: num_ctx={}, num_gpu={}, keep_alive={}",
                self.meta.label, num_ctx, num_gpu, keep_alive
            );

            serde_json::json!({
                "model": config.provider.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                "max_tokens": dynamic_max_tokens,
                "temperature": config.temperature,
                "options": {
                    "num_ctx": num_ctx,
                    "num_gpu": num_gpu
                },
                "keep_alive": keep_alive
            })
        } else {
            serde_json::json!({
                "model": config.provider.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                "max_tokens": dynamic_max_tokens,
                "temperature": config.temperature,
            })
        };

        // 应用思考模式控制策略
        // 对于在线 Provider，自动禁用思考模式以提高响应速度
        if let Some(protocol) = get_thinking_control_protocol(&self.meta.id) {
            let params = get_disabled_thinking_options(protocol);
            let params_preview: Vec<String> = params
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect();

            if let Some(obj) = body.as_object_mut() {
                for (key, value) in params {
                    obj.insert(key, value);
                }
            }

            log::info!(
                "🔧 [{}] 禁用思考模式: protocol={:?}, 添加参数: [{}]",
                self.meta.label,
                protocol,
                params_preview.join(", ")
            );
        } else {
            log::debug!(
                "[{}] Provider {} 不需要思考模式控制（使用不同 API）",
                self.meta.label, self.meta.id
            );
        }

        log::info!(
            "[{}] Full request body: {}",
            self.meta.label,
            serde_json::to_string_pretty(&body).unwrap_or_else(|_| "serialize error".to_string())
        );

        let request = self
            .client
            .post(&url)
            .json(&body)
            .timeout(Duration::from_secs(config.provider.timeout_secs));

        let resp = self
            .build_auth_request(request)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            let error = resp.text().await.unwrap_or_default();
            return Err(format!("API 错误: {}", error));
        }

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        log::info!(
            "[{}] API response JSON: {}",
            self.meta.label,
            serde_json::to_string_pretty(&json).unwrap_or_else(|_| "serialize error".to_string())
        );

        // 检测响应中是否包含思考内容（用于调试禁用思考策略是否生效）
        // DeepSeek 等 API 会在 message 中返回 reasoning_content 字段
        let message = &json["choices"][0]["message"];
        let reasoning_content = message.get("reasoning_content").and_then(|v| v.as_str());
        let has_reasoning = reasoning_content.is_some_and(|s| !s.is_empty());

        if has_reasoning {
            let reasoning_text = reasoning_content.unwrap();
            log::warn!(
                "⚠️ [{}] 检测到思考内容! 禁用思考策略可能未生效。reasoning_content 长度: {}, 预览: {}",
                self.meta.label,
                reasoning_text.len(),
                reasoning_text.chars().take(100).collect::<String>()
            );
        } else {
            log::debug!(
                "✓ [{}] 未检测到思考内容，禁用思考策略可能已生效",
                self.meta.label
            );
        }

        let result_text = message["content"]
            .as_str()
            .map(String::from)
            .ok_or("无法提取响应文本")?;

        log::info!(
            "[{}] Extracted result_text length: {}, content preview: {}",
            self.meta.label,
            result_text.len(),
            result_text.chars().take(100).collect::<String>()
        );

        // 去掉末尾的换行符
        let trimmed_text = result_text.trim_end_matches('\n');

        log::info!(
            "[{}] Final trimmed_text length: {}",
            self.meta.label,
            trimmed_text.len()
        );

        Ok(LlmResponse {
            success: true,
            text: trimmed_text.to_string(),
            error: None,
            tokens_used: json["usage"]["total_tokens"].as_u64().map(|n| n as u32),
        })
    }
}
