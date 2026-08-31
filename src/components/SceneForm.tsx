import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '../types';
import { getLlmPromptPresets } from '../services/llm';
import { createLogger } from '../services/log';
import { getSceneNameFromPromptType } from '../utils/i18n';
import { extractShortcutFromEvent, parseShortcutForDisplay } from '../utils/keyboard';

const log = createLogger('SceneForm');

interface SceneFormProps {
  scene?: Scene | null;
  onSave: (scene: Scene) => void;
  onCancel: () => void;
  existingShortcuts?: string[];
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  setPaused?: (paused: boolean) => void;
}

// 内置提示词类型
const BUILTIN_PROMPT_TYPES = [
  { id: 'lightPolish', labelKey: 'llmConfig.promptTypes.lightPolish' },
  { id: 'translate', labelKey: 'llmConfig.promptTypes.translate' },
  { id: 'professionalPolish', labelKey: 'llmConfig.promptTypes.professionalPolish' },
  { id: 'meetingSecretary', labelKey: 'llmConfig.promptTypes.meetingSecretary' },
];

export default function SceneForm({
  scene,
  onSave,
  onCancel,
  existingShortcuts = [],
  checkConflict,
  setPaused,
}: SceneFormProps) {
  const { t } = useTranslation();
  const [shortcut, setShortcut] = useState(scene?.shortcut || '');
  const [promptType, setPromptType] = useState(scene?.promptType || 'lightPolish');
  const [customPrompt, setCustomPrompt] = useState(scene?.customPrompt || '');
  const [errors, setErrors] = useState<{ shortcut?: string; conflict?: string }>({});
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [customPresets, setCustomPresets] = useState<Record<string, string>>({});
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLButtonElement>(null);
  const setPausedRef = useRef(setPaused);

  // Update setPaused ref
  useEffect(() => {
    setPausedRef.current = setPaused;
  }, [setPaused]);

  // 加载自定义预设
  useEffect(() => {
    const loadPresets = async () => {
      try {
        const presets = await getLlmPromptPresets();
        if (presets?.customPresets) {
          setCustomPresets(presets.customPresets);
        }
      } catch (err) {
        log.error(`Failed to load presets: ${err}`);
      }
    };
    loadPresets();
  }, []);

  useEffect(() => {
    if (scene) {
      setShortcut(scene.shortcut);
      setPromptType(scene.promptType || 'lightPolish');
      setCustomPrompt(scene.customPrompt || '');
    }
  }, [scene]);

  const validate = (): boolean => {
    const newErrors: { shortcut?: string; conflict?: string } = {};

    if (!shortcut.trim()) {
      newErrors.shortcut = t('sceneForm.shortcutRequired');
    }

    // Check for conflicts using the provided checkConflict function or local check
    if (shortcut.trim() && checkConflict) {
      const conflict = checkConflict(shortcut.trim(), scene?.id);
      if (conflict) {
        newErrors.conflict = conflict;
      }
    } else if (shortcut.trim() && !checkConflict) {
      // Fallback: local check if no checkConflict function provided
      const hasConflict = existingShortcuts.some(
        (s) => s === shortcut.trim() && (scene?.shortcut !== shortcut.trim())
      );
      if (hasConflict) {
        newErrors.conflict = t('sceneForm.shortcutConflictLocal');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 点击输入框开始监听快捷键
  const handleInputClick = useCallback(() => {
    // 立即暂停全局快捷键监听（同步操作，避免 keyhook 在 useEffect 执行前捕获按键）
    setPausedRef.current?.(true);
    setIsListening(true);
    setErrors(prev => ({ ...prev, shortcut: undefined }));
  }, []);

  // 监听 isListening 变化，恢复全局监听
  useEffect(() => {
    if (!isListening) {
      // 编辑结束，恢复全局监听
      setPausedRef.current?.(false);
    }
  }, [isListening]);

  // 组件卸载时恢复全局监听
  useEffect(() => {
    return () => {
      setPausedRef.current?.(false);
    };
  }, []);

  // 监听键盘事件
  useEffect(() => {
    if (!isListening) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const newShortcut = extractShortcutFromEvent(e);
      if (!newShortcut) return;

      setShortcut(newShortcut);
      setIsListening(false);
      setConflictWarning(null);

      // Check for conflict
      if (checkConflict) {
        const conflict = checkConflict(newShortcut, scene?.id);
        if (conflict) {
          setConflictWarning(conflict);
        }
      }
    };

    const handleBlur = () => {
      setIsListening(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isListening, checkConflict, scene?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    // 从 promptType 推导场景名称
    const sceneName = getSceneNameFromPromptType(promptType, promptType === 'custom' ? customPrompt : undefined, t, customPresets);

    const sceneData: Scene = {
      id: scene?.id || Date.now().toString(),
      name: sceneName, // 保存推导出的名称
      shortcut: shortcut.trim(),
      model: scene?.model || { modelId: '', quantization: undefined },
      enabled: true, // 场景始终启用
      promptType,
      customPrompt: promptType === 'custom' ? customPrompt : undefined,
    };

    onSave(sceneData);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 animate-scale-in">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {scene ? t('sceneForm.editScene') : t('sceneForm.addScene')}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Shortcut */}
          <div>
            <label htmlFor="shortcut" className="block text-sm font-medium text-gray-700 mb-2">
              {t('sceneForm.shortcut')}
            </label>
            <button
              type="button"
              ref={inputRef}
              onClick={handleInputClick}
              className={`w-full px-4 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 text-left ${
                errors.shortcut || errors.conflict || conflictWarning ? 'border-red-300' : 'border-gray-200'
              } ${isListening ? 'ring-2 ring-amber-400' : ''}`}
            >
              {isListening ? (
                <span className="text-gray-400 animate-pulse">{t('sceneForm.pressKey')}</span>
              ) : shortcut ? (
                (() => {
                  const { prefix, main } = parseShortcutForDisplay(shortcut, t);
                  return prefix ? (
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">{prefix}</span>
                      <span className="font-medium">{main}</span>
                    </span>
                  ) : (
                    <span>{main}</span>
                  );
                })()
              ) : (
                <span className="text-gray-400">{t('sceneForm.shortcutPlaceholder')}</span>
              )}
            </button>
            {(errors.shortcut || errors.conflict || conflictWarning) && (
              <p className="mt-1.5 text-sm text-red-500">
                {errors.shortcut || errors.conflict || conflictWarning}
              </p>
            )}
            {(errors.conflict || conflictWarning) && (
              <p className="mt-1 text-xs text-amber-600">
                {t('sceneForm.shortcutConflictTip')}
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-500">{t('sceneForm.shortcutSupport')}</p>
          </div>

          {/* Prompt Type Selection */}
          <div>
            <label htmlFor="promptType" className="block text-sm font-medium text-gray-700 mb-2">
              {t('llmConfig.scenePrompt')}
            </label>
            <select
              id="promptType"
              value={promptType}
              onChange={(e) => setPromptType(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200"
            >
              {BUILTIN_PROMPT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {t(type.labelKey)}
                </option>
              ))}
              {Object.keys(customPresets).length > 0 && (
                <optgroup label={t('llmConfig.promptTypes.custom')}>
                  {Object.keys(customPresets).map((presetName) => (
                    <option key={presetName} value={presetName}>
                      {presetName}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="custom">{t('llmConfig.promptTypes.custom')}</option>
            </select>
            <p className="mt-1.5 text-xs text-gray-500">{t('sceneForm.promptTypeHint')}</p>
          </div>

          {/* Custom Prompt (only show when "custom" is selected) */}
          {promptType === 'custom' && (
            <div>
              <label htmlFor="customPrompt" className="block text-sm font-medium text-gray-700 mb-2">
                {t('llmConfig.promptPlaceholder')}
              </label>
              <textarea
                id="customPrompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={t('llmConfig.promptPlaceholder')}
                rows={4}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 resize-none"
              />
              <p className="mt-1.5 text-xs text-gray-500">{t('llmConfig.promptTip')}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200 active:scale-95"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 active:scale-95"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}