/**
 * i18n helper utilities
 */

/**
 * Default scene names (Chinese) from backend config
 * Used to detect and translate default names
 */
const DEFAULT_SCENE_NAMES_ZH: Record<string, string> = {
  '轻度润色': 'scene.defaultNames.quickInput',
  '专业润色': 'scene.defaultNames.accurateInput',
  '翻译': 'scene.defaultNames.translate',
};

/**
 * Translate scene name if it's a default name
 * Otherwise returns the original name
 *
 * @param name - Scene name from backend
 * @param t - Translation function from useTranslation
 * @returns Translated name or original name
 */
export function translateSceneName(
  name: string,
  t: (key: string) => string
): string {
  const i18nKey = DEFAULT_SCENE_NAMES_ZH[name];
  if (i18nKey) {
    return t(i18nKey);
  }
  return name;
}

/**
 * Check if a scene name is a default name
 */
export function isDefaultSceneName(name: string): boolean {
  return name in DEFAULT_SCENE_NAMES_ZH;
}

/**
 * 智能统计文本字数
 * - 中文文本：统计字符数（去除空格）
 * - 英文文本：统计单词数（按空格分割）
 * - 混合文本：根据主要语言选择统计方式
 *
 * @param text - 待统计的文本
 * @returns 字数/单词数
 */
export function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  // 统计中文字符数量
  const chineseChars = text.match(/[一-龥]/g);
  const chineseCount = chineseChars ? chineseChars.length : 0;

  // 统计英文字母数量
  const englishLetters = text.match(/[a-zA-Z]/g);
  const englishLetterCount = englishLetters ? englishLetters.length : 0;

  // 判断主要语言：如果中文字符数 >= 英文字母数，视为中文文本
  if (chineseCount >= englishLetterCount) {
    // 中文模式：统计所有非空格字符
    return text.replace(/\s/g, '').length;
  } else {
    // 英文模式：统计单词数（按空格分割）
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }
}