import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserPromptType, UserPromptPresets } from '../../types';
import { getLlmPromptPresets, saveLlmPromptPresets } from '../../services/llm';
import { createLogger } from '../../services/log';
import { useToast } from '../ui/Toast';

const log = createLogger('SettingsPrompt');

// 内置提示词类型
const BUILTIN_PROMPT_TYPES: UserPromptType[] = ['LightPolish', 'Translate', 'ProfessionalPolish', 'MeetingSecretary'];

// Prompt type labels
const getPromptTypeLabel = (type: UserPromptType | string, t: (key: string) => string): string => {
  if (type === 'LightPolish') return t('llmConfig.promptTypes.lightPolish');
  if (type === 'Translate') return t('llmConfig.promptTypes.translate');
  if (type === 'ProfessionalPolish') return t('llmConfig.promptTypes.professionalPolish');
  if (type === 'MeetingSecretary') return t('llmConfig.promptTypes.meetingSecretary');
  if (type === 'Custom') return t('llmConfig.promptTypes.custom');
  return type;
};

// 内置预设的 key 类型
type BuiltinPresetKey = 'lightPolish' | 'translate' | 'professionalPolish' | 'meetingSecretary';

// Helper: Get default presets from i18n
const getDefaultPresets = (t: (key: string) => string): UserPromptPresets => ({
  lightPolish: t('llmConfig.presets.lightPolish'),
  translate: t('llmConfig.presets.translate'),
  professionalPolish: t('llmConfig.presets.professionalPolish'),
  meetingSecretary: t('llmConfig.presets.meetingSecretary'),
  customPresets: {},
});

// Helper: Convert frontend display type to backend preset key
const frontendTypeToBackendKey = (type: UserPromptType): BuiltinPresetKey => {
  switch (type) {
    case 'LightPolish': return 'lightPolish';
    case 'Translate': return 'translate';
    case 'ProfessionalPolish': return 'professionalPolish';
    case 'MeetingSecretary': return 'meetingSecretary';
    default: return 'lightPolish';
  }
};

// Helper: Remove {text} placeholder from prompt for display
const removeTextPlaceholder = (prompt: string): string => {
  return prompt.replace(/\s*\{text\}\s*$/g, '').replace(/\s*\{text\}\s*/g, ' ');
};

// Helper: Add {text} placeholder to prompt for storage
const addTextPlaceholder = (prompt: string): string => {
  const trimmed = prompt.trim();
  if (!trimmed) return '{text}';
  if (trimmed.endsWith('{text}')) return trimmed;
  return `${trimmed} {text}`;
};

