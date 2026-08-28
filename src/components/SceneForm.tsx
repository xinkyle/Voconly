import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '../types';
import { getLlmPromptPresets } from '../services/llm';
import { createLogger } from '../services/log';

const log = createLogger('SceneForm');

interface SceneFormProps {
  scene?: Scene | null;
  onSave: (scene: Scene) => void;
  onCancel: () => void;
  existingShortcuts?: string[];
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  sceneNames?: Record<string, string>;
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
  sceneNames = {},
}: SceneFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(scene?.name || '');
  const [shortcut, setShortcut] = useState(scene?.shortcut || '');
  const [enabled, setEnabled] = useState(scene?.enabled ?? true);
  const [promptType, setPromptType] = useState(scene?.promptType || 'lightPolish');
  const [customPrompt, setCustomPrompt] = useState(scene?.customPrompt || '');
  const [errors, setErrors] = useState<{ name?: string; shortcut?: string; conflict?: string }>({});
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [customPresets, setCustomPresets] = useState<Record<string, string>>({});

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
      setName(scene.name);
      setShortcut(scene.shortcut);
      setEnabled(scene.enabled);
      setPromptType(scene.promptType || 'lightPolish');
      setCustomPrompt(scene.customPrompt || '');
    }
  }, [scene]);

  const validate = (): boolean => {
    const newErrors: { name?: string; shortcut?: string; conflict?: string } = {};

    if (!name.trim()) {
      newErrors.name = t('sceneForm.sceneNameRequired');
    }

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
        const conflictName = sceneNames[shortcut.trim()] || t('sceneList.title');
        newErrors.conflict = t('sceneForm.shortcutConflict', { shortcut: shortcut.trim(), name: conflictName });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleShortcutChange = (value: string) => {
    setShortcut(value);
    setConflictWarning(null);

    // Check for conflict in real-time
    if (value.trim() && checkConflict) {
      const conflict = checkConflict(value.trim(), scene?.id);
      if (conflict) {
        setConflictWarning(conflict);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const sceneData: Scene = {
      id: scene?.id || Date.now().toString(),
      name: name.trim(),
      shortcut: shortcut.trim(),
      model: scene?.model || { modelId: '', quantization: undefined },
      enabled,
      promptType,
      customPrompt: promptType === 'custom' ? customPrompt : undefined,
    };

    onSave(sceneData);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent input of special keys, only allow single character
    if (e.key.length === 1 || e.key === 'Backspace') {
      // Allow single characters
    } else if (e.key === 'Tab') {
      // Allow tab
    } else if (e.key.startsWith('F') && !isNaN(Number(e.key.slice(1)))) {
      // Allow function keys like F1, F2
    } else {
      e.preventDefault();
    }
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
          {/* Scene Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              {t('sceneForm.sceneName')}
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sceneForm.sceneNamePlaceholder')}
              className={`w-full px-4 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ${
                errors.name ? 'border-red-300' : 'border-gray-200'
              }`}
            />
            {errors.name && (
              <p className="mt-1.5 text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Shortcut */}
          <div>
            <label htmlFor="shortcut" className="block text-sm font-medium text-gray-700 mb-2">
              {t('sceneForm.shortcut')}
            </label>
            <input
              type="text"
              id="shortcut"
              value={shortcut}
              onChange={(e) => handleShortcutChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('sceneForm.shortcutPlaceholder')}
              maxLength={3}
              className={`w-full px-4 py-3 bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ${
                errors.shortcut || errors.conflict || conflictWarning ? 'border-red-300' : 'border-gray-200'
              }`}
            />
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
              {t('llmConfig.userPrompt')}
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

          {/* Enabled Toggle */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
            />
            <label htmlFor="enabled" className="ml-2.5 text-sm text-gray-700">
              {t('sceneForm.enableScene')}
            </label>
          </div>

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