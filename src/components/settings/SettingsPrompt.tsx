import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserPromptType, UserPromptPresets, AppConfig } from '../../types';
import { createLogger } from '../../services/log';
import { useToast } from '../ui/Toast';
import ConfirmModal from '../ui/ConfirmModal';

const log = createLogger('SettingsPrompt');

// 防抖延迟（毫秒）
const DEBOUNCE_DELAY = 1000;

// 内置提示词类型
const BUILTIN_PROMPT_TYPES: UserPromptType[] = ['LightPolish', 'Translate', 'OptimizePrompt', 'ProfessionalPolish', 'MeetingSecretary'];

// Prompt type labels
const getPromptTypeLabel = (type: UserPromptType | string, t: (key: string) => string): string => {
  if (type === 'LightPolish') return t('llmConfig.promptTypes.lightPolish');
  if (type === 'Translate') return t('llmConfig.promptTypes.translate');
  if (type === 'OptimizePrompt') return t('llmConfig.promptTypes.optimizePrompt');
  if (type === 'ProfessionalPolish') return t('llmConfig.promptTypes.professionalPolish');
  if (type === 'MeetingSecretary') return t('llmConfig.promptTypes.meetingSecretary');
  if (type === 'Custom') return t('llmConfig.promptTypes.custom');
  return type;
};

// 内置预设的 key 类型
type BuiltinPresetKey = 'lightPolish' | 'translate' | 'optimizePrompt' | 'professionalPolish' | 'meetingSecretary';

// Helper: Get default presets from i18n
const getDefaultPresets = (t: (key: string) => string): UserPromptPresets => ({
  lightPolish: t('llmConfig.presets.lightPolish'),
  translate: t('llmConfig.presets.translate'),
  optimizePrompt: t('llmConfig.presets.optimizePrompt'),
  professionalPolish: t('llmConfig.presets.professionalPolish'),
  meetingSecretary: t('llmConfig.presets.meetingSecretary'),
  customPresets: {},
});

