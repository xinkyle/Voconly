import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { LlmProfile, UserPromptType, UserPromptPresets, Scene, LlmProviderInstance, ProviderWithConfig, Model } from '../types';
import type { DownloadProgress } from '../services/downloader';
import { getLlmProfile, saveLlmProfile, getProviderList, getLlmPromptPresets, saveLlmPromptPresets, saveProviderConfig } from '../services/llm';
import { createLogger } from '../services/log';
import { translateSceneName } from '../utils/i18n';
import ProviderSelectModal from './ProviderSelectModal';
import LlmModelSelectModal from './LlmModelSelectModal';

const log = createLogger('LlmConfigModal');

interface LlmConfigModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** The scene to configure */
  scene: Scene;
  /** Callback when profile is saved (to update parent state) */
  onSave?: (profile: LlmProfile) => void;
  /** Callback to open Provider settings */
  onOpenProviderSettings?: () => void;
  /** Global download states from App.tsx */
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  /** Callback to trigger download */
  onDownload?: (model: Model) => void;
}

// Default profile for a new scene
const DEFAULT_PROFILE: Omit<LlmProfile, 'id' | 'sceneId'> = {
  enabled: false,
  model: 'qwen2.5:3b',
  userPromptType: 'lightPolish',  // 内置类型默认为轻度润色
  userPromptCustom: '',
  maxTokens: 1024,
  temperature: 0.3,
};

// 内置提示词类型按钮（不含 Custom，Custom 用于用户自定义的单个提示词）
const BUILTIN_PROMPT_TYPES: UserPromptType[] = ['LightPolish', 'Translate', 'ProfessionalPolish', 'MeetingSecretary'];

// Prompt type labels - uses i18n for built-in types
const getPromptTypeLabel = (type: UserPromptType | string, t: (key: string) => string): string => {
  // 内置类型使用 i18n
  if (type === 'LightPolish') return t('llmConfig.promptTypes.lightPolish');
  if (type === 'Translate') return t('llmConfig.promptTypes.translate');
  if (type === 'ProfessionalPolish') return t('llmConfig.promptTypes.professionalPolish');
  if (type === 'MeetingSecretary') return t('llmConfig.promptTypes.meetingSecretary');
  if (type === 'Custom') return t('llmConfig.promptTypes.custom');
  // 自定义预设直接返回名称
  return type;
};

// Helper: Get default presets from i18n
const getDefaultPresets = (t: (key: string) => string): UserPromptPresets => ({
  lightPolish: t('llmConfig.presets.lightPolish'),
  translate: t('llmConfig.presets.translate'),
  professionalPolish: t('llmConfig.presets.professionalPolish'),
  meetingSecretary: t('llmConfig.presets.meetingSecretary'),
  customPresets: {},
});

// 内置预设的 key 类型
type BuiltinPresetKey = 'lightPolish' | 'translate' | 'professionalPolish' | 'meetingSecretary';

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

