import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type {
  AsrModelWithStatus,
  LlmModelWithStatus,
  ModelPreset,
  LlmModelPreset,
  QuantVariant,
} from '../services/config';
import type { Model, ProviderWithConfig, LlmProviderInstance } from '../types';
import {
  getAsrModelList,
  getLlmModelList,
  getCustomAsrModelDirs,
  addCustomAsrModelDir,
  removeCustomAsrModelDir,
  QUANT_LABELS as QUANT_LABELS_MAP,
} from '../services/config';
import { getProviderList, saveProviderConfig, deleteProviderConfig, detectGpu } from '../services/llm';
import { createLogger } from '../services/log';
import type { DownloadProgress, DownloadCompleteEvent } from '../services/downloader';
import { subscribeToDownloadComplete, cancelModelDownload } from '../services/downloader';
import ProviderConfigModal from './ProviderConfigModal';
import { useToast } from './ui/Toast';
import { Info } from 'lucide-react';
import { sortAsrModels } from './AsrModelSelectModal';

const log = createLogger('ModelConfigPanel');

// Get model size (formatted: GB for >= 1GB, MB for < 1GB)
// Reuse logic from HomePanel.tsx
function getModelSize(model: AsrModelWithStatus | LlmModelWithStatus): string {
  // Use actual size from disk if available
  if (model.sizeMb) {
    const mb = model.sizeMb;
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)}GB`;
    }
    return `${mb}MB`;
  }
  // Or use preset size
  if (model.preset.size) {
    const sizeStr = model.preset.size.toUpperCase();
    if (sizeStr.includes('GB') || sizeStr.includes('MB')) {
      return model.preset.size;
    }
  }
  return '';
}

// Score bar component for model quality metrics
const ScoreBar = ({ label, score, color = 'blue' }: { label: string; score: number; color?: 'blue' | 'green' }) => (
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-gray-500 w-10 flex-shrink-0 text-right">{label}</span>
    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[72px]">
      <div
        className={`h-full rounded-full ${color === 'blue' ? 'bg-teal-600' : 'bg-amber-300'}`}
        style={{ width: `${(score || 0) * 100}%` }}
      />
    </div>
  </div>
);

// Provider logo mapping (meta.id -> icon file name)
const PROVIDER_LOGO_MAP: Record<string, string> = {
  ollama: 'ollama.png',
  openai: 'openai.png',
  deepseek: 'deepseek.png',
  gemini: 'gemini.png',
  glm: 'zhipu.png',          // 智谱 AI
  minimax: 'minimax.png',
  kimi: 'kimi.png',
  qwen: 'qwen.png',
  claude: 'anthropic.png',   // Anthropic Claude
  groq: 'groq.png',
  openrouter: 'openrouter.png',
  cerebras: 'cerebras.png',
  siliconflow: 'siliconflow.png',
  yi: 'yi.png',
  custom: 'custom.png',
  llama_cpp: 'llamacpp.png',
};

// Get provider logo path
const getProviderLogo = (providerId: string): string | null => {
  const logoFile = PROVIDER_LOGO_MAP[providerId];
  if (logoFile) {
    return `/icons/${logoFile}`;
  }
  return null;
};

// ASR model logo mapping (model id prefix -> icon file name)
const ASR_MODEL_LOGO_MAP: Record<string, string> = {
  'whisper': 'openai.png',      // OpenAI Whisper
  'ggml-': 'openai.png',        // GGML 格式的 Whisper 模型（如 ggml-turbo.bin）
  'qwen': 'qwen.png',           // Alibaba Qwen/SenseVoice 系列（qwen3-asr, sensevoice 等）
  'nemotron': 'nvidia.svg',     // NVIDIA Nemotron
  'parakeet': 'nvidia.svg',     // NVIDIA Parakeet
  'sensevoice': 'qwen.png',     // Alibaba SenseVoice（兼容旧版命名）
  'moonshine': 'custom.png',    // Moonshine
  'cohere': 'cohere-logo.svg',
};

// 推荐模型配置（根据语言场景推荐）
// 中文场景推荐：Qwen3-ASR（中英混合）、SenseVoice（中文优）
const ZH_RECOMMENDED_MODELS: Set<string> = new Set([
  'Qwen3-ASR-1.7B',
  'qwen3-asr-1.7b',
  'sensevoice-small',
  'SenseVoice-Small',
]);
// 英文场景推荐：Parakeet Unified EN、Cohere Transcribe
const EN_RECOMMENDED_MODELS: Set<string> = new Set([
  'parakeet-unified-en-0.6b',
  'Parakeet-Unified-EN-0.6B',
  'cohere-transcribe-03-2026',
  'Cohere-Transcribe-03-2026',
]);

// Get ASR model logo path based on model id
const getAsrModelLogo = (modelId: string): string => {
  const lowerModelId = modelId.toLowerCase();
  for (const [prefix, logoFile] of Object.entries(ASR_MODEL_LOGO_MAP)) {
    if (lowerModelId.startsWith(prefix.toLowerCase())) {
      return `/icons/${logoFile}`;
    }
  }
  // 默认图标
  return '/icons/custom.png';
};

// Default ASR models with descriptions
const DEFAULT_ASR_MODELS: (ModelPreset & { descriptionKey: string })[] = [
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    size: '75MB',
    modelType: 'asr',
    backend: 'Whisper',
    languages: ['zh', 'en'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.whisperTiny',
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base',
    size: '142MB',
    modelType: 'asr',
    backend: 'Whisper',
    languages: ['zh', 'en'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.whisperBase',
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small',
    size: '244MB',
    modelType: 'asr',
    backend: 'Whisper',
    languages: ['zh', 'en'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.whisperSmall',
  },
  {
    id: 'whisper-medium',
    name: 'Whisper Medium',
    size: '1.5GB',
    modelType: 'asr',
    backend: 'Whisper',
    languages: ['zh', 'en'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.whisperMedium',
  },
  {
    id: 'whisper-large',
    name: 'Whisper Large',
    size: '2.9GB',
    modelType: 'asr',
    backend: 'Whisper',
    languages: ['zh', 'en'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.whisperLarge',
  },
  {
    id: 'whisper-turbo',
    name: 'Whisper Turbo',
    size: '1.6GB',
    modelType: 'asr',
    backend: 'Whisper',
    languages: ['zh', 'en'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.whisperTurbo',
  },
  {
    id: 'sensevoice-small',
    name: 'SenseVoice Small',
    size: '229MB',
    modelType: 'asr',
    backend: 'Onnx',
    languages: ['zh', 'zh-yue', 'en', 'ja', 'ko'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.sensevoiceSmall',
  },
  {
    id: 'parakeet-v3',
    name: 'Parakeet V3',
    size: '640MB',
    modelType: 'asr',
    backend: 'Onnx',
    languages: ['zh', 'en'],
    downloadUrls: [],
    descriptionKey: 'models.descriptions.parakeetV3',
  },
];

// Default LLM models
const DEFAULT_LLM_MODELS: (LlmModelPreset & { descriptionKey: string })[] = [
  {
    id: 'Qwen3-4B-Instruct-2507-Q4_K_M',
    name: 'Qwen3-4B-Instruct-2507 Q4_K_M',
    size: '~2.5GB',
    downloadUrls: [],
    nGpuLayers: -1,
    nCtx: 4096,
    recommended: true,
    description: '',
    descriptionKey: 'models.descriptions.qwen3b',
  },
  {
    id: 'Qwen3.5-9B-Q4_K_M',
    name: 'Qwen3.5-9B-Q4_K_M',
    size: '~6GB',
    downloadUrls: [],
    nGpuLayers: -1,
    nCtx: 4096,
    recommended: false,
    description: '',
    descriptionKey: 'models.descriptions.qwen7b',
  },
];

interface ModelConfigPanelProps {
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
  onDownloadCancel?: (modelId: string) => void;
  onConfigUpdate?: () => void; // 通知父组件重新加载配置
}

// Icons
const DownloadIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const CheckIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  } else {
    return `${(bytes / 1024).toFixed(0)}KB`;
  }
};

// ASR Model Card Component
interface AsrModelCardProps {
  model: AsrModelWithStatus;
  onDownload: () => void;
  onCancelDownload: (quant?: string) => void;  // 取消下载，可选指定量化版本
  t: (key: string) => string;
  currentLanguage: string;  // 当前系统语言
  quantVariants?: QuantVariant[];  // 可用的量化版本列表（从 catalog 获取）
  onDownloadWithQuant?: (variant: QuantVariant) => void;  // 选择量化版本后下载
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>; // 各版本的下载状态
}

function AsrModelCard({
  model,
  onDownload,
  onCancelDownload,
  t,
  currentLanguage,
  quantVariants,
  onDownloadWithQuant,
  downloadStates,
}: AsrModelCardProps) {
  const isDownloaded = model.downloaded;
  const knownModel = DEFAULT_ASR_MODELS.find((m) => m.id === model.preset.id);
  const description = knownModel ? t(knownModel.descriptionKey) : model.preset.description;
  const logoPath = getAsrModelLogo(model.preset.id);

  // 获取已下载版本
  const downloadedQuants = model.downloadedQuants || model.preset.downloadedQuants || [];

  // 合并版本信息：已下载的 + catalog 中的
  const hasMultipleQuantVariants = quantVariants && quantVariants.length > 1;

  // 量化版本面板展开状态（默认收起）
  const [showQuantPanel, setShowQuantPanel] = useState(false);

  // 根据当前语言决定是否显示推荐徽章
  const shouldShowRecommendation = (): boolean => {
    const isZhLanguage = currentLanguage.startsWith('zh');
    if (isZhLanguage) {
      return ZH_RECOMMENDED_MODELS.has(model.preset.id);
    } else {
      return EN_RECOMMENDED_MODELS.has(model.preset.id);
    }
  };
  const showRecommendation = shouldShowRecommendation();

  // 计算已下载版本的总大小
  const totalDownloadedSize = downloadedQuants.reduce((sum, quant) => {
    const variant = quantVariants?.find(v => v.quant === quant);
    return sum + (variant?.sizeBytes || 0);
  }, 0);

  return (
    <div
      onClick={() => {
        if (hasMultipleQuantVariants || isDownloaded) {
          // 有多个量化版本或已下载：展开/收起量化面板
          setShowQuantPanel(!showQuantPanel);
        }
      }}
      className={`group relative rounded-xl border transition-all duration-200 ${
        hasMultipleQuantVariants || isDownloaded
          ? 'cursor-pointer'
          : ''
      } ${
        isDownloaded
          ? 'border-gray-200 bg-gray-50 hover:border-gray-300'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="relative px-3 py-2 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-6">
            {/* ASR Model Logo */}
            {logoPath && (
              <img
                src={logoPath}
                alt={model.preset.name}
                className="w-5 h-5 object-contain flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              {/* Model Name with recommendation badge */}
              <div className="flex items-center gap-2 text-gray-800">
                <h3 className="font-semibold text-sm truncate">
                  {model.preset.name}
                  {getModelSize(model) && <span className="text-gray-400 font-normal ml-1">({getModelSize(model)})</span>}
                </h3>
                {/* Recommendation badge */}
                {showRecommendation && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded bg-emerald-600 text-white">
                    推荐
                  </span>
                )}
              </div>
              {/* Description */}
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{description}</p>
              {/* Accuracy and Speed Scores */}
              {(model.preset.accuracyScore !== undefined || model.preset.speedScore !== undefined) && (
                <div className="flex items-center gap-4 mt-2">
                  {model.preset.accuracyScore !== undefined && (
                    <ScoreBar label={t('models.accuracy')} score={model.preset.accuracyScore} color="blue" />
                  )}
                  {model.preset.speedScore !== undefined && (
                    <ScoreBar label={t('models.speed')} score={model.preset.speedScore} color="green" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status/Action */}
          <div className="relative flex-shrink-0 z-10 min-w-[72px] text-right">
            {isDownloaded ? (
              // 已下载模型：显示已下载版本状态
              <div className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg">
                <span className="text-gray-500">
                  {downloadedQuants.length > 0
                    ? `${t('models.downloaded')} ${downloadedQuants.length}`
                    : t('models.downloaded')}
                </span>
                {(hasMultipleQuantVariants || downloadedQuants.length > 0) && (
                  <span className="text-gray-400">{showQuantPanel ? '▲' : '▼'}</span>
                )}
              </div>
            ) : (
              // 未下载：显示下载按钮
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasMultipleQuantVariants) {
                    // 有多个版本：展开/收起量化面板
                    setShowQuantPanel(!showQuantPanel);
                  } else {
                    // 只有一个版本：直接下载
                    onDownload();
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors hover:bg-gray-100 ${
                  hasMultipleQuantVariants ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                <DownloadIcon className="w-4 h-4" />
                <span>{t('models.download')}</span>
                {hasMultipleQuantVariants && (
                  <span className="text-gray-400">{showQuantPanel ? '▲' : '▼'}</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 量化版本面板 - 有多个量化版本的模型，点击下载按钮后展开 */}
        {showQuantPanel && hasMultipleQuantVariants && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-xs text-gray-500 mb-2">{t('models.quantVersions')}:</div>
            <div className="space-y-1.5">
              {quantVariants?.map((variant) => {
                const isDownloadedVariant = downloadedQuants.includes(variant.quant);
                const variantKey = `${model.preset.id}-${variant.quant}`;
                const variantDownloadState = downloadStates?.[variantKey];
                const isVariantDownloading = variantDownloadState?.downloading ?? false;
                const variantProgress = variantDownloadState?.progress;

                // 检查当前下载数量是否已达上限（最多 5 个）
                const currentDownloadCount = Object.values(downloadStates || {}).filter(
                  state => state.downloading
                ).length;
                const canStartDownload = currentDownloadCount < 5 || isVariantDownloading;

                return (
                  <div
                    key={variant.quant}
                    className={`relative flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      isVariantDownloading ? '' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Item progress background */}
                    {isVariantDownloading && (
                      <div className="absolute inset-0 overflow-hidden rounded-lg">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-100/60 to-blue-50/40 transition-all duration-300 ease-out"
                          style={{ width: `${variantProgress?.percentage ?? 0}%` }}
                        />
                      </div>
                    )}

                    <div className="relative flex items-center gap-2 z-10">
                      {/* Display precision label with size in parentheses */}
                      <span className="font-medium text-gray-700">
                        {QUANT_LABELS_MAP[variant.quant]
                          ? t(`models.quantLabels.${QUANT_LABELS_MAP[variant.quant]}`)
                          : variant.quant}
                        <span className="text-gray-400 font-normal ml-0.5">({formatBytes(variant.sizeBytes)})</span>
                      </span>
                      {variant.isRecommended && (
                        <span className="px-1 py-0.5 text-[10px] font-medium bg-green-50 text-green-600 rounded">
                          {t('models.recommended')}
                        </span>
                      )}
                    </div>
                    <div className="relative flex items-center gap-2 z-10">
                      {isVariantDownloading ? (
                        // 下载中：显示进度和取消按钮
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-blue-600">{variantProgress?.percentage || 0}%</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onCancelDownload(variant.quant);  // 只取消当前版本
                            }}
                            className="text-xs text-red-500 hover:text-red-600 underline"
                          >
                            {t('models.cancel')}
                          </button>
                        </div>
                      ) : isDownloadedVariant ? (
                        <span className="text-emerald-600 font-medium">{t('models.downloaded')}</span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canStartDownload) {
                              return; // 超过下载数量限制
                            }
                            if (onDownloadWithQuant) {
                              onDownloadWithQuant(variant);
                            }
                          }}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            canStartDownload
                              ? 'text-blue-600 hover:bg-blue-50'
                              : 'text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {t('models.download')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 已下载版本统计 */}
            {downloadedQuants.length > 0 && (
              <div className="mt-2 text-xs text-gray-400">
                {t('models.downloadedCount')}: {downloadedQuants.length},
                {t('models.totalSize')}: {formatBytes(totalDownloadedSize)}
              </div>
            )}
          </div>
        )}

              </div>
    </div>
  );
}

// LLM Model Card Component
interface LlmModelCardProps {
  model: LlmModelWithStatus;
  isDownloading: boolean;
  downloadProgress?: DownloadProgress;
  onDownload: () => void;
  onDownloadCancel?: () => void;
  t: (key: string) => string;
}

function LlmModelCard({ model, isDownloading, downloadProgress, onDownload, onDownloadCancel, t }: LlmModelCardProps) {
  const isDownloaded = model.downloaded;
  const knownModel = DEFAULT_LLM_MODELS.find((m) => m.id === model.preset.id);
  const description = knownModel ? t(knownModel.descriptionKey) : model.preset.description;

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all duration-200 overflow-hidden">
      {/* Full-card progress background */}
      {isDownloading && (
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-100/60 to-blue-50/40 transition-all duration-300 ease-out"
            style={{ width: `${downloadProgress?.percentage ?? 0}%` }}
          />
          <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      )}

      <div className="relative px-3 py-2 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 pr-6">
            {/* Model Name */}
            <h3 className="font-semibold text-sm text-gray-800">
              {model.preset.name}
              {getModelSize(model) && <span className="text-gray-400 font-normal ml-1">({getModelSize(model)})</span>}
            </h3>
            {/* Description */}
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{description}</p>
          </div>

          {/* Status/Action */}
          <div className="relative flex-shrink-0 z-10 min-w-[72px] text-right">
            {isDownloaded ? (
              <CheckIcon className="w-4 h-4 text-emerald-600" />
            ) : isDownloading ? (
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs font-medium text-blue-600">{downloadProgress?.percentage || 0}%</span>
                {onDownloadCancel && (
                  <button
                    onClick={onDownloadCancel}
                    className="text-xs text-red-500 hover:text-red-600 underline"
                  >
                    {t('models.cancel')}
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={onDownload}
                className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
              >
                <DownloadIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Cloud Provider Card Component - updated to use ProviderWithConfig
interface CloudProviderCardProps {
  provider: ProviderWithConfig;
  onConfigure: () => void;
  onEdit: () => void;
  t: (key: string) => string;
}

function CloudProviderCard({ provider, onConfigure, onEdit, t }: CloudProviderCardProps) {
  const isConfigured = provider.instance?.enabled ?? false;
  const logoPath = getProviderLogo(provider.meta.id);

  return (
    <div
      onClick={onConfigure}
      className={`group relative rounded-xl border transition-all duration-200 cursor-pointer ${
        isConfigured
          ? 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-6">
            {/* Provider Logo */}
            {logoPath && (
              <img
                src={logoPath}
                alt={provider.meta.label}
                className="w-5 h-5 object-contain flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              {/* Provider Name */}
              <h3 className="font-semibold text-sm text-gray-800 truncate">
                {provider.meta.id === 'llama_cpp' ? t('provider.llamaCppLabel') : provider.meta.label}
              </h3>
              {/* Description */}
              <p className="text-xs text-gray-400 mt-0.5 truncate">{provider.meta.description}</p>
            </div>
          </div>

          {/* Configure/Status Button */}
          <div className="flex-shrink-0">
            {isConfigured ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-600 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors"
                >
                  <CheckIcon className="w-3 h-3" />
                  <span className="text-xs font-medium">{t('models.configured')}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title={t('common.edit')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg group-hover:bg-amber-100 transition-colors">
                {t('models.setup')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ModelConfigPanel({
  downloadStates = {},
  onDownload,
  onDownloadCancel,
  onConfigUpdate,
}: ModelConfigPanelProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const currentLanguage = i18n.language;

  // State
  const [asrModels, setAsrModels] = useState<AsrModelWithStatus[]>([]);
  const [llmModels, setLlmModels] = useState<LlmModelWithStatus[]>([]);
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [customDirs, setCustomDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithConfig | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showCustomDirModal, setShowCustomDirModal] = useState(false);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [asrResult, llmResult, providerResult, customDirsResult] = await Promise.all([
          getAsrModelList(),
          getLlmModelList(),
          getProviderList(),
          getCustomAsrModelDirs(),
        ]);
        setAsrModels(asrResult);
        setLlmModels(llmResult);
        setProviders(providerResult);
        setCustomDirs(customDirsResult);
        log.info(
          `Loaded ${asrResult.length} ASR models, ${llmResult.length} LLM models, ${providerResult.length} providers, ${customDirsResult.length} custom dirs`
        );
      } catch (err) {
        log.error(`Failed to load model data: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Reload on download complete
  useEffect(() => {
    let mounted = true;
    const unlisten = subscribeToDownloadComplete((event: DownloadCompleteEvent) => {
      if (!mounted) return;

      // Check if this is an LLM model download (non-ASR model)
      const downloadedModelId = event.modelId;
      const isLlmDownload = downloadedModelId && !downloadedModelId.startsWith('whisper') &&
                            !downloadedModelId.startsWith('sensevoice') &&
                            !downloadedModelId.startsWith('moonshine') &&
                            !downloadedModelId.startsWith('parakeet');

      Promise.all([getAsrModelList(), getLlmModelList(), getProviderList()])
        .then(async ([asrResult, llmResult, providerList]) => {
          if (!mounted) return;
          setAsrModels(asrResult);
          setLlmModels(llmResult);
          setProviders(providerList);

          // Auto-configure llama.cpp provider if an LLM model was downloaded and llama.cpp is not configured
          if (isLlmDownload) {
            const llamaProvider = providerList.find(p => p.meta.id === 'llama_cpp');
            const downloadedModel = llmResult.find(m => m.downloaded);

            if (llamaProvider && !llamaProvider.instance?.enabled && downloadedModel) {
              log.info(`[ModelConfig] Auto-configuring llama.cpp with downloaded model: ${downloadedModel.preset.id}`);

              try {
                // Detect GPU for optimal n_gpu_layers
                let nGpuLayers = -1; // Default: try GPU
                try {
                  const gpuInfo = await detectGpu();
                  if (gpuInfo.available && gpuInfo.recommendedLayers > 0) {
                    nGpuLayers = gpuInfo.recommendedLayers;
                  }
                } catch (e) {
                  log.warn(`[ModelConfig] GPU detection failed, using default: ${e}`);
                }

                const instance: LlmProviderInstance = {
                  metaId: 'llama_cpp',
                  enabled: true,
                  baseUrl: '',
                  defaultModel: downloadedModel.preset.id,
                  nGpuLayers: nGpuLayers,
                };

                await saveProviderConfig('llama_cpp', instance);
                log.info(`[ModelConfig] llama.cpp auto-configured successfully`);

                // Refresh provider list
                const updatedProviders = await getProviderList();
                if (mounted) {
                  setProviders(updatedProviders);
                }
              } catch (err) {
                log.error(`[ModelConfig] Failed to auto-configure llama.cpp: ${err}`);
              }
            }
          }
        })
        .catch((err) => log.error(`Failed to reload models: ${err}`));
    });
    return () => {
      mounted = false;
      unlisten.then((fn) => fn());
    };
  }, []);

  // Handlers
  const handleAsrDownload = (model: AsrModelWithStatus) => {
    if (onDownload) {
      // Build a Model object from AsrModelWithStatus
      const modelObj: Model = {
        id: model.preset.id,
        name: model.preset.name,
        backend: model.preset.backend || 'Whisper',
        size: model.preset.size,
        downloaded: model.downloaded,
        downloadUrls: model.preset.downloadUrls || [],
        languages: model.preset.languages || [],
        description: model.preset.description,
        modelType: 'asr',
      };
      onDownload(modelObj);
    }
  };

  const handleLlmDownload = (model: LlmModelWithStatus) => {
    if (onDownload) {
      // Build a Model object from LlmModelWithStatus
      const modelObj: Model = {
        id: model.preset.id,
        name: model.preset.name,
        backend: 'Whisper', // Placeholder, not used for LLM
        size: model.preset.size,
        downloaded: model.downloaded,
        downloadUrls: model.preset.downloadUrls || [],
        languages: [],
        description: model.preset.description,
        modelType: 'llm',
      };
      onDownload(modelObj);
    }
  };

  const handleDownloadCancel = async (modelId: string) => {
    try {
      log.info(`Canceling download for model: ${modelId}`);
      const success = await cancelModelDownload(modelId);
      if (success) {
        log.info(`Download cancelled successfully for ${modelId}`);
        if (onDownloadCancel) {
          onDownloadCancel(modelId);
        }
      } else {
        log.warn(`No active download found for ${modelId}`);
      }
    } catch (error) {
      log.error(`Failed to cancel download: ${error}`);
    }
  };

  // Handle import custom ASR model directory
  const handleImportCustomDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('modelConfig.importCustomDirTitle'),
      });

      if (selected) {
        const result = await addCustomAsrModelDir(selected as string);
        if (result) {
          // Refresh model list and custom dirs
          const [asrResult, customDirsResult] = await Promise.all([
            getAsrModelList(),
            getCustomAsrModelDirs(),
          ]);
          setAsrModels(asrResult);
          setCustomDirs(customDirsResult);
          // Notify parent to reload config from file
          onConfigUpdate?.();
          showToast({
            type: 'success',
            title: t('modelConfig.customDirAdded'),
            description: selected as string,
          });
        }
      }
    } catch (err) {
      log.error(`Failed to import custom directory: ${err}`);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(err),
      });
    }
  };

  // Handle remove custom ASR model directory
  const handleRemoveCustomDir = async (dirPath: string) => {
    try {
      const result = await removeCustomAsrModelDir(dirPath);
      if (result) {
        // Refresh model list and custom dirs
        const [asrResult, customDirsResult] = await Promise.all([
          getAsrModelList(),
          getCustomAsrModelDirs(),
        ]);
        setAsrModels(asrResult);
        setCustomDirs(customDirsResult);
        // Notify parent to reload config from file
        onConfigUpdate?.();
        showToast({
          type: 'success',
          title: t('modelConfig.customDirRemoved'),
          description: dirPath,
        });
      }
    } catch (err) {
      log.error(`Failed to remove custom directory: ${err}`);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(err),
      });
    }
  };

  const handleProviderConfigure = (providerId: string) => {
    const provider = providers.find((p) => p.meta.id === providerId);
    if (provider) {
      setSelectedProvider(provider);
      setShowProviderModal(true);
    }
  };

  // Check if any ASR model is downloaded
  const hasDownloadedAsr = asrModels.some((m) => m.downloaded);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-gray-500">{t('models.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] space-y-6">
      {/* Page Header */}
      <div className="p-4 bg-gray-100 border border-gray-200 rounded-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t('modelConfig.title')}</h1>
        <p className="text-sm text-gray-600 mt-0.5">{t('modelConfig.subtitle')}</p>
      </div>

      {/* Section 1: ASR Models - Voice to Text */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible">
        <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">{t('modelConfig.asrTitle')}</h2>
                  {hasDownloadedAsr ? (
                    <>
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-900 text-white rounded-full">
                        <CheckIcon className="w-3 h-3" />
                        {t('models.ready')}
                      </span>
                      {/* Info icon with hover tooltip */}
                      <div className="relative group">
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                        <div className="absolute top-full left-0 z-50 pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                          <div className="w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
                            <p className="font-medium text-gray-900 mb-2">{t('modelConfig.asrMoreModelsInfo')}</p>
                            <div className="space-y-1 mb-2">
                              <button
                                onClick={() => openUrl('https://modelscope.cn/profile/voconly')}
                                className="text-blue-600 hover:text-blue-700 hover:underline block"
                              >
                                ModelScope (魔搭社区)
                              </button>
                              <button
                                onClick={() => openUrl('https://huggingface.co/voconly')}
                                className="text-blue-600 hover:text-blue-700 hover:underline block"
                              >
                                HuggingFace
                              </button>
                            </div>
                            <div className="border-t border-gray-200 pt-2 mt-2">
                              <p className="text-gray-600 mb-1">{t('modelConfig.asrQuantizationPriority')}</p>
                              <p className="text-gray-500">{t('modelConfig.asrDownloadHint')}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 rounded-full border border-red-200">
                      必须选择
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{t('modelConfig.asrSubtitle')}</p>
              </div>
            </div>
            {/* Custom model directories button */}
            <button
              onClick={() => setShowCustomDirModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 hover:text-gray-700 transition-colors"
              title={t('modelConfig.customDirManageHint')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              {t('modelConfig.customDirManage')}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Warning for no ASR */}
          {!hasDownloadedAsr && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">{t('modelConfig.asrRequired')}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortAsrModels(asrModels, currentLanguage).map((model) => {
              const quantVariants = model.quantVariants || [];

              return (
              <AsrModelCard
                key={model.preset.id}
                model={model}
                onDownload={() => handleAsrDownload(model)}
                onCancelDownload={(quant) => {
                  if (quant) {
                    // 取消特定量化版本的下载
                    handleDownloadCancel(`${model.preset.id}-${quant}`);
                  } else {
                    // 取消所有下载（向后兼容）
                    quantVariants.forEach(v => {
                      handleDownloadCancel(`${model.preset.id}-${v.quant}`);
                    });
                    handleDownloadCancel(model.preset.id);
                  }
                }}
                t={t}
                currentLanguage={currentLanguage}
                quantVariants={quantVariants}
                downloadStates={downloadStates}
                onDownloadWithQuant={(variant) => {
                  // 根据选择的量化版本更新下载 URL
                  const modelObj: Model = {
                    id: `${model.preset.id}-${variant.quant}`,
                    name: `${model.preset.name} (${variant.quant})`,
                    backend: model.preset.backend || 'Whisper',
                    size: model.preset.size,
                    downloaded: model.downloaded,
                    downloadUrls: model.preset.downloadUrls.map(url => ({
                      ...url,
                      url: url.url.substring(0, url.url.lastIndexOf('/') + 1) + variant.filename,
                    })),
                    languages: model.preset.languages || [],
                    description: model.preset.description,
                    modelType: 'asr',
                  };
                  onDownload?.(modelObj);
                }}
              />
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 2: Local LLM Models */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{t('modelConfig.llmTitle')}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{t('modelConfig.llmSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {llmModels.map((model) => (
              <LlmModelCard
                key={model.preset.id}
                model={model}
                isDownloading={downloadStates[model.preset.id]?.downloading ?? false}
                downloadProgress={downloadStates[model.preset.id]?.progress}
                onDownload={() => handleLlmDownload(model)}
                onDownloadCancel={() => handleDownloadCancel(model.preset.id)}
                t={t}
              />
            ))}
          </div>

          {llmModels.length === 0 && (
            <div className="p-8 bg-gray-50 border border-gray-200 rounded-xl text-center">
              <p className="text-gray-500">{t('modelConfig.noLlmModels')}</p>
            </div>
          )}
        </div>
      </section>

      {/* Section 3: LLM Providers - Local & Cloud */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{t('modelConfig.llmProvidersTitle')}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{t('modelConfig.llmProvidersSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Local LLM (llama_cpp) first */}
            {providers
              .filter((provider) => provider.meta.id === 'llama_cpp')
              .map((provider) => (
                <CloudProviderCard
                  key={provider.meta.id}
                  provider={provider}
                  onConfigure={() => handleProviderConfigure(provider.meta.id)}
                  onEdit={() => handleProviderConfigure(provider.meta.id)}
                  t={t}
                />
              ))}

            {/* Cloud providers */}
            {providers
              .filter((provider) => provider.meta.id !== 'llama_cpp')
              .map((provider) => (
                <CloudProviderCard
                  key={provider.meta.id}
                  provider={provider}
                  onConfigure={() => handleProviderConfigure(provider.meta.id)}
                  onEdit={() => handleProviderConfigure(provider.meta.id)}
                  t={t}
                />
              ))}
          </div>
        </div>
      </section>

      {/* Provider Config Modal */}
      {showProviderModal && selectedProvider && (
        <ProviderConfigModal
          provider={selectedProvider}
          onClose={() => {
            setShowProviderModal(false);
            setSelectedProvider(null);
          }}
          onSave={async (providerId, instance) => {
            // Save to backend first
            await saveProviderConfig(providerId, instance);
            // Refresh provider list after save
            const list = await getProviderList();
            setProviders(list);
            setShowProviderModal(false);
            setSelectedProvider(null);
            showToast({
              type: 'success',
              title: t('modelConfig.providerSaved'),
              description: selectedProvider.meta.label,
            });
          }}
          onDelete={async (providerId) => {
            // Delete from backend first
            await deleteProviderConfig(providerId);
            // Refresh provider list after delete
            const list = await getProviderList();
            setProviders(list);
            setShowProviderModal(false);
            setSelectedProvider(null);
            showToast({
              type: 'info',
              title: t('modelConfig.providerDeleted'),
              description: selectedProvider.meta.label,
            });
          }}
        />
      )}

      {/* Custom Directory Management Modal */}
      {showCustomDirModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('modelConfig.customDirModalTitle')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{t('modelConfig.customDirModalDesc')}</p>
              </div>
              <button
                onClick={() => setShowCustomDirModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              {/* Add button */}
              <button
                onClick={handleImportCustomDir}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="font-medium">{t('modelConfig.addCustomDir')}</span>
              </button>

              {/* Directory list */}
              <div className="mt-4">
                {customDirs.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <p className="text-sm">{t('modelConfig.noCustomDirs')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customDirs.map((dirPath) => (
                      <div
                        key={dirPath}
                        className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl group hover:bg-gray-100 transition-colors"
                      >
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="flex-1 text-sm text-gray-700 truncate" title={dirPath}>{dirPath}</span>
                        <button
                          onClick={() => handleRemoveCustomDir(dirPath)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('modelConfig.removeCustomDir')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowCustomDirModal(false)}
                className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
