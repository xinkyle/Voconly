/**
 * i18n helper utilities
 */

/**
 * Default scene names (Chinese) from backend config
 * Used to detect and translate default names
 */
const DEFAULT_SCENE_NAMES_ZH: Record<string, string> = {
  '快速录入': 'scene.defaultNames.quickInput',
  '准确录入': 'scene.defaultNames.accurateInput',
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