// Helper: Convert backend prompt type to frontend display type
// 后端现在直接存储预设名称（如 'lightPolish', 'translate', '专业表达'）
const promptTypeFromBackend = (type: string): UserPromptType | string => {
  // 内置类型：转换为前端显示类型
  if (type === 'lightPolish') return 'LightPolish';
  if (type === 'translate') return 'Translate';
  if (type === 'professionalPolish') return 'ProfessionalPolish';
  if (type === 'meetingSecretary') return 'MeetingSecretary';
  // 自定义预设：直接返回名称
  return type;
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

export default function LlmConfigModal({
  isOpen,
  onClose,
  scene,
  onSave,
  onOpenProviderSettings,
  downloadStates = {},
  onDownload,
}: LlmConfigModalProps) {
  const { t } = useTranslation();
  // State
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [providerId, setProviderId] = useState<string>('');
  const [providerMeta, setProviderMeta] = useState<ProviderWithConfig | null>(null);
  const [model, setModel] = useState('qwen2.5:3b');
  const [userPromptType, setUserPromptType] = useState<UserPromptType | string>('Polish');
  const [userPromptCustom, setUserPromptCustom] = useState('');
  const [maxTokens, setMaxTokens] = useState(1024);
  const [temperature, setTemperature] = useState(0.3);

  // 自定义预设添加状态
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Provider select modal
  const [showProviderSelect, setShowProviderSelect] = useState(false);

  // LLM model select modal
  const [showLlmModelSelect, setShowLlmModelSelect] = useState(false);

  // 当前语言的预设（按语言存储）
  const [presets, setPresets] = useState<UserPromptPresets>({
    lightPolish: '',
    translate: '',
    professionalPolish: '',
    meetingSecretary: '',
    customPresets: {},
  });

  // Current display prompt - directly managed state for the textarea
  const [currentPromptValue, setCurrentPromptValue] = useState('');

  // Load profile and presets on open
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      // 1. Load presets first (single storage)
      const defaultPresets = getDefaultPresets(t);
      let loadedPresets: UserPromptPresets = defaultPresets;

      try {
        const savedPresets = await getLlmPromptPresets();
        log.debug(`[loadData] savedPresets: ${JSON.stringify(savedPresets)}`);
        if (savedPresets) {
          // 只有非空值才覆盖默认值
          loadedPresets = {
            ...defaultPresets,
            customPresets: savedPresets.customPresets || {},
          };
          // 逐个检查内置预设，只有非空才使用存储的值
          const builtinKeys: BuiltinPresetKey[] = ['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'];
          for (const key of builtinKeys) {
            if (savedPresets[key] && savedPresets[key].trim()) {
              loadedPresets[key] = savedPresets[key];
            }
          }
        }
      } catch (err) {
        log.error(`Failed to load presets: ${err}`);
      }

      log.debug(`[loadData] defaultPresets: ${JSON.stringify(defaultPresets)}`);
      log.debug(`[loadData] final loadedPresets: ${JSON.stringify(loadedPresets)}`);
      setPresets(loadedPresets);

      // 2. Load profile (get saved config)
      const profile = await getLlmProfile(scene.id);
      let loadedPromptType: UserPromptType | string = 'LightPolish';
      let savedModel = '';
      let savedProviderId = '';

      if (profile) {
        setEnabled(profile.enabled);
        const promptType = promptTypeFromBackend(profile.userPromptType);
        loadedPromptType = promptType;
        setUserPromptType(promptType);
        setUserPromptCustom(profile.userPromptCustom);
        setMaxTokens(profile.maxTokens);
        setTemperature(profile.temperature);
        savedModel = profile.model || '';
        setModel(savedModel);
        savedProviderId = profile.providerId || '';
        setProviderId(savedProviderId);
      } else {
        // Use defaults for new profile
        setEnabled(DEFAULT_PROFILE.enabled);
        const defaultType = promptTypeFromBackend(DEFAULT_PROFILE.userPromptType);
        loadedPromptType = defaultType;
        setUserPromptType(defaultType);
        setUserPromptCustom(DEFAULT_PROFILE.userPromptCustom);
        setMaxTokens(DEFAULT_PROFILE.maxTokens);
        setTemperature(DEFAULT_PROFILE.temperature);
        setModel('');
        setProviderId('');
      }

      // Set initial currentPromptValue based on loaded type
      if (loadedPromptType === 'Custom') {
        setCurrentPromptValue(removeTextPlaceholder(profile?.userPromptCustom || ''));
      } else if (BUILTIN_PROMPT_TYPES.includes(loadedPromptType as UserPromptType)) {
        const key = frontendTypeToBackendKey(loadedPromptType as UserPromptType);
        setCurrentPromptValue(removeTextPlaceholder(loadedPresets[key] || defaultPresets[key]));
      } else {
        // Custom preset
        const customValue = loadedPresets.customPresets?.[loadedPromptType] || '';
        setCurrentPromptValue(removeTextPlaceholder(customValue));
      }

      // 3. Load provider list and determine providerMeta
      try {
        const providers = await getProviderList();
        if (savedProviderId) {
          const selectedProvider = providers.find(p => p.meta.id === savedProviderId);
          if (selectedProvider) {
            setProviderMeta(selectedProvider);
            setProviderId(selectedProvider.meta.id);
            // If profile has no model, use provider's default_model
            if (!savedModel && selectedProvider.instance?.defaultModel) {
              savedModel = selectedProvider.instance.defaultModel;
              setModel(savedModel);
              log.debug(`Using provider default_model: ${savedModel}`);
            }
          }
        }
        // Note: Models will be loaded by the provider change useEffect below
      } catch (err) {
        log.error(`Failed to load providers: ${err}`);
      }
    };

    loadData();
  }, [isOpen, scene.id]);

  // Handle user prompt type change - directly update the display value
  const handleUserPromptTypeChange = (type: UserPromptType | string) => {
    // 调试日志：检查 presets 状态
    log.debug(`[handleUserPromptTypeChange] type: ${type}, presets: ${JSON.stringify(presets)}`);

    setUserPromptType(type);
    // Immediately update currentPromptValue based on the new type (without {text})
    if (type === 'Custom') {
      // Custom 类型用于单个自定义提示词（userPromptCustom）
      setCurrentPromptValue(removeTextPlaceholder(userPromptCustom));
    } else if (BUILTIN_PROMPT_TYPES.includes(type as UserPromptType)) {
      // 内置类型
      const key = frontendTypeToBackendKey(type as UserPromptType);
      const presetValue = presets[key] || '';
      log.debug(`[handleUserPromptTypeChange] key: ${key}, presetValue: ${presetValue.substring(0, 50)}...`);
      setCurrentPromptValue(removeTextPlaceholder(presetValue));
    } else {
      // 自定义预设（从 customPresets 中获取）
      const customPresetValue = presets.customPresets?.[type] || '';
      log.debug(`[handleUserPromptTypeChange] custom preset, value: ${customPresetValue.substring(0, 50)}...`);
      setCurrentPromptValue(removeTextPlaceholder(customPresetValue));
    }
  };

  // Handle preset change (update local state for immediate feedback)
  const handlePromptValueChange = (value: string) => {
    setCurrentPromptValue(value);
    // Store with {text} appended
    const valueWithPlaceholder = addTextPlaceholder(value);
    if (userPromptType === 'Custom') {
      setUserPromptCustom(valueWithPlaceholder);
    } else if (BUILTIN_PROMPT_TYPES.includes(userPromptType as UserPromptType)) {
      // 内置类型：更新对应类型的预设
      const presetKey = frontendTypeToBackendKey(userPromptType as UserPromptType);
      setPresets((prev: UserPromptPresets) => ({ ...prev, [presetKey]: valueWithPlaceholder }));
    } else {
      // 自定义预设：更新 customPresets
      setPresets((prev: UserPromptPresets) => ({
        ...prev,
        customPresets: { ...prev.customPresets, [userPromptType]: valueWithPlaceholder }
      }));
    }
  };

  // Handle add new preset
  const handleAddPreset = () => {
    const name = newPresetName.trim();
    if (!name) return;

    // 检查是否已存在同名预设
    const existingNames = [...BUILTIN_PROMPT_TYPES, ...Object.keys(presets.customPresets || {})];
    const normalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    if (existingNames.includes(name) || existingNames.includes(name.toLowerCase()) || existingNames.includes(normalizedName)) {
      alert(t('llmConfig.presetNameExists'));
      return;
    }

    // 添加新预设（空模板）
    setPresets((prev: UserPromptPresets) => ({
      ...prev,
      customPresets: { ...prev.customPresets, [name]: '{text}' }
    }));

    // 选择新预设并清空输入状态
    setUserPromptType(name);
    setCurrentPromptValue('');
    setNewPresetName('');
    setIsAddingPreset(false);
  };

  // Handle delete custom preset
  const handleDeletePreset = (presetName: string) => {
    setPresets((prev: UserPromptPresets) => {
      const newCustomPresets = { ...prev.customPresets };
      delete newCustomPresets[presetName];
      return { ...prev, customPresets: newCustomPresets };
    });

    // 如果删除的是当前选中的预设，切换回 LightPolish
    if (userPromptType === presetName) {
      setUserPromptType('LightPolish');
      setCurrentPromptValue(removeTextPlaceholder(presets.lightPolish));
    }
  };

  // Handle provider selection
  const handleSelectProvider = useCallback((selectedProviderId: string, instance: LlmProviderInstance) => {
    setProviderId(selectedProviderId);
    // Update providerMeta
    getProviderList().then(providers => {
      const selected = providers.find(p => p.meta.id === selectedProviderId);
      if (selected) {
        setProviderMeta({
          ...selected,
          instance: instance
        });
        // Use provider's defaultModel if available
        if (instance?.defaultModel) {
          setModel(instance.defaultModel);
        }
      }
    });
    setShowProviderSelect(false);
  }, []);

  // Handle LLM model selection
  const handleLlmModelSelect = useCallback((modelId: string) => {
    setModel(modelId);
    setShowLlmModelSelect(false);
    log.debug(`Selected LLM model: ${modelId}`);
  }, []);

  // Save profile
  const handleSave = useCallback(async () => {
    // Validate: if enabled, must have a valid model and provider
    if (enabled) {
      if (!providerId) {
        log.error('Cannot save: enabled but no provider selected');
        alert(t('llmConfig.providerRequired'));
        return;
      }
      if (!model || model.trim() === '') {
        log.error('Cannot save: enabled but no model selected');
        alert(t('llmConfig.modelRequired'));
        return;
      }
    }

    setSaving(true);
    try {
      // 确定 user_prompt_type 和 user_prompt_custom
      // user_prompt_type 直接存预设名称：
      // - 内置类型：lightPolish, translate, professionalPolish, meetingSecretary
      // - 自定义预设：预设名称（如 "正式表达"）
      let finalPromptType: string;
      let finalPromptCustom: string;

      if (BUILTIN_PROMPT_TYPES.includes(userPromptType as UserPromptType)) {
        // 内置类型
        finalPromptType = frontendTypeToBackendKey(userPromptType as UserPromptType);
        finalPromptCustom = userPromptCustom;
      } else {
        // 自定义预设：直接存预设名称
        finalPromptType = userPromptType;  // 预设名称
        finalPromptCustom = addTextPlaceholder(currentPromptValue);
      }

      // Build the profile
      const profile: LlmProfile = {
        id: scene.id,
        sceneId: scene.id,
        enabled,
        providerId: providerId || undefined,
        model,
        userPromptType: finalPromptType,
        userPromptCustom: finalPromptCustom,
        maxTokens: maxTokens,
        temperature,
      };

      log.debug(`Saving profile with provider: ${providerId}, model: ${model}`);
      log.debug(`Full profile: ${JSON.stringify(profile)}`);

      // Save profile
      await saveLlmProfile(profile);

      // 【修复】同时更新 provider 的 defaultModel，确保切换 provider 再切回来后模型选择保持不变
      if (enabled && providerId && providerMeta?.instance) {
        const updatedInstance: LlmProviderInstance = {
          ...providerMeta.instance,
          defaultModel: model,
        };
        await saveProviderConfig(providerId, updatedInstance);
        log.debug(`Updated provider ${providerId} default_model to ${model}`);
      }

      // Save presets (single storage)
      const presetsToSave: UserPromptPresets = {
        lightPolish: presets.lightPolish || '',
        translate: presets.translate || '',
        professionalPolish: presets.professionalPolish || '',
        meetingSecretary: presets.meetingSecretary || '',
        customPresets: presets.customPresets || {},
      };
      await saveLlmPromptPresets(presetsToSave);

      log.debug('Profile and presets saved successfully');

      // Notify parent
      if (onSave) {
        onSave(profile);
      }

      onClose();
    } catch (error) {
      log.error(`Failed to save LLM profile: ${error}`);
    } finally {
      setSaving(false);
    }
  }, [scene.id, enabled, providerId, model, userPromptType, userPromptCustom, currentPromptValue, maxTokens, temperature, presets, onSave, onClose, providerMeta]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Don't render if closed
  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{t('llmConfig.title')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('llmConfig.scene')}: {translateSceneName(scene.name, t)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {onOpenProviderSettings && (
              <button
                onClick={onOpenProviderSettings}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title={t('settings.llm.title')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            {/* 启用开关 */}
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 flex-shrink-0 ${
                enabled ? 'bg-gray-900' : 'bg-gray-300'
              }`}
              title={t('llmConfig.enableLlm')}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* 紧凑配置栏：Provider + 模型选择 */}
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
              {/* Provider 选择 */}
              <div
                onClick={() => enabled && setShowProviderSelect(true)}
                className={`flex-1 min-w-0 ${enabled ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-50'} rounded-lg px-2 py-1 transition-colors`}
              >
                <span className="text-xs text-gray-500">{t('provider.currentProvider')}</span>
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-medium truncate ${providerMeta?.instance?.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {providerMeta
                      ? providerMeta.meta.id === 'llama_cpp'
                        ? 'Llama.cpp (本地大语言模型专用)'
                        : providerMeta.meta.label
                      : t('provider.clickToSelectProvider')}
                  </span>
                  {providerMeta?.instance?.enabled && (
                    <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* 模型选择 - 按钮弹窗选择 */}
              <div
                onClick={() => enabled && setShowLlmModelSelect(true)}
                className={`flex-1 min-w-0 ${enabled ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-50'} rounded-lg px-2 py-1 transition-colors`}
              >
                <span className="text-xs text-gray-500">{t('llmConfig.selectModel')}</span>
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-medium truncate ${model ? 'text-gray-900' : 'text-gray-400'}`}>
                    {model || t('provider.selectModel')}
                  </span>
                  <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* User Prompt Type Buttons */}
            <div className={!enabled ? 'opacity-50 pointer-events-none' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('llmConfig.userPrompt')}
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {/* 内置预设按钮 */}
                {BUILTIN_PROMPT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleUserPromptTypeChange(type)}
                    disabled={!enabled}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      !enabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : userPromptType === type
                          ? 'bg-gray-900 text-white cursor-pointer'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                    }`}
                  >
                    {getPromptTypeLabel(type, t)}
                  </button>
                ))}

                {/* 自定义预设按钮（可删除） */}
                {Object.keys(presets.customPresets || {}).map((presetName) => (
                  <div key={presetName} className="relative group">
                    <button
                      type="button"
                      onClick={() => handleUserPromptTypeChange(presetName)}
                      disabled={!enabled}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        !enabled
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : userPromptType === presetName
                            ? 'bg-gray-900 text-white cursor-pointer'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer border border-blue-200'
                      }`}
                    >
                      {presetName}
                    </button>
                    {/* 删除按钮（hover 时显示） */}
                    {!userPromptType.startsWith('__') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePreset(presetName);
                        }}
                        disabled={!enabled}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs leading-none hover:bg-red-600"
                        title={t('llmConfig.deletePreset')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                {/* 添加新预设：+ 按钮 / 输入框 */}
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
                      onBlur={() => {
                        // 延迟关闭，允许点击确认按钮
                        setTimeout(() => {
                          if (!newPresetName.trim()) {
                            setIsAddingPreset(false);
                          }
                        }, 150);
                      }}
                      placeholder={t('llmConfig.newPresetName')}
                      autoFocus
                      disabled={!enabled}
                      className="w-24 px-2 py-1 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={handleAddPreset}
                      disabled={!enabled || !newPresetName.trim()}
                      className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={!enabled}
                    className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('llmConfig.addPreset')}
                  >
                    +
                  </button>
                )}
              </div>
              <textarea
                value={currentPromptValue}
                onChange={(e) => handlePromptValueChange(e.target.value)}
                disabled={!enabled}
                rows={10}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={t('llmConfig.promptPlaceholder')}
              />
              <p className="mt-1.5 text-xs text-gray-500">
                {t('llmConfig.promptTip')}
              </p>
            </div>
          </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? t('common.saving') : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>

    {/* Provider Select Modal */}
    {showProviderSelect && (
      <ProviderSelectModal
        selectedProviderId={providerId}
        onSelect={handleSelectProvider}
        onClose={() => setShowProviderSelect(false)}
      />
    )}

    {/* LLM Model Select Modal */}
    {showLlmModelSelect && (
      <LlmModelSelectModal
        selectedId={model}
        onSelect={handleLlmModelSelect}
        onCancel={() => setShowLlmModelSelect(false)}
        downloadStates={downloadStates}
        onDownload={onDownload}
      />
    )}
  </>
  );
}