export default function SettingsPrompt() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 当前选中的预设类型
  const [selectedType, setSelectedType] = useState<UserPromptType | string>('LightPolish');

  // 预设数据
  const [presets, setPresets] = useState<UserPromptPresets>({
    lightPolish: '',
    translate: '',
    professionalPolish: '',
    meetingSecretary: '',
    customPresets: {},
  });

  // 当前编辑的提示词内容
  const [currentPromptValue, setCurrentPromptValue] = useState('');

  // 添加新预设状态
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // 加载预设数据
  useEffect(() => {
    const loadPresets = async () => {
      setLoading(true);
      try {
        const defaultPresets = getDefaultPresets(t);
        const savedPresets = await getLlmPromptPresets();

        let loadedPresets: UserPromptPresets = defaultPresets;
        if (savedPresets) {
          loadedPresets = {
            ...defaultPresets,
            customPresets: savedPresets.customPresets || {},
          };
          // 只有非空才覆盖内置预设
          const builtinKeys: BuiltinPresetKey[] = ['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'];
          for (const key of builtinKeys) {
            if (savedPresets[key] && savedPresets[key].trim()) {
              loadedPresets[key] = savedPresets[key];
            }
          }
        }

        setPresets(loadedPresets);

        // 设置初始显示内容
        const key = frontendTypeToBackendKey('LightPolish');
        setCurrentPromptValue(removeTextPlaceholder(loadedPresets[key] || defaultPresets[key]));
      } catch (err) {
        log.error(`Failed to load presets: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    loadPresets();
  }, [t]);

  // 切换预设类型
  const handleTypeChange = (type: UserPromptType | string) => {
    setSelectedType(type);

    if (BUILTIN_PROMPT_TYPES.includes(type as UserPromptType)) {
      const key = frontendTypeToBackendKey(type as UserPromptType);
      setCurrentPromptValue(removeTextPlaceholder(presets[key] || ''));
    } else {
      // 自定义预设
      const customValue = presets.customPresets?.[type] || '';
      setCurrentPromptValue(removeTextPlaceholder(customValue));
    }
  };

  // 更新提示词内容
  const handlePromptChange = (value: string) => {
    setCurrentPromptValue(value);

    const valueWithPlaceholder = addTextPlaceholder(value);

    if (BUILTIN_PROMPT_TYPES.includes(selectedType as UserPromptType)) {
      const presetKey = frontendTypeToBackendKey(selectedType as UserPromptType);
      setPresets(prev => ({ ...prev, [presetKey]: valueWithPlaceholder }));
    } else {
      setPresets(prev => ({
        ...prev,
        customPresets: { ...prev.customPresets, [selectedType]: valueWithPlaceholder }
      }));
    }
  };

  // 添加新预设
  const handleAddPreset = () => {
    const name = newPresetName.trim();
    if (!name) return;

    // 检查是否已存在
    const existingNames = [...BUILTIN_PROMPT_TYPES, ...Object.keys(presets.customPresets || {})];
    if (existingNames.includes(name) || existingNames.includes(name.toLowerCase())) {
      showToast({
        type: 'error',
        title: t('llmConfig.presetNameExists'),
      });
      return;
    }

    // 添加新预设
    setPresets(prev => ({
      ...prev,
      customPresets: { ...prev.customPresets, [name]: '{text}' }
    }));

    // 选中新预设
    setSelectedType(name);
    setCurrentPromptValue('');

    setNewPresetName('');
    setIsAddingPreset(false);

    showToast({
      type: 'success',
      title: t('llmConfig.presetAdded'),
    });
  };

  // 删除自定义预设
  const handleDeletePreset = (presetName: string) => {
    setPresets(prev => {
      const newCustomPresets = { ...prev.customPresets };
      delete newCustomPresets[presetName];
      return { ...prev, customPresets: newCustomPresets };
    });

    // 如果删除的是当前选中的，切换回 LightPolish
    if (selectedType === presetName) {
      setSelectedType('LightPolish');
      setCurrentPromptValue(removeTextPlaceholder(presets.lightPolish));
    }

    showToast({
      type: 'success',
      title: t('llmConfig.presetDeleted'),
    });
  };

  // 保存所有预设
  const handleSave = async () => {
    setSaving(true);
    try {
      const presetsToSave: UserPromptPresets = {
        lightPolish: presets.lightPolish || '',
        translate: presets.translate || '',
        professionalPolish: presets.professionalPolish || '',
        meetingSecretary: presets.meetingSecretary || '',
        customPresets: presets.customPresets || {},
      };

      await saveLlmPromptPresets(presetsToSave);
      log.info('Presets saved successfully');

      showToast({
        type: 'success',
        title: t('common.saved'),
      });
    } catch (err) {
      log.error(`Failed to save presets: ${err}`);
      showToast({
        type: 'error',
        title: t('common.error'),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('settings.prompt.title')}</h1>
        <p className="text-sm text-gray-500">{t('settings.prompt.subtitle')}</p>
      </div>

      {/* Preset Type Buttons */}
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-2">
          {t('settings.prompt.selectPreset')}
        </label>
        <div className="flex flex-wrap gap-2 mb-4">
          {/* 内置预设按钮 */}
          {BUILTIN_PROMPT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                selectedType === type
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {getPromptTypeLabel(type, t)}
            </button>
          ))}

          {/* 自定义预设按钮 */}
          {Object.keys(presets.customPresets || {}).map((presetName) => (
            <div key={presetName} className="relative group">
              <button
                type="button"
                onClick={() => handleTypeChange(presetName)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  selectedType === presetName
                    ? 'bg-gray-900 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                {presetName}
              </button>
              {/* 删除按钮 */}
              <button
                type="button"
                onClick={() => handleDeletePreset(presetName)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs leading-none hover:bg-red-600"
                title={t('llmConfig.deletePreset')}
              >
                ×
              </button>
            </div>
          ))}

          {/* 添加新预设 */}
          {isAddingPreset ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPreset();
                  if (e.key === 'Escape') {
                    setIsAddingPreset(false);
                    setNewPresetName('');
                  }
                }}
                placeholder={t('llmConfig.newPresetName')}
                autoFocus
                className="w-28 px-2 py-1 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleAddPreset}
                disabled={!newPresetName.trim()}
                className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                title={t('common.confirm')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingPreset(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-200"
              title={t('llmConfig.addPreset')}
            >
              + {t('settings.prompt.addPreset')}
            </button>
          )}
        </div>
      </div>

      {/* Prompt Editor */}
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-2">
          {t('settings.prompt.editPrompt')}
        </label>
        <textarea
          value={currentPromptValue}
          onChange={(e) => handlePromptChange(e.target.value)}
          rows={12}
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
          placeholder={t('llmConfig.promptPlaceholder')}
        />
        <p className="mt-2 text-xs text-gray-400">
          {t('llmConfig.promptTip')}
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}