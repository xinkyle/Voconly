import type { UserPromptPresets } from '../types';

export const BUILTIN_PROMPTS = ['lightPolish', 'translate', 'optimizePrompt', 'professionalPolish', 'meetingSecretary'] as const;
type Translate = (key: string) => string;

export function getPromptOptions(presets: Partial<UserPromptPresets> | undefined, t: Translate) {
  return [
    ...BUILTIN_PROMPTS.map(id => ({ id, name: t(`llmConfig.promptTypes.${id}`) })),
    ...Object.keys(presets?.customPresets || {}).filter(id => !BUILTIN_PROMPTS.includes(id as typeof BUILTIN_PROMPTS[number]))
      .map(id => ({ id, name: id })),
  ];
}

export function resolvePrompt(id: string, presets: Partial<UserPromptPresets> | undefined, t: Translate): string | undefined {
  if (BUILTIN_PROMPTS.includes(id as typeof BUILTIN_PROMPTS[number])) {
    const key = id as typeof BUILTIN_PROMPTS[number];
    return presets?.[key]?.trim() ? presets[key] : t(`llmConfig.presets.${key}`);
  }
  return presets?.customPresets?.[id]?.trim() ? presets.customPresets[id] : undefined;
}
