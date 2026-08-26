import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, Model, LlmProfile } from '../types';
import { getFullModelId } from '../types';
import type { DownloadProgress } from '../services/downloader';
import { extractShortcutFromEvent, formatShortcut } from '../utils/keyboard';
import { translateSceneName } from '../utils/i18n';
import { unloadModel, loadModel } from '../services/whisper';
import { getAsrModelList, type AsrModelWithStatus, loadConfig, saveConfig, isModelDownloaded, parseModelId, QUANT_LABELS } from '../services/config';
import { saveLlmProfile, getLlmPromptPresets } from '../services/llm';
import { subscribeToDownloadComplete } from '../services/downloader';
import { useToast } from './ui/Toast';
import LlmConfigModal from './LlmConfigModal';
import ShortcutErrorModal from './ShortcutErrorModal';
import SceneForm from './SceneForm';
import { Tutorial } from './Tutorial';
import MemoryStatus from './MemoryStatus';
import AsrModelSelectModal from './AsrModelSelectModal';
import { createLogger } from '../services/log';

// 创建日志记录器
const log = createLogger('HomePanel');

// 精度标签中文映射（用于非组件函数）
const QUANT_LABEL_NAMES_ZH: Record<string, string> = {
  'low': '低精度',
  'medium': '中精度',
  'high': '高精度',
};

// 获取量化版本的显示名称
function getQuantDisplayName(quant: string, t?: (key: string) => string): string {
  const label = QUANT_LABELS[quant];
  if (label) {
    // 如果有翻译函数，使用翻译；否则使用中文默认值
    return t ? t(`models.quantLabels.${label}`) : QUANT_LABEL_NAMES_ZH[label] || quant;
  }
  return quant;
}

interface HomePanelProps {
  scenes?: Scene[];
  models?: Model[];
  llmProfiles?: LlmProfile[];
  /// 用户对每个 ASR 模型的默认语言偏好
  modelLanguagePrefs?: Record<string, string>;
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
  onSave?: (scenes: Scene[]) => void;
  onModelsChange?: (models: Model[]) => void;  // Callback to update models state in parent
  onModelLanguagePrefsChange?: (prefs: Record<string, string>) => void;  // Callback to update language prefs
  onLlmProfileSave?: (profile: LlmProfile) => void;
  tutorialCompleted?: boolean;
  onTutorialComplete?: () => void;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
  triggerSelectModelSceneId?: string | null;  // Scene ID to trigger model selection dialog
  onTriggerSelectModelCleared?: () => void;   // Callback when trigger is handled
}

// Icons
const KeyboardIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const MicrophoneIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const SceneIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const AIModelIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

// Tooltip Component
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute right-0 bottom-full mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap animate-fade-in z-10">
          {text}
          <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

// Get model name by ID
// First searches in asrModels (scanned models from directory), then falls back to models (predefined list)
function getModelName(modelId: string, models: Model[], asrModels?: AsrModelWithStatus[], t?: (key: string) => string): string {
  // Parse model ID to handle quantization suffix (e.g., "qwen3-asr-1.7b-Q8_0")
  const { baseId, quant } = parseModelId(modelId);

  // First, try to find in asrModels (scanned models from disk) - case-insensitive
  if (asrModels) {
    const asrModel = asrModels.find(m => m.preset.id.toLowerCase() === baseId.toLowerCase());
    if (asrModel) {
      const name = asrModel.preset.name;
      // Add quantization version if available from modelId or preset
      const displayQuant = quant || asrModel.preset.quant;
      if (displayQuant) {
        const quantName = getQuantDisplayName(displayQuant, t);
        return `${name} (${quantName})`;
      }
      return name;
    }
  }

  // Fallback to predefined models list
  const model = models.find(m => m.id.toLowerCase() === baseId.toLowerCase());
  if (!model) {
    // Don't log error for custom models, just return the ID as name
    return modelId;
  }
  // Add quantization version if available
  if (quant) {
    const quantName = getQuantDisplayName(quant, t);
    return `${model.name} (${quantName})`;
  }
  return model.name;
}

// Get model size by ID (formatted: GB for >= 1GB, MB for < 1GB)
// First searches in asrModels (scanned models from directory), then falls back to models (predefined list)
function getModelSize(modelId: string, models: Model[], asrModels?: AsrModelWithStatus[]): string {
  // Parse model ID to handle quantization suffix
  const { baseId, quant } = parseModelId(modelId);

  // First, try to find in asrModels (scanned models from disk) - case-insensitive
  if (asrModels) {
    const asrModel = asrModels.find(m => m.preset.id.toLowerCase() === baseId.toLowerCase());
    if (asrModel) {
      // If quantization specified, try to find size from quantVariants
      if (quant && asrModel.quantVariants) {
        const quantVariant = asrModel.quantVariants.find(v => v.quant.toUpperCase() === quant.toUpperCase());
        if (quantVariant) {
          const mb = quantVariant.sizeBytes / (1024 * 1024);
          if (mb >= 1024) {
            return `${(mb / 1024).toFixed(1)}GB`;
          }
          return `${Math.round(mb)}MB`;
        }
      }

      // Use actual size from disk if available
      if (asrModel.sizeMb) {
        const mb = asrModel.sizeMb;
        if (mb >= 1024) {
          return `${(mb / 1024).toFixed(1)}GB`;
        }
        return `${mb}MB`;
      }
      // Or use preset size
      if (asrModel.preset.size) {
        const sizeStr = asrModel.preset.size.toUpperCase();
        if (sizeStr.includes('GB') || sizeStr.includes('MB')) {
          return asrModel.preset.size;
        }
      }
    }
  }

  // Fallback to predefined models list - case-insensitive
  const model = models.find(m => m.id.toLowerCase() === baseId.toLowerCase());
  if (!model || !model.size) return '';

  const sizeStr = model.size.toUpperCase();

  // 如果已经是 GB 格式，直接返回
  if (sizeStr.includes('GB')) {
    return model.size;
  }

  // 解析 MB 值
  const mbMatch = sizeStr.match(/([\d.]+)\s*MB/i);
  if (mbMatch) {
    const mb = parseFloat(mbMatch[1]);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)}GB`;
    }
    return model.size;
  }

  return model.size;
}

// Get scene description based on scene name
function getSceneDescription(sceneName: string, t: (key: string) => string): string {
  const name = sceneName.toLowerCase();
  if (name.includes('快速') || name.includes('速') || name.includes('quick')) {
    return t('scene.quickDesc');
  }
  if (name.includes('准确') || name.includes('精准') || name.includes('高质') || name.includes('accurate')) {
    return t('scene.accurateDesc');
  }
  if (name.includes('默认') || name.includes('普通') || name.includes('标准') || name.includes('default')) {
    return t('scene.defaultDesc');
  }
  if (name.includes('长文') || name.includes('文章') || name.includes('文档') || name.includes('long')) {
    return t('scene.longTextDesc');
  }
  if (name.includes('短句') || name.includes('短语') || name.includes('short')) {
    return t('scene.shortTextDesc');
  }
  if (name.includes('会议') || name.includes('讨论') || name.includes('meeting')) {
    return t('scene.meetingDesc');
  }
  if (name.includes('笔记') || name.includes('备忘') || name.includes('notes')) {
    return t('scene.notesDesc');
  }
  return t('scene.genericDesc');
}

// Toggle Switch Component
function ToggleSwitch({
  checked,
  onChange,
  size = 'normal',
  disabled = false
}: {
  checked: boolean;
  onChange: () => void;
  size?: 'normal' | 'small';
  disabled?: boolean;
}) {
  const isSmall = size === 'small';
  return (
    <button
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full transition-colors duration-200 ${
        isSmall ? 'h-5 w-9' : 'h-6 w-11'
      } ${
        disabled
          ? 'bg-gray-300 cursor-not-allowed opacity-60'
          : checked ? 'bg-gray-900' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block rounded-full bg-white transition-transform duration-200 ${
          isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4'
        } ${checked ? (isSmall ? 'translate-x-5' : 'translate-x-6') : (isSmall ? 'translate-x-1' : 'translate-x-1')}`}
      />
    </button>
  );
}

