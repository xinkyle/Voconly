//! LLM Provider 策略模块
//! 处理不同 Provider 的思考模式控制配置

/// 思考模式控制协议
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ThinkingControlProtocol {
    /// OpenAI 风格：reasoning_effort: 'none'
    ReasoningEffort,
    /// DeepSeek/GLM 风格：thinking: { type: 'disabled' }
    ThinkingObject,
    /// Qwen 风格：enable_thinking: false
    EnableThinking,
}

/// 根据 provider ID 返回思考控制协议
/// 这是一个简化版本，直接按 provider 类型判断
/// 返回 None 表示该 provider 不需要处理（如 Gemini, Claude）
pub fn get_thinking_control_protocol(provider_id: &str) -> Option<ThinkingControlProtocol> {
    match provider_id {
        // DeepSeek 风格：使用 thinking 对象
        "deepseek" | "glm" | "kimi" | "minimax" | "doubao" => {
            Some(ThinkingControlProtocol::ThinkingObject)
        }

        // Qwen 风格：使用 enable_thinking 布尔值
        "qwen" => Some(ThinkingControlProtocol::EnableThinking),

        // OpenAI 风格：使用 reasoning_effort
        // 包括: openai, ollama, groq, cerebras, openrouter, custom, yi
        // 以及其他未知 provider
        "openai" | "ollama" | "groq" | "cerebras" | "openrouter" | "custom"
        | "yi" => Some(ThinkingControlProtocol::ReasoningEffort),

        // 这些 provider 走不同的 API 路径，不在这里处理
        "gemini" | "claude" => None,

        // 其他未识别的 provider，使用 OpenAI 风格
        _ => Some(ThinkingControlProtocol::ReasoningEffort),
    }
}

/// 根据协议生成禁用思考的参数
pub fn get_disabled_thinking_options(
    protocol: ThinkingControlProtocol,
) -> serde_json::Map<String, serde_json::Value> {
    let mut map = serde_json::Map::new();

    match protocol {
        ThinkingControlProtocol::ReasoningEffort => {
            map.insert(
                "reasoning_effort".to_string(),
                serde_json::Value::String("none".to_string()),
            );
        }
        ThinkingControlProtocol::ThinkingObject => {
            let mut thinking_obj = serde_json::Map::new();
            thinking_obj.insert(
                "type".to_string(),
                serde_json::Value::String("disabled".to_string()),
            );
            map.insert(
                "thinking".to_string(),
                serde_json::Value::Object(thinking_obj),
            );
        }
        ThinkingControlProtocol::EnableThinking => {
            map.insert("enable_thinking".to_string(), serde_json::Value::Bool(false));
        }
    }

    map
}