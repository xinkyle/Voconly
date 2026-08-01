//! 词典匹配器
//! 实现基于编辑距离和 Soundex 的模糊匹配

use crate::dictionary::DictionaryEntry;

/// 计算两个字符串的 Levenshtein 编辑距离
fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    if a_len == 0 {
        return b_len;
    }
    if b_len == 0 {
        return a_len;
    }

    let mut matrix = vec![vec![0; b_len + 1]; a_len + 1];

    for i in 0..=a_len {
        matrix[i][0] = i;
    }
    for j in 0..=b_len {
        matrix[0][j] = j;
    }

    for i in 1..=a_len {
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            matrix[i][j] = (matrix[i - 1][j] + 1) // 删除
                .min(matrix[i][j - 1] + 1) // 插入
                .min(matrix[i - 1][j - 1] + cost); // 替换
        }
    }

    matrix[a_len][b_len]
}

/// 计算 Soundex 发音编码
/// 用于判断两个单词的发音是否相似
fn soundex(s: &str) -> String {
    let s = s.to_lowercase();
    let chars: Vec<char> = s.chars().collect();

    if chars.is_empty() {
        return "".to_string();
    }

    // 保留首字母
    let first = chars[0].to_ascii_uppercase();
    let mut result = vec![first];

    // 映射规则
    let get_code = |c: char| -> Option<char> {
        match c {
            'b' | 'f' | 'p' | 'v' => Some('1'),
            'c' | 'g' | 'j' | 'k' | 'q' | 's' | 'x' | 'z' => Some('2'),
            'd' | 't' => Some('3'),
            'l' => Some('4'),
            'm' | 'n' => Some('5'),
            'r' => Some('6'),
            _ => None, // a, e, i, o, u, h, w, y 被忽略
        }
    };

    let mut prev_code = get_code(chars[0]);

    for &c in chars.iter().skip(1) {
        if let Some(code) = get_code(c) {
            if prev_code != Some(code) {
                result.push(code);
                if result.len() >= 4 {
                    break;
                }
            }
            prev_code = Some(code);
        } else if c == 'h' || c == 'w' {
            // h, w 不影响编码，但不重置 prev_code
        } else {
            prev_code = None;
        }
    }

    // 填充到4位
    while result.len() < 4 {
        result.push('0');
    }

    result.into_iter().take(4).collect()
}

/// 提取单词前后的标点符号
fn extract_punctuation(word: &str) -> (String, String, String) {
    let chars: Vec<char> = word.chars().collect();

    let mut prefix_len = 0;
    for &c in &chars {
        if c.is_alphanumeric() {
            break;
        }
        prefix_len += 1;
    }

    let mut suffix_len = 0;
    for &c in chars.iter().rev() {
        if c.is_alphanumeric() {
            break;
        }
        suffix_len += 1;
    }

    // 确保 core 的起始索引不大于结束索引
    let core_end = chars.len().saturating_sub(suffix_len);
    let core_start = prefix_len.min(core_end);

    let prefix: String = chars[..prefix_len].iter().collect();
    let core: String = chars[core_start..core_end].iter().collect();
    let suffix: String = chars[chars.len().saturating_sub(suffix_len)..]
        .iter()
        .collect();

    (prefix, core, suffix)
}

/// 保留原始单词的大小写模式
fn preserve_case(original: &str, replacement: &str) -> String {
    if original.chars().all(|c| c.is_uppercase()) {
        replacement.to_uppercase()
    } else if original
        .chars()
        .next()
        .map(|c| c.is_uppercase())
        .unwrap_or(false)
    {
        let mut chars: Vec<char> = replacement.chars().collect();
        if let Some(first) = chars.first_mut() {
            *first = first.to_uppercase().next().unwrap_or(*first);
        }
        chars.into_iter().collect()
    } else {
        replacement.to_lowercase()
    }
}

/// 词典匹配器
pub struct DictionaryMatcher {
    entries: Vec<DictionaryEntry>,
    threshold: f32,
}

impl DictionaryMatcher {
    /// 创建新的匹配器
    pub fn new(entries: &[DictionaryEntry], threshold: f32) -> Self {
        Self {
            entries: entries.to_vec(),
            threshold,
        }
    }

    /// 计算匹配得分 (0.0-1.0)，越小越相似
    fn calculate_score(&self, candidate: &str, target: &str) -> f32 {
        let candidate_lower = candidate.to_lowercase();
        let target_lower = target.to_lowercase();

        // 编辑距离归一化
        // 注意：使用 chars().count() 计算字符数，而非 len()（字节长度）
        // 中文字符 UTF-8 编码占 3 字节，使用字节长度会导致归一化错误
        let dist = levenshtein_distance(&candidate_lower, &target_lower);
        let max_len = candidate_lower
            .chars()
            .count()
            .max(target_lower.chars().count());
        if max_len == 0 {
            return 0.0;
        }
        let normalized = dist as f32 / max_len as f32;

        // Soundex 发音匹配给予 70% 优惠
        // 注意：Soundex 是英文发音编码算法，对中文无效，只对纯英文文本应用
        let is_english = |s: &str| s.chars().all(|c| c.is_ascii_alphabetic());

        if is_english(&candidate_lower) && is_english(&target_lower) {
            if soundex(&candidate_lower) == soundex(&target_lower) {
                normalized * 0.3
            } else {
                normalized
            }
        } else {
            // 中文或其他非英文字符不应用 Soundex 优惠
            normalized
        }
    }