// Scene Card Component
interface SceneCardProps {
  scene: Scene;
  sceneIndex: number;
  model: Model | undefined;
  models: Model[];
  asrModels: AsrModelWithStatus[];
  /// 用户对每个 ASR 模型的默认语言偏好
  modelLanguagePrefs: Record<string, string>;
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  isListening: boolean;
  onModelClick: () => void;
  onShortcutClick: () => void;
  onModelSelect: (modelId: string) => void;
  onToggleEnabled: () => void;
  onLlmConfigClick: () => void;
  llmEnabled: boolean;
  llmPromptType?: string;  // 内置类型: polish/translate/summarize，自定义预设: 预设名称
  customPresets?: Record<string, string>;  // 自定义预设列表
  onPromptTypeClick?: () => void;  // 点击提示词标签的回调
  isSelectingPromptType?: boolean;  // 是否正在选择提示词
  onPromptTypeSelect?: (promptType: string) => void;  // 选择提示词后的回调
  onLanguageChange?: (language: string) => void;  // 语言选择回调（场景选中模型）
  onModelLanguageChange?: (modelId: string, language: string) => void;  // 模型语言选择回调（独立）
}

// 获取提示词显示标签
const getPromptDisplayLabel = (
  promptType: string,
  t: (key: string) => string
): string => {
  // 内置类型直接返回标签
  if (promptType === 'lightPolish' || promptType === 'translate' || promptType === 'professionalPolish' || promptType === 'meetingSecretary') {
    return getPromptTypeLabel(promptType, t);
  }

  // 自定义预设：直接返回预设名称
  return promptType;
};

// 提示词类型显示名称
const getPromptTypeLabel = (type: string, t: (key: string) => string): string => {
  const labels: Record<string, string> = {
    lightPolish: t('llmConfig.promptTypes.lightPolish'),
    translate: t('llmConfig.promptTypes.translate'),
    professionalPolish: t('llmConfig.promptTypes.professionalPolish'),
    meetingSecretary: t('llmConfig.promptTypes.meetingSecretary'),
    custom: t('llmConfig.promptTypes.custom'),
  };
  return labels[type] || type;
};

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper function to get language display name
function getLanguageDisplayName(langCode: string, t: (key: string) => string): string {
  const key = `languages.${langCode}`;
  const translated = t(key);
  // If translation doesn't exist (returns the key), fallback to the code itself
  return translated === key ? langCode : translated;
}

