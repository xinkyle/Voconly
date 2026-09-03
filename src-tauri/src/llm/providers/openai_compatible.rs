//! OpenAI 兼容 Provider 实现
//! 通用实现，支持所有 OpenAI 兼容 API

use async_trait::async_trait;
use std::time::Duration;

use super::super::config::{AuthType, LlmConfig, LlmProviderInstance, ProviderMeta};
use super::super::provider::{LlmProvider, LlmResponse};
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

        // 简化的提示词处理：
        // - 如果提示词包含 {text} 占位符，直接替换，结果作为 user message
        // - 如果不包含，提示词作为 system prompt，用户文本单独作为 user content
        let (system_prompt, user_content) = if config.user_prompt_template.contains("{text}") {
            // 有占位符：替换后作为 user message，无 system prompt
            let user_msg = config.user_prompt_template.replace("{text}", text);
            (String::new(), user_msg)
        } else {
            // 无占位符：提示词作为 system prompt，用户文本简单包装后作为 user content
            let user_msg = format!("<content>\n{}\n</content>", text);
            (config.user_prompt_template.clone(), user_msg)
        };

        // 详细日志：显示最终发送给LLM的完整内容
        log::info!("═══════════════════════════════════════════════════════════════");
        log::info!("[{}] 最终发送给LLM的提示词:", self.meta.label);
        log::info!("───────────────────────────────────────────────────────────────");
        log::info!("[System Prompt]:\n{}", system_prompt);
        log::info!("───────────────────────────────────────────────────────────────");
        log::info!("[User Content (包装后的用户文本)]:\n{}", user_content);
        log::info!("───────────────────────────────────────────────────────────────");
        log::info!("[原始用户文本]:\n{}", text);
        log::info!("═══════════════════════════════════════════════════════════════");

        // 动态计算 max_tokens
        // 对于在线 Provider（非 Ollama）：max_tokens = 输入字符数 * 5
        // 对于 Ollama（本地）：保持原有逻辑
        // 估算：中文字符 ≈ 1.5-2 tokens，保守用 2，所以 char_count * 5 已经足够
        let input_chars = system_prompt.chars().count() + user_content.chars().count();

        // 获取 Provider 实例级别的 max_tokens 配置（优先级高于全局 config）
        let instance_max_tokens = self.instance.max_tokens.unwrap_or(1024);

        let dynamic_max_tokens = if self.meta.id == "ollama" {
            // Ollama 是本地模型，使用 1.5 倍（和 llama_cpp.rs 保持一致）
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
        // 对于 Ollama，添加 options.num_ctx 参数
        let mut body = if self.meta.id == "ollama" {
            let num_ctx = self.instance.context_limit.unwrap_or(4096);
            log::info!("[{}] Ollama options: num_ctx={}", self.meta.label, num_ctx);
            serde_json::json!({
                "model": config.provider.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                "max_tokens": dynamic_max_tokens,
                "temperature": config.temperature,
                "options": {
                    "num_ctx": num_ctx
                }
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
            if let Some(obj) = body.as_object_mut() {
                for (key, value) in params {
                    obj.insert(key, value);
                }
            }
            log::info!(
                "[{}] 禁用思考模式: protocol={:?}, provider={}",
                self.meta.label, protocol, self.meta.id
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

        let result_text = json["choices"][0]["message"]["content"]
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