    /// 查找最佳匹配的词条
    fn find_best_match(&self, word: &str) -> Option<String> {
        let word_lower = word.to_lowercase();
        let mut best_match: Option<(String, f32)> = None;

        for entry in &self.entries {
            // 检查词条本身
            let score = self.calculate_score(&word_lower, &entry.word);
            if score < self.threshold {
                match &best_match {
                    None => best_match = Some((entry.word.clone(), score)),
                    Some((_, best_score)) if score < *best_score => {
                        best_match = Some((entry.word.clone(), score));
                    }
                    _ => {}
                }
            }

            // 检查别名
            for alias in &entry.aliases {
                let alias_score = self.calculate_score(&word_lower, alias);
                if alias_score < self.threshold {
                    match &best_match {
                        None => best_match = Some((entry.word.clone(), alias_score)),
                        Some((_, best_score)) if alias_score < *best_score => {
                            best_match = Some((entry.word.clone(), alias_score));
                        }
                        _ => {}
                    }
                }
            }
        }

        best_match.map(|(word, _)| word)
    }

    /// 对文本应用词典修正
    pub fn apply(&self, text: &str) -> String {
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut result = Vec::new();
        let mut i = 0;

        while i < words.len() {
            let mut matched = false;

            // 从长到短尝试 N-gram (3 → 2 → 1)
            for n in (1..=3).rev() {
                if i + n > words.len() {
                    continue;
                }

                // 组合 n 个词
                let ngram: String = words[i..i + n].join("");

                // 尝试匹配
                if let Some(replacement) = self.find_best_match(&ngram) {
                    // 保留第一个单词的大小写
                    let preserved = preserve_case(words[i], &replacement);
                    result.push(preserved);
                    i += n;
                    matched = true;
                    break;
                }
            }

            if !matched {
                // 尝试对单个词匹配（保留标点）
                let (prefix, core, suffix) = extract_punctuation(words[i]);

                if !core.is_empty() {
                    if let Some(replacement) = self.find_best_match(&core) {
                        let preserved = preserve_case(&core, &replacement);
                        result.push(format!("{}{}{}", prefix, preserved, suffix));
                        i += 1;
                        matched = true;
                    }
                }

                if !matched {
                    result.push(words[i].to_string());
                    i += 1;
                }
            }
        }

        result.join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_levenshtein_distance() {
        assert_eq!(levenshtein_distance("hello", "hello"), 0);
        assert_eq!(levenshtein_distance("hello", "helo"), 1);
        assert_eq!(levenshtein_distance("kitten", "sitting"), 3);
        // 中文测试
        assert_eq!(levenshtein_distance("你好", "你好"), 0);
        assert_eq!(levenshtein_distance("你好", "你好呀"), 1);
    }

    #[test]
    fn test_soundex() {
        assert_eq!(soundex("Robert"), "R163");
        assert_eq!(soundex("Rupert"), "R163");
        assert_eq!(soundex("Rubin"), "R150");
        // 中文 Soundex 测试 - 中文不应该获得发音优惠
        assert_eq!(soundex("你好"), "N000");
        assert_eq!(soundex("你好呀"), "N000");
    }

    #[test]
    fn test_matcher_english() {
        let entries = vec![
            DictionaryEntry {
                word: "ChatGPT".to_string(),
                aliases: vec![],
            },
            DictionaryEntry {
                word: "OpenAI".to_string(),
                aliases: vec![],
            },
        ];
        let matcher = DictionaryMatcher::new(&entries, 0.18);

        // Test N-gram matching
        assert_eq!(matcher.apply("use Chat G P T"), "use ChatGPT");
        assert_eq!(matcher.apply("Open AI API"), "OpenAI API");
    }

    #[test]
    fn test_matcher_chinese_no_false_match() {
        // 关键测试：验证中文不会因为字节长度 bug 而误匹配
        let entries = vec![DictionaryEntry {
            word: "你好".to_string(),
            aliases: vec![],
        }];
        let matcher = DictionaryMatcher::new(&entries, 0.13);

        // "你好今天天气很好" 不应该被替换成 "你好"
        // 修复前：因为字节长度 bug，得分 = 8/30 * 0.3 = 0.08 < 0.13，错误匹配
        // 修复后：得分 = 8/10 = 0.8 > 0.13，正确不匹配
        let result = matcher.apply("你好今天天气很好");
        assert_eq!(result, "你好今天天气很好");

        // 只有真正相似的内容才应该匹配
        // "你好" 匹配 "你好" (距离=0)
        let result2 = matcher.apply("你好");
        assert_eq!(result2, "你好");

        // "你号" (距离=1) 匹配 "你好" (得分=1/2=0.5 > 0.13, 不匹配)
        let result3 = matcher.apply("你号");
        assert_eq!(result3, "你号");
    }

    #[test]
    fn test_matcher_chinese_threshold_boundary() {
        // 测试阈值边界情况
        let entries = vec![DictionaryEntry {
            word: "你好".to_string(),
            aliases: vec![],
        }];
        // 使用较高阈值 0.5，此时 "你号" 应该匹配 (得分=0.5)
        let matcher = DictionaryMatcher::new(&entries, 0.5);
        let result = matcher.apply("你号");
        assert_eq!(result, "你好");
    }

    #[test]
    fn test_calculate_score_chinese() {
        let entries = vec![DictionaryEntry {
            word: "你好".to_string(),
            aliases: vec![],
        }];
        let matcher = DictionaryMatcher::new(&entries, 0.13);

        // 验证得分计算：使用字符数而非字节
        // "你好今天天气很好" vs "你好": 距离=8, max_len=10 (字符), 得分=0.8
        let score = matcher.calculate_score("你好今天天气很好", "你好");
        // 期望：8/10 = 0.8 (不再应用 Soundex 优惠)
        assert!((score - 0.8).abs() < 0.01);
    }
}