// Helper: Convert frontend display type to backend preset key
const frontendTypeToBackendKey = (type: UserPromptType): BuiltinPresetKey => {
  switch (type) {
    case 'LightPolish': return 'lightPolish';
    case 'Translate': return 'translate';
    case 'OptimizePrompt': return 'optimizePrompt';
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

interface SettingsPromptProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function SettingsPrompt({ config, onSave }: SettingsPromptProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // 当前选中的预设类型
  const [selectedType, setSelectedType] = useState<UserPromptType | string>('LightPolish');

  // 预设数据
  const [presets, setPresets] = useState<UserPromptPresets>({
    lightPolish: '',
    translate: '',
    optimizePrompt: '',
    professionalPolish: '',
    meetingSecretary: '',
    customPresets: {},
  });

  // 当前编辑的提示词内容
  const [currentPromptValue, setCurrentPromptValue] = useState('');

  // 添加新预设状态
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    presetName: string;
  }>({ isOpen: false, presetName: '' });

  // 防抖保存定时器
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 追踪最新的预设值（避免闭包问题）
  const latestPresetsRef = useRef<UserPromptPresets>(presets);

  // 同步最新的 presets 到 ref
  useEffect(() => {
    latestPresetsRef.current = presets;
  }, [presets]);

  // 标记是否已初始化
  const initializedRef = useRef(false);

  // 从 config 加载预设数据
  useEffect(() => {
    const defaultPresets = getDefaultPresets(t);
    const savedPresets = config.llmPromptPresets;

    let loadedPresets: UserPromptPresets = defaultPresets;
    if (savedPresets) {
      loadedPresets = {
        ...defaultPresets,
        customPresets: savedPresets.customPresets || {},
      };
      // 只有非空才覆盖内置预设
      const builtinKeys: BuiltinPresetKey[] = ['lightPolish', 'translate', 'optimizePrompt', 'professionalPolish', 'meetingSecretary'];
      for (const key of builtinKeys) {
        if (savedPresets[key] && savedPresets[key].trim()) {
          loadedPresets[key] = savedPresets[key];
        }
      }
    }

    setPresets(loadedPresets);

    // 仅在首次加载时初始化 currentPromptValue
    if (!initializedRef.current) {
      initializedRef.current = true;
      const key = frontendTypeToBackendKey('LightPolish');
      setCurrentPromptValue(removeTextPlaceholder(loadedPresets[key] || defaultPresets[key]));
    }
  }, [config.llmPromptPresets, t]);

  // 切换预设类型
  const handleTypeChange = (type: UserPromptType | string) => {
    setSelectedType(type);

    // 手动同步 currentPromptValue
    if (BUILTIN_PROMPT_TYPES.includes(type as UserPromptType)) {
      const key = frontendTypeToBackendKey(type as UserPromptType);
      setCurrentPromptValue(removeTextPlaceholder(presets[key] || ''));
    } else {
      const customValue = presets.customPresets?.[type] || '';
      setCurrentPromptValue(removeTextPlaceholder(customValue));
    }
  };

  // 立即保存预设到后端
  const savePresetsImmediately = async (newPresets: UserPromptPresets): Promise<void> => {
    try {
      const presetsToSave: UserPromptPresets = {
        lightPolish: newPresets.lightPolish || '',
        translate: newPresets.translate || '',
        optimizePrompt: newPresets.optimizePrompt || '',
        professionalPolish: newPresets.professionalPolish || '',
        meetingSecretary: newPresets.meetingSecretary || '',
        customPresets: newPresets.customPresets || {},
      };

      const newConfig = {
        ...config,
        llmPromptPresets: presetsToSave,
      };

      await onSave(newConfig);
      log.info('Presets saved successfully');
    } catch (err) {
      log.error(`Failed to save presets: ${err}`);
      throw err;
    }
  };

  // 更新提示词内容
  const handlePromptChange = (value: string) => {
    setCurrentPromptValue(value);

    const valueWithPlaceholder = addTextPlaceholder(value);

    // 从最新的 presets 状态计算新值
    const currentPresets = latestPresetsRef.current;
    let newPresets: UserPromptPresets;

    if (BUILTIN_PROMPT_TYPES.includes(selectedType as UserPromptType)) {
      const presetKey = frontendTypeToBackendKey(selectedType as UserPromptType);
      newPresets = { ...currentPresets, [presetKey]: valueWithPlaceholder };
    } else {
      newPresets = {
        ...currentPresets,
        customPresets: { ...currentPresets.customPresets, [selectedType]: valueWithPlaceholder }
      };
    }

    setPresets(newPresets);
    latestPresetsRef.current = newPresets; // 立即更新 ref

    // 防抖自动保存
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        // 从 ref 读取最新值
        await savePresetsImmediately(latestPresetsRef.current);
        log.info('Prompt auto-saved');
      } catch (err) {
        log.error(`Failed to auto-save prompt: ${err}`);
        showToast({
          type: 'error',
          title: t('common.error'),
        });
      }
    }, DEBOUNCE_DELAY);
  };

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 添加新预设
  const handleAddPreset = async () => {
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

    try {
      // 添加新预设
      const newPresets = {
        ...presets,
        customPresets: { ...presets.customPresets, [name]: '{text}' },
      };

      setPresets(newPresets);

      // 选中新预设
      setSelectedType(name);
      setCurrentPromptValue('');

      setNewPresetName('');
      setIsAddingPreset(false);

      // 立即持久化
      await savePresetsImmediately(newPresets);

      showToast({
        type: 'success',
        title: t('llmConfig.presetAdded'),
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: t('common.error'),
      });
    }
  };

  // 删除自定义预设
  const handleDeletePreset = (presetName: string) => {
    // 打开确认弹窗
    setDeleteConfirm({ isOpen: true, presetName });
  };

  // 确认删除预设
  const handleConfirmDelete = async () => {
    const presetName = deleteConfirm.presetName;

    try {
      // 1. 乐观更新 UI
      const newPresets = {
        ...presets,
        customPresets: { ...presets.customPresets },
      };
      delete newPresets.customPresets[presetName];

      setPresets(newPresets);

      // 2. 持久化
      await savePresetsImmediately(newPresets);

      // 如果删除的是当前选中的，切换回 LightPolish
      if (selectedType === presetName) {
        setSelectedType('LightPolish');
        setCurrentPromptValue(removeTextPlaceholder(newPresets.lightPolish));
      }

      showToast({
        type: 'success',
        title: t('llmConfig.presetDeleted'),
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: t('common.error'),
      });
    } finally {
      setDeleteConfirm({ isOpen: false, presetName: '' });
    }
  };

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirm({ isOpen: false, presetName: '' });
  };

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
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
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
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
          placeholder={t('llmConfig.promptPlaceholder')}
        />
        <p className="mt-2 text-xs text-gray-400">
          {t('llmConfig.promptTip')}
        </p>
      </div>

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title={t('llmConfig.deletePresetTitle')}
        message={t('llmConfig.deletePresetConfirm', { name: deleteConfirm.presetName })}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}