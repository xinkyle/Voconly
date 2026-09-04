//! LLM 模块公共工具函数

/// 空字符串转 None 的辅助函数
pub fn empty_to_none(s: &str) -> Option<&str> {
    if s.is_empty() { None } else { Some(s) }
}

/// 迁移旧格式提示词（移除末尾的 {text} 占位符）
///
/// 用于兼容旧版提示词格式，确保旧配置无需手动修改即可正常工作
pub fn migrate_prompt(prompt: &str) -> String {
    // 如果提示词以 {text} 结尾（旧格式），移除它
    if prompt.trim().ends_with("{text}") {
        prompt.trim().trim_end_matches("{text}").trim().to_string()
    } else {
        prompt.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_to_none() {
        assert_eq!(empty_to_none(""), None);
        assert_eq!(empty_to_none("test"), Some("test"));
        assert_eq!(empty_to_none("  "), Some("  ")); // 不trim
    }

    #[test]
    fn test_migrate_prompt() {
        // 带占位符的旧格式
        assert_eq!(migrate_prompt("润色文本 {text}"), "润色文本");
        assert_eq!(migrate_prompt("润色文本{text}"), "润色文本");
        assert_eq!(migrate_prompt("  润色文本 {text}  "), "润色文本");

        // 新格式（无占位符）
        assert_eq!(migrate_prompt("润色文本"), "润色文本");
        assert_eq!(migrate_prompt("润色文本 {text1}"), "润色文本 {text1}");

        // 边界情况
        assert_eq!(migrate_prompt(""), "");
        assert_eq!(migrate_prompt("{text}"), "");
        assert_eq!(migrate_prompt("  {text}  "), "");
    }
}