// Language Selector Component
function LanguageSelector({
  languages,
  currentLanguage,
  disabled = false,
  direction = 'up',
  onChange,
  t,
}: {
  languages: string[];
  currentLanguage: string;
  disabled?: boolean;
  direction?: 'up' | 'down';
  onChange: (lang: string) => void;
  t: (key: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const openUpward = direction === 'up';

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all duration-200 ${
          disabled
            ? 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed'
            : isOpen
              ? 'text-gray-900 bg-gray-100 border-gray-300'
              : 'text-gray-600 bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <span>{getLanguageDisplayName(currentLanguage, t)}</span>
        <svg className={`w-3 h-3 transition-transform duration-200 ${isOpen ? (openUpward ? 'rotate-180' : '') : (openUpward ? '' : '')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={`absolute right-0 z-20 min-w-[120px] max-h-60 overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg ${
          openUpward
            ? 'bottom-full mb-1' // Open upward
            : 'top-full mt-1'    // Open downward
        }`}>
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => {
                onChange(lang);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${
                lang === currentLanguage
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {getLanguageDisplayName(lang, t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SceneCard({
  scene,
  sceneIndex,
  models,
  asrModels,
  modelLanguagePrefs,
  downloadStates = {},
  isListening,
  onModelClick,
  onShortcutClick,
  onModelSelect,
  onToggleEnabled,
  onLlmConfigClick,
  llmEnabled,
  llmPromptType,
  customPresets,
  onPromptTypeClick,
  isSelectingPromptType,
  onPromptTypeSelect,
  onLanguageChange,
  onModelLanguageChange: _onModelLanguageChange,
}: SceneCardProps) {
  const { t, i18n } = useTranslation();

  // 智能语言推荐逻辑（公共函数）：
  // 1. 用户已设置过的语言偏好（优先级最高）
  // 2. 如果模型支持自动检测，优先推荐 auto
  // 3. 如果界面语言在模型支持列表中，使用界面语言
  // 4. 否则使用第一个支持的语言
  const getRecommendedLanguage = (
    modelId: string,
    languages: string[],
    supportsAutoDetect: boolean
  ): string => {
    // 1. 用户已设置过的语言偏好
    if (modelLanguagePrefs[modelId]) {
      return modelLanguagePrefs[modelId];
    }

    // 2. 如果模型支持自动检测，优先推荐 auto
    if (supportsAutoDetect) {
      return 'auto';
    }

    // 3. 获取系统/界面语言，如果支持则使用
    const i18nLanguage = i18n.language || 'zh'; // 默认中文
    const langCode = i18nLanguage.split('-')[0]; // 'zh-CN' -> 'zh', 'en-US' -> 'en'
    if (languages.includes(langCode)) {
      return langCode;
    }

    // 4. 否则使用第一个支持的语言
    return languages[0] || 'zh';
  };

  return (
    <div
      id={`scene-card-${sceneIndex}`}
      className={`group relative rounded-2xl border transition-all duration-300 ${
      scene.enabled
        ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg'
        : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Card Header with Scene Name */}
      <div className={`px-4 py-2.5 border-b ${
        scene.enabled
          ? 'bg-gradient-to-r from-gray-50/80 to-white border-gray-100'
          : 'bg-gray-100/50 border-gray-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`p-1 rounded-md ${
            scene.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-200 text-gray-400'
          }`}>
            <SceneIcon />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-semibold truncate ${scene.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
              {translateSceneName(scene.name, t)}
            </h3>
            <p className={`text-xs truncate ${scene.enabled ? 'text-gray-400' : 'text-gray-400'}`}>
              {getSceneDescription(scene.name, t)}
            </p>
          </div>
          {/* LLM Config Button and Prompt Type - 同一行 */}
          <div className="flex items-center gap-1">
            {/* Lightbulb Icon */}
            <button
              id="llm-config-button"
              onClick={scene.enabled ? onLlmConfigClick : undefined}
              disabled={!scene.enabled}
              className={`p-1 rounded-md transition-all duration-200 ${
                !scene.enabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : llmEnabled
                    ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                    : 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100'
              }`}
              title={!scene.enabled ? t('home.sceneDisabled') : llmEnabled ? t('home.llmEnabled') : t('home.llmConfig')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
            {/* LLM Prompt Type Label - 点击可快速切换 */}
            {llmEnabled && llmPromptType && (
              <button
                onClick={scene.enabled && onPromptTypeClick ? onPromptTypeClick : undefined}
                disabled={!scene.enabled}
                className={`px-1.5 py-0.5 text-xs font-medium rounded transition-all duration-200 ${
                  !scene.enabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 cursor-pointer'
                }`}
                title={t('home.clickToSwitchPrompt')}
              >
                {getPromptDisplayLabel(llmPromptType, t)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        {/* Shortcut and Model in one row */}
        <div className="flex gap-6">
          {/* Shortcut */}
          <div id="shortcut-area" className="flex-1 space-y-1.5">
            <label className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 ${
              scene.enabled ? 'text-gray-400' : 'text-gray-400'
            }`}>
              <KeyboardIcon />
              {t('home.shortcut')}
            </label>
            {scene.enabled ? (
              <Tooltip text={t('home.clickToChangeShortcut')}>
                <button
                  onClick={onShortcutClick}
                  disabled={isListening}
                  className={`w-full h-16 flex items-center justify-center px-4 rounded-lg border-2 transition-all duration-200 ${
                    isListening
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {isListening ? (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                      <span className="font-mono font-medium text-sm">{t('home.pressAnyKey')}</span>
                    </div>
                  ) : (
                    <span className="px-3 py-1 bg-white rounded-lg font-mono font-semibold text-sm text-gray-900 shadow-sm border border-gray-200">
                      {formatShortcut(scene.shortcut)}
                    </span>
                  )}
                </button>
              </Tooltip>
            ) : (
              <div className="w-full h-16 flex items-center justify-center px-4 rounded-lg border-2 border-gray-100 bg-gray-50/50 cursor-not-allowed">
                <span className="px-3 py-1 bg-gray-100 rounded-lg font-mono font-semibold text-sm text-gray-400 border border-gray-200">
                  {formatShortcut(scene.shortcut)}
                </span>
              </div>
            )}
          </div>

          {/* Model */}
          <div id="voice-model-area" className="flex-1 space-y-1.5">
            <label className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 ${
              scene.enabled ? 'text-gray-400' : 'text-gray-400'
            }`}>
              <AIModelIcon />
              {t('home.voiceModel')}
            </label>
            {/* Check model status: no model selected, downloading, not downloaded, or downloaded */}
            {(() => {
              // Check if modelId is empty (new user needs to select/download model)
              const fullModelId = scene.model?.modelId ? getFullModelId(scene.model) : '';
              const hasNoModelSelected = !scene.model?.modelId || scene.model.modelId === '';

              // Use isModelDownloaded utility to handle quantization suffix (case-insensitive)
              const isDownloaded = isModelDownloaded(fullModelId, asrModels) || (models.find(m => m.id === scene.model?.modelId)?.downloaded ?? false);
              const selectedModelDownloadState = downloadStates[fullModelId];
              const isDownloading = selectedModelDownloadState?.downloading ?? false;
              const downloadProgress = selectedModelDownloadState?.progress;

              if (scene.enabled) {
                return (
                  <Tooltip text={hasNoModelSelected ? t('home.selectModelFirst') : isDownloading ? '' : isDownloaded ? t('home.clickToSwitchModel') : t('home.clickToSelect')}>
                    <button
                      onClick={() => {
                        if (isDownloading) return;
                        if (hasNoModelSelected) {
                          // Open model selection dialog
                          onModelClick();
                        } else if (!isDownloaded && !isDownloading) {
                          // Model is not available and not downloading → clear selection and open dialog
                          onModelSelect('');
                        } else {
                          // Model is downloaded → open selection dialog
                          onModelClick();
                        }
                      }}
                      className={`w-full h-16 relative flex flex-col items-center justify-center px-4 rounded-lg border-2 transition-all duration-200 overflow-hidden ${
                        isDownloading
                          ? 'border-blue-200 bg-gray-50 cursor-default'
                          : hasNoModelSelected
                            ? 'border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:bg-amber-50 cursor-pointer'
                            : isDownloaded
                              ? 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100 cursor-pointer'
                              : 'border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:bg-amber-50 cursor-pointer'
                      }`}
                    >
                      {/* Progress background */}
                      {isDownloading && (
                        <div className="absolute inset-0 overflow-hidden rounded-lg">
                          <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-100/60 to-blue-50/40 transition-all duration-300 ease-out"
                            style={{ width: `${downloadProgress?.percentage ?? 0}%` }}
                          />
                          <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                        </div>
                      )}
                      {/* Content */}
                      <div className="relative z-10 flex flex-col items-center justify-center">
                        {hasNoModelSelected ? (
                          // Show prompt for user to download model first
                          <>
                            <span className="font-medium text-sm text-amber-700">
                              {t('home.noModelSelected')}
                            </span>
                            <span className="text-xs text-amber-500 mt-0.5">
                              {t('home.clickToSelect')}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className={`font-medium text-sm ${isDownloading ? 'text-blue-600' : isDownloaded ? 'text-gray-900' : 'text-amber-700'}`}>
                                {getModelName(scene.model?.modelId ?? '', models, asrModels, t)}
                              </span>
                              {/* Not downloaded badge */}
                              {!isDownloaded && !isDownloading && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-600 rounded">
                                  {t('models.notDownloaded')}
                                </span>
                              )}
                            </div>
                            {isDownloading ? (
                              downloadProgress ? (
                                <span className="text-xs text-blue-500 mt-0.5">
                                  {downloadProgress.percentage}% · {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
                                </span>
                              ) : (
                                <span className="text-xs text-blue-500 mt-0.5">
                                  {t('models.downloading')}
                                </span>
                              )
                            ) : isDownloaded ? (
                              <span className="text-xs text-gray-400 mt-0">({getModelSize(scene.model?.modelId ?? '', models, asrModels)})</span>
                            ) : (
                              <span className="text-xs text-amber-500 mt-0.5">
                                {t('home.clickToSelect')}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  </Tooltip>
                );
              } else {
                return (
                  <div className="w-full h-16 flex flex-col items-center justify-center px-4 rounded-lg border-2 border-gray-100 bg-gray-50/50 cursor-not-allowed">
                    {hasNoModelSelected ? (
                      <span className="font-medium text-sm text-gray-400">{t('home.noModelSelected')}</span>
                    ) : (
                      <>
                        <span className="font-medium text-sm text-gray-400">{getModelName(scene.model?.modelId ?? '', models, asrModels, t)}</span>
                        <span className="text-xs text-gray-300 mt-0">({getModelSize(scene.model?.modelId ?? '', models, asrModels)})</span>
                      </>
                    )}
                  </div>
                );
              }
            })()}
          </div>
        </div>
        {isListening && (
          <p className="text-xs text-amber-600 text-center">
            {t('home.autoCancelHint')}
          </p>
        )}

        {/* Toggle Switches Row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 overflow-visible">
          {/* 启用开关 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">{t('home.enable')}</span>
            <ToggleSwitch
              checked={scene.enabled}
              onChange={onToggleEnabled}
              size="small"
            />
          </div>

          {/* 语言选择器 - 仅在有选中模型且场景启用时显示 */}
          {scene.enabled && scene.model?.modelId && (() => {
            // 获取当前选中模型的语言信息
            const selectedModel = models.find(m => m.id === scene.model?.modelId);
            const asrModel = asrModels.find(m => m.preset.id === scene.model?.modelId);

            // 从 models 或 asrModels 获取语言列表
            const modelLanguages = selectedModel?.languages || asrModel?.preset.languages || [];

            // 如果没有语言信息，不显示选择器
            if (modelLanguages.length === 0) return null;

            // 判断是否支持自动检测：如果模型有 supportsAutoDetect 字段则使用，否则根据语言数量推断
            // Whisper 等模型支持大量语言，应该支持 auto；SenseVoice 等特定语言模型可能不支持
            const supportsAutoDetect = selectedModel?.supportsAutoDetect
              ?? asrModel?.preset.supportsAutoDetect
              ?? (modelLanguages.length > 10);

            // 构建语言选项列表：如果有 auto 则放在最前面
            const languageOptions = supportsAutoDetect
              ? ['auto', ...modelLanguages]
              : modelLanguages;

            // 使用统一的智能语言推荐逻辑
            const currentLanguage = getRecommendedLanguage(scene.model?.modelId ?? '', modelLanguages, supportsAutoDetect);

            return (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">{t('home.language')}</span>
                <LanguageSelector
                  languages={languageOptions}
                  currentLanguage={currentLanguage}
                  disabled={!scene.enabled}
                  onChange={(lang) => onLanguageChange?.(lang)}
                  t={t}
                />
              </div>
            );
          })()}
        </div>
      </div>

      {/* Prompt Type Quick Switch Popup */}
      {isSelectingPromptType && onPromptTypeSelect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => onPromptTypeSelect(llmPromptType || 'lightPolish')}
        >
          <div
            className="bg-white rounded-xl p-4 w-[280px] shadow-xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900 text-sm">{t('home.selectPromptType')}</h4>
              <button
                onClick={() => onPromptTypeSelect(llmPromptType || 'lightPolish')}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-1">
              {/* 内置预设 */}
              {(['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => onPromptTypeSelect(type)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 ${
                    llmPromptType === type
                      ? 'bg-gray-900 text-white'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="text-sm font-medium">{getPromptTypeLabel(type, t)}</span>
                  {llmPromptType === type && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}

              {/* 自定义预设 */}
              {customPresets && Object.keys(customPresets).length > 0 && (
                <>
                  <div className="border-t border-gray-100 my-2" />
                  {Object.entries(customPresets).map(([presetName]) => {
                    // 判断是否选中：直接比较预设名称
                    const isSelected = llmPromptType === presetName;
                    return (
                      <button
                        key={presetName}
                        onClick={() => onPromptTypeSelect(presetName)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 ${
                          isSelected
                            ? 'bg-gray-900 text-white'
                            : 'hover:bg-blue-50 text-blue-700'
                        }`}
                      >
                        <span className="text-sm font-medium">{presetName}</span>
                        {isSelected && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePanel({
  scenes = [],
  models = [],
  llmProfiles = [],
  modelLanguagePrefs = {},
  downloadStates = {},
  onDownload,
  onSave,
  // onModelsChange - DEPRECATED: 不再需要，models 不再持久化
  onModelLanguagePrefsChange,
  onLlmProfileSave,
  tutorialCompleted,
  onTutorialComplete,
  tryRegisterShortcut,
  triggerSelectModelSceneId,
  onTriggerSelectModelCleared
}: HomePanelProps) {
  const { t, i18n } = useTranslation();
  const [localScenes, setLocalScenes] = useState<Scene[]>(scenes);
  const [listeningSceneId, setListeningSceneId] = useState<string | null>(null);
  const [selectingSceneId, setSelectingSceneId] = useState<string | null>(null);
  const [llmConfigScene, setLlmConfigScene] = useState<Scene | null>(null);

  // For shortcut error modal
  const [shortcutError, setShortcutError] = useState<{
    shortcut: string;
    errorType: 'unsupported' | 'occupied' | 'unknown';
    errorMessage: string;
  } | null>(null);
  const [selectingPromptTypeSceneId, setSelectingPromptTypeSceneId] = useState<string | null>(null);
  const [asrModels, setAsrModels] = useState<AsrModelWithStatus[]>([]);
  const [customPresets, setCustomPresets] = useState<Record<string, string>>({});
  const [showTutorial, setShowTutorial] = useState(false);
  // For add/edit scene form
  const [showForm, setShowForm] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);

  // 双击快捷键提示横幅关闭状态（持久化到 localStorage）
  const [showDoubleTapHint, setShowDoubleTapHint] = useState(() => {
    const saved = localStorage.getItem('voconly-double-tap-hint-closed');
    return saved !== 'true';
  });

  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();

  // Load ASR models on mount (same as ModelConfigPanel.tsx)
  useEffect(() => {
    const loadAsrModels = async () => {
      try {
        const result = await getAsrModelList();
        setAsrModels(result);
        log.info(`Loaded ${result.length} ASR models`);

        // Check if any scene has selected a model that no longer exists or is not downloaded
        const scenesToClear = localScenes.filter(s => {
          if (!s.model?.modelId) return false;
          return !isModelDownloaded(s.model.modelId, result);
        });

        if (scenesToClear.length > 0) {
          log.info(`Clearing model selection for ${scenesToClear.length} scenes due to unavailable models`);
          const updatedScenes = localScenes.map(s => {
            if (s.model?.modelId && !isModelDownloaded(s.model.modelId, result)) {
              return { ...s, model: { modelId: '', quantization: undefined } };
            }
            return s;
          });
          setLocalScenes(updatedScenes);
          if (onSave) {
            onSave(updatedScenes);
          }
        }
      } catch (err) {
        log.error(`Failed to load ASR models: ${err}`);
      }
    };
    loadAsrModels();
  }, []);

  // Reload models when download completes
  useEffect(() => {
    let mounted = true;
    const unlisten = subscribeToDownloadComplete(() => {
      if (!mounted) return;
      getAsrModelList()
        .then((result) => {
          if (!mounted) return;
          setAsrModels(result);
        })
        .catch((err) => log.error(`Failed to reload models: ${err}`));
    });
    return () => {
      mounted = false;
      unlisten.then(fn => fn());
    };
  }, []);

  // Load custom presets function
  const loadCustomPresets = useCallback(async () => {
    try {
      const savedPresets = await getLlmPromptPresets();
      if (savedPresets?.customPresets) {
        setCustomPresets(savedPresets.customPresets);
      }
    } catch (err) {
      log.error(`Failed to load custom presets: ${err}`);
    }
  }, []);

  // Load custom presets on mount and language change
  useEffect(() => {
    loadCustomPresets();
  }, [loadCustomPresets]);

  // Check if tutorial should be shown
  useEffect(() => {
    if (scenes.length > 0 && !tutorialCompleted) {
      setShowTutorial(true);
    }
  }, [scenes.length, tutorialCompleted]);

  // Refs to avoid closure issues in keydown handler
  const localScenesRef = useRef(localScenes);
  const onSaveRef = useRef(onSave);
  const listeningSceneIdRef = useRef(listeningSceneId);
  const tryRegisterShortcutRef = useRef(tryRegisterShortcut);

  // Keep refs updated
  useEffect(() => {
    localScenesRef.current = localScenes;
  }, [localScenes]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    listeningSceneIdRef.current = listeningSceneId;
  }, [listeningSceneId]);

  // Handle external trigger to open model selection dialog (e.g., from download error)
  useEffect(() => {
    if (triggerSelectModelSceneId && onTriggerSelectModelCleared) {
      handleModelClick(triggerSelectModelSceneId);
      onTriggerSelectModelCleared();
    }
  }, [triggerSelectModelSceneId, onTriggerSelectModelCleared]);

  useEffect(() => {
    tryRegisterShortcutRef.current = tryRegisterShortcut;
  }, [tryRegisterShortcut]);

  // Update local scenes when prop changes
  useEffect(() => {
    setLocalScenes(scenes);
  }, [scenes]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
    };
  }, []);

  // Get scenes to display, maintaining original order
  const displayScenes = localScenes;

  // Handle model select - reload models when opening the selection dialog
  const handleModelClick = async (sceneId: string) => {
    // Reload ASR models to get latest download status
    try {
      const result = await getAsrModelList();
      setAsrModels(result);
      log.info(`Reloaded ${result.length} ASR models before opening selection`);
    } catch (err) {
      log.error(`Failed to reload ASR models: ${err}`);
    }
    setSelectingSceneId(sceneId);
  };

  const handleModelSelect = useCallback(async (sceneId: string, modelId: string) => {
    log.debug(`handleModelSelect called: sceneId=${sceneId}, modelId=${modelId}`);
    const scene = localScenes.find(s => s.id === sceneId);
    const currentFullModelId = scene?.model?.modelId ? getFullModelId(scene.model) : '';
    if (!scene || currentFullModelId === modelId) {
      log.debug('No change or scene found');
      setSelectingSceneId(null);
      return;
    }

    // 解析模型 ID（可能包含量化后缀）
    const { baseId, quant } = parseModelId(modelId);
    const updatedScene = {
      ...scene,
      model: {
        modelId: baseId,
        quantization: quant,
      },
    };
    const newScenes = localScenes.map(s => (s.id === sceneId ? updatedScene : s));
    log.debug(`New scenes: ${JSON.stringify(newScenes)}`);
    setLocalScenes(newScenes);
    setSelectingSceneId(null);

    // 自动设置默认语言偏好（如果还没有设置）
    // 使用与 UI 显示相同的推荐逻辑
    const asrModel = asrModels.find(m => m.preset.id === baseId);
    if (asrModel && !modelLanguagePrefs[baseId]) {
      const languages = asrModel.preset.languages || [];
      const supportsAutoDetect = asrModel.preset.supportsAutoDetect ?? (languages.length > 10);

      // 智能推荐逻辑：
      // 1. 如果模型支持自动检测，使用 auto
      // 2. 如果界面语言在支持列表中，使用界面语言
      // 3. 否则使用第一个支持的语言
      const recommendedLanguage = supportsAutoDetect
        ? 'auto'
        : (() => {
            const i18nLanguage = i18n.language || 'zh';
            const langCode = i18nLanguage.split('-')[0];
            if (languages.includes(langCode)) {
              return langCode;
            }
            return languages[0] || 'auto';
          })();

      log.info(`[ModelSelect] 自动设置默认语言: ${recommendedLanguage} for model ${baseId}`);

      // 内联保存语言偏好逻辑
      try {
        const config = await loadConfig();
        const updatedPrefs = {
          ...(config.modelLanguagePrefs || {}),
          [modelId]: recommendedLanguage,
        };
        await saveConfig({
          ...config,
          modelLanguagePrefs: updatedPrefs
        });
        if (onModelLanguagePrefsChange) {
          onModelLanguagePrefsChange(updatedPrefs);
        }
      } catch (error) {
        log.error(`Failed to save language config: ${error}`);
      }
    }

    if (onSave) {
      log.debug('Calling onSave');
      onSave(newScenes);
    } else {
      log.debug('No onSave callback');
    }
  }, [localScenes, onSave, asrModels, modelLanguagePrefs, onModelLanguagePrefsChange, i18n]);

  // Handle shortcut click
  const handleShortcutClick = useCallback((sceneId: string) => {
    // Cancel any existing listening
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }

    setListeningSceneId(sceneId);

    // Auto-cancel after 5 seconds
    listeningTimeoutRef.current = setTimeout(() => {
      setListeningSceneId(null);
    }, 5000);
  }, []);

  // Handle toggle enabled
  const handleToggleEnabled = useCallback(async (sceneId: string) => {
    const scene = localScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const wasEnabled = scene.enabled;
    const newEnabled = !wasEnabled;

    // 更新场景状态
    const updatedScene = { ...scene, enabled: newEnabled };
    const newScenes = localScenes.map(s => (s.id === sceneId ? updatedScene : s));
    setLocalScenes(newScenes);

    if (onSave) {
      onSave(newScenes);
    }

    // 获取模型信息
    const fullModelId = scene.model?.modelId ? getFullModelId(scene.model) : '';
    const model = models.find(m => m.id === scene.model?.modelId);
    const modelName = model?.name || scene.model?.modelId || '';
    const modelSize = model?.size || '';

    if (newEnabled) {
      // 启用场景：加载模型到内存
      log.debug(`启用场景，加载模型 ${fullModelId}`);
      try {
        const result = await loadModel(fullModelId);
        if (result.success) {
          showToast({
            type: 'info',
            title: '场景已启用',
            description: `${modelName} 已加载到内存`,
          });
        } else {
          showToast({
            type: 'warning',
            title: '模型加载失败',
            description: result.error || '未知错误',
          });
        }
      } catch (e) {
        const errorMsg = String(e);
        log.error(`加载模型异常: ${errorMsg}`);
        showToast({
          type: 'warning',
          title: '模型加载异常',
          description: errorMsg,
        });
      }
    } else {
      // 禁用场景：检查是否需要卸载模型
      // 检查其他启用的场景是否也在使用同一模型
      const otherScenesUsingModel = newScenes.filter(s =>
        s.id !== sceneId &&
        getFullModelId(s.model) === fullModelId &&
        s.enabled
      );

      if (otherScenesUsingModel.length > 0) {
        const otherSceneNames = otherScenesUsingModel.map(s => s.name).join('、');
        showToast({
          type: 'info',
          title: '场景已禁用',
          description: `${modelName} 仍被「${otherSceneNames}」使用，保持在内存中`,
        });
      } else {
        // 卸载模型
        log.debug(`禁用场景，卸载模型 ${fullModelId}`);
        try {
          const result = await unloadModel(fullModelId);
          if (result.success) {
            showToast({
              type: 'info',
              title: '场景已禁用',
              description: `${modelName} 已从内存释放${modelSize ? `，腾出约 ${modelSize}` : ''}`,
            });
          }
        } catch (e) {
          const errorMsg = String(e);
          log.error(`卸载模型异常: ${errorMsg}`);
          showToast({
            type: 'warning',
            title: '模型卸载异常',
            description: errorMsg,
          });
        }
      }
    }
  }, [localScenes, models, onSave, showToast]);

  // Keydown handler for shortcut capture - uses refs to get current state
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const currentListeningId = listeningSceneIdRef.current;
      if (!currentListeningId) return;

      e.preventDefault();
      e.stopPropagation();

      const newShortcut = extractShortcutFromEvent(e);
      if (!newShortcut) return;

      const currentScenes = localScenesRef.current;
      const scene = currentScenes.find(s => s.id === currentListeningId);
      if (!scene || scene.shortcut === newShortcut) {
        setListeningSceneId(null);
        return;
      }

      // Try register before saving
      const tryRegister = tryRegisterShortcutRef.current;
      if (tryRegister) {
        const result = await tryRegister(newShortcut, scene.id);
        if (!result.success) {
          // Show error modal
          setShortcutError({
            shortcut: newShortcut,
            errorType: (result.errorType as 'unsupported' | 'occupied' | 'unknown') || 'unknown',
            errorMessage: result.error || '',
          });
          setListeningSceneId(null);
          listeningSceneIdRef.current = null;
          if (listeningTimeoutRef.current) {
            clearTimeout(listeningTimeoutRef.current);
          }
          return; // Don't save the new shortcut
        }
      }

      const updatedScene = { ...scene, shortcut: newShortcut };
      const newScenes = currentScenes.map(s => (s.id === currentListeningId ? updatedScene : s));
      setLocalScenes(newScenes);
      localScenesRef.current = newScenes;
      setListeningSceneId(null);
      listeningSceneIdRef.current = null;

      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }

      if (onSaveRef.current) {
        onSaveRef.current(newScenes);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []); // Only register once on mount

  // Handle prompt type quick switch
  const handlePromptTypeClick = useCallback((sceneId: string) => {
    setSelectingPromptTypeSceneId(sceneId);
  }, []);

  const handlePromptTypeSelect = useCallback(async (sceneId: string, promptType: string) => {
    // 关闭弹窗
    setSelectingPromptTypeSceneId(null);

    // 如果选择的是当前类型，不做任何操作
    const currentProfile = llmProfiles.find(p => p.sceneId === sceneId);

    // 判断是否是内置类型
    const builtinTypes = ['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'];
    const isBuiltinType = builtinTypes.includes(promptType);

    // 如果选择的是当前类型（内置类型直接比较，自定义类型比较提示词内容）
    if (currentProfile?.userPromptType === promptType && isBuiltinType) {
      return;
    }

    // 更新 Profile
    try {
      // user_prompt_type 直接存预设名称：
      // - 内置类型：lightPolish, translate, professionalPolish, meetingSecretary
      // - 自定义预设：预设名称（如 "正式表达"）
      let finalPromptType: string;
      let finalPromptCustom: string;

      if (isBuiltinType) {
        // 内置类型
        finalPromptType = promptType;
        finalPromptCustom = currentProfile?.userPromptCustom || '';
      } else {
        // 自定义预设：直接存预设名称
        finalPromptType = promptType;  // 预设名称
        finalPromptCustom = customPresets[promptType] || currentProfile?.userPromptCustom || '';
      }

      const profile: LlmProfile = {
        id: sceneId,
        sceneId: sceneId,
        enabled: currentProfile?.enabled ?? true,
        providerId: currentProfile?.providerId,
        model: currentProfile?.model || '',
        userPromptType: finalPromptType,
        userPromptCustom: finalPromptCustom,
        maxTokens: currentProfile?.maxTokens ?? 1024,
        temperature: currentProfile?.temperature ?? 0.3,
      };

      await saveLlmProfile(profile);

      // 通知父组件
      if (onLlmProfileSave) {
        onLlmProfileSave(profile);
      }

      // 内置类型的 i18n key 映射
      const builtinTypeI18nKey: Record<string, string> = {
        lightPolish: 'lightPolish',
        translate: 'translate',
        professionalPolish: 'professionalPolish',
        meetingSecretary: 'meetingSecretary',
      };
      const toastDesc = isBuiltinType ? t('llmConfig.promptTypes.' + builtinTypeI18nKey[promptType]) : promptType;

      showToast({
        type: 'success',
        title: t('home.promptTypeSwitched'),
        description: toastDesc,
      });
    } catch (error) {
      log.error(`Failed to save prompt type: ${error}`);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(error),
      });
    }
  }, [llmProfiles, onLlmProfileSave, showToast, t, customPresets]);

  const handleTutorialComplete = async () => {
    setShowTutorial(false);
    if (onTutorialComplete) {
      onTutorialComplete();
    }
  };

  // Handle add scene button click
  const handleAddScene = () => {
    setEditingScene(null);
    setShowForm(true);
  };

  // Handle save scene from form
  const handleSaveScene = (scene: Scene) => {
    // Calculate new scenes
    const existing = localScenes.find((s) => s.id === scene.id);
    let newScenes: Scene[];
    if (existing) {
      newScenes = localScenes.map((s) => (s.id === scene.id ? scene : s));
    } else {
      newScenes = [...localScenes, scene];
    }

    // Update local state
    setLocalScenes(newScenes);
    setShowForm(false);
    setEditingScene(null);

    // Notify parent
    if (onSave) {
      onSave(newScenes);
    }
  };

  // Handle cancel form
  const handleCancelForm = () => {
    setShowForm(false);
    setEditingScene(null);
  };

  // Handle language change for a scene's selected model
  const handleLanguageChange = useCallback(async (sceneId: string, language: string) => {
    const scene = localScenes.find(s => s.id === sceneId);
    if (!scene || !scene.model?.modelId) return;

    // Call the model language change handler
    await handleModelLanguageChange(scene.model.modelId, language);
  }, [localScenes]);

  // Handle language change for a model (independent of scene)
  const handleModelLanguageChange = useCallback(async (modelId: string, language: string) => {
    // 直接更新配置，不再通过 props 回调
    try {
      const config = await loadConfig();

      // Update model language preference
      const updatedPrefs = {
        ...(config.modelLanguagePrefs || {}),
        [modelId]: language,
      };

      // Save updated config
      const updatedConfig = {
        ...config,
        modelLanguagePrefs: updatedPrefs
      };
      await saveConfig(updatedConfig);

      // 通知父组件更新状态（如果提供了回调）
      if (onModelLanguagePrefsChange) {
        onModelLanguagePrefsChange(updatedPrefs);
      }

      // Show toast notification
      const langDisplay = getLanguageDisplayName(language, t);
      showToast({
        type: 'success',
        title: t('common.save'),
        description: langDisplay,
      });
    } catch (error) {
      log.error(`Failed to save language config: ${error}`);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(error),
      });
    }
  }, [onModelLanguagePrefsChange, showToast, t]);

  // Convert asrModels to Model[] for SceneForm (same source as ModelConfigPanel)
  const availableModels: Model[] = asrModels.map(model => ({
    id: model.preset.id,
    name: model.preset.name,
    backend: model.preset.backend || 'Whisper',
    size: model.preset.size,
    downloaded: model.downloaded,
    path: model.path,
    downloadUrls: model.preset.downloadUrls || [],
    languages: model.preset.languages || [],
    description: model.preset.description,
    modelType: 'asr',
  }));

  return (
    <div className="min-h-[400px]">
      {/* Page Title with Add Button */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('home.title')}</h1>
          <p className="text-sm text-gray-500">{t('home.subtitle')}</p>
        </div>
        <button
          onClick={handleAddScene}
          disabled={availableModels.length === 0}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-all duration-200 active:scale-95 ${
            availableModels.length === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gray-900 hover:bg-gray-800'
          }`}
        >
          {availableModels.length === 0 ? t('common.loading') : t('sceneList.addScene')}
        </button>
      </div>

      {/* 双击快捷键提示横幅 */}
      {showDoubleTapHint && (
        <div className="mb-4 px-4 py-3 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-gray-700">{t('home.doubleTapHint')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{t('home.doubleTapHintCloseTip')}</span>
            <button
              onClick={() => {
                setShowDoubleTapHint(false);
                localStorage.setItem('voconly-double-tap-hint-closed', 'true');
              }}
              className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          </div>
        </div>
      )}

      {/* Memory Status */}
      <MemoryStatus />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {displayScenes.map((scene, index) => {
          // 检查该场景是否启用了 LLM
          const sceneLlmProfile = llmProfiles.find(p => p.sceneId === scene.id);
          const isLlmEnabled = sceneLlmProfile?.enabled ?? false;

          return (
            <SceneCard
              key={scene.id}
              sceneIndex={index}
              scene={scene}
              model={models.find(m => m.id === scene.model?.modelId)}
              models={models}
              asrModels={asrModels}
              modelLanguagePrefs={modelLanguagePrefs}
              downloadStates={downloadStates}
              isListening={listeningSceneId === scene.id}
              onModelClick={() => handleModelClick(scene.id)}
              onShortcutClick={() => handleShortcutClick(scene.id)}
              onModelSelect={(modelId) => handleModelSelect(scene.id, modelId)}
              onToggleEnabled={() => handleToggleEnabled(scene.id)}
              onLlmConfigClick={() => setLlmConfigScene(scene)}
              llmEnabled={isLlmEnabled}
              llmPromptType={sceneLlmProfile?.userPromptType}
              customPresets={customPresets}
              onPromptTypeClick={() => handlePromptTypeClick(scene.id)}
              isSelectingPromptType={selectingPromptTypeSceneId === scene.id}
              onPromptTypeSelect={(promptType) => handlePromptTypeSelect(scene.id, promptType)}
              onLanguageChange={(lang) => handleLanguageChange(scene.id, lang)}
              onModelLanguageChange={handleModelLanguageChange}
            />
          );
        })}

        {/* Empty State if no scenes */}
        {displayScenes.length === 0 && (
          <div className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
              <MicrophoneIcon />
            </div>
            <h3 className="text-gray-900 font-medium mb-1">{t('home.addMoreScenes')}</h3>
            <p className="text-sm text-gray-500">{t('home.goToSettings')}</p>
          </div>
        )}
      </div>

      {/* LLM 缓存策略说明 - 仅在有启用 LLM 的场景时显示 */}
      {llmProfiles.some(p => p.enabled) && (
        <div className="mt-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-xs text-gray-500 text-center">
            {t('home.llmCacheHint')}
          </p>
        </div>
      )}

      {/* Add/Edit Scene Modal */}
      {showForm && (
        <SceneForm
          scene={editingScene}
          models={availableModels}
          onSave={handleSaveScene}
          onCancel={handleCancelForm}
          existingShortcuts={localScenes.map(s => s.shortcut)}
          checkConflict={(shortcut, excludeSceneId) => {
            const conflict = localScenes.find(
              (s) => s.shortcut === shortcut && s.id !== excludeSceneId && s.enabled
            );
            if (conflict) {
              return t('home.shortcutConflict', { shortcut, scene: conflict.name });
            }
            return null;
          }}
        />
      )}

      {/* LLM Config Modal */}
      {llmConfigScene && (
        <LlmConfigModal
          isOpen={!!llmConfigScene}
          scene={llmConfigScene}
          downloadStates={downloadStates}
          onDownload={onDownload}
          onClose={() => {
            setLlmConfigScene(null);
            // 关闭时重新加载预设（用户可能添加/删除了自定义预设）
            loadCustomPresets();
          }}
          onSave={onLlmProfileSave}
        />
      )}

      {/* Tutorial */}
      {showTutorial && (
        <Tutorial
          onComplete={handleTutorialComplete}
        />
      )}

      {/* Shortcut Error Modal */}
      {shortcutError && (
        <ShortcutErrorModal
          isOpen={!!shortcutError}
          shortcut={shortcutError.shortcut}
          errorType={shortcutError.errorType}
          errorMessage={shortcutError.errorMessage}
          onClose={() => setShortcutError(null)}
        />
      )}

      {/* ASR Model Select Modal */}
      {selectingSceneId && (() => {
        const scene = localScenes.find(s => s.id === selectingSceneId);
        if (!scene) return null;

        return (
          <AsrModelSelectModal
            models={asrModels}
            selectedModelId={scene.model?.modelId ? getFullModelId(scene.model) : ''}
            onSelect={(modelId) => handleModelSelect(selectingSceneId, modelId)}
            onClose={() => setSelectingSceneId(null)}
            downloadStates={downloadStates}
            onDownload={onDownload}
            currentLanguage={i18n.language}
          />
        );
      })()}
    </div>
  );
}
