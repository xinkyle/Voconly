import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Model, BackendType } from '../types';
import type { DownloadProgress } from '../services/downloader';
import type { AsrModelWithStatus, LlmModelWithStatus } from '../services/config';
import { invoke } from '../utils/tauri';
import { getAsrModelList, getLlmModelList } from '../services/config';
import { subscribeToDownloadComplete, cancelModelDownload } from '../services/downloader';
import { createLogger } from '../services/log';
import { AudioLines } from 'lucide-react';

// 创建日志记录器
const log = createLogger('ModelList');

// Backend labels
const BACKEND_LABELS: Record<BackendType, { label: string; color: string }> = {
  Whisper: { label: 'Whisper', color: 'bg-orange-50 text-orange-600 border-orange-200' },
  Onnx: { label: 'ONNX', color: 'bg-purple-50 text-purple-600 border-purple-200' },
};

// LLM backend label (for GGUF models)
const LLM_BACKEND_LABEL = { label: 'LLM', color: 'bg-blue-50 text-blue-600 border-blue-200' };

// Default available models from project config with description keys for i18n
// Used as fallback when scan fails, and to provide i18n descriptions for known models
const DEFAULT_AVAILABLE_MODELS: (Model & { descriptionKey: string })[] = [
  { id: 'whisper-tiny', name: 'Whisper Tiny', backend: 'Whisper', size: '75MB', downloaded: false, downloadUrls: [{ name: 'HuggingFace', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin', isChinaAccessible: false, priority: 0 }], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperTiny' },
  { id: 'whisper-base', name: 'Whisper Base', backend: 'Whisper', size: '142MB', downloaded: false, downloadUrls: [{ name: 'HuggingFace', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin', isChinaAccessible: false, priority: 0 }], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperBase' },
  { id: 'whisper-small', name: 'Whisper Small', backend: 'Whisper', size: '244MB', downloaded: false, downloadUrls: [{ name: 'HuggingFace', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin', isChinaAccessible: false, priority: 0 }], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperSmall' },
  { id: 'whisper-medium', name: 'Whisper Medium', backend: 'Whisper', size: '1.5GB', downloaded: false, downloadUrls: [{ name: 'HuggingFace', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin', isChinaAccessible: false, priority: 0 }], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperMedium' },
  { id: 'whisper-large', name: 'Whisper Large', backend: 'Whisper', size: '2.9GB', downloaded: false, downloadUrls: [{ name: 'HuggingFace', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin', isChinaAccessible: false, priority: 0 }], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperLarge' },
  { id: 'whisper-turbo', name: 'Whisper Turbo', backend: 'Whisper', size: '1.6GB', downloaded: false, downloadUrls: [{ name: 'HuggingFace', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-turbo.bin', isChinaAccessible: false, priority: 0 }], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperTurbo' },
  { id: 'sensevoice-small', name: 'SenseVoice Small', backend: 'Onnx', size: '229MB', downloaded: false, downloadUrls: [{ name: 'ModelScope', url: 'https://modelscope.cn/models/savagexy23/sensevoice/resolve/main/sensevoice-small.zip', isChinaAccessible: true, priority: 0 }], languages: ['zh', 'zh-yue', 'en', 'ja', 'ko'], descriptionKey: 'models.descriptions.sensevoiceSmall' },
  { id: 'parakeet-v3', name: 'Parakeet V3', backend: 'Onnx', size: '640MB', downloaded: false, downloadUrls: [{ name: 'ModelScope', url: 'https://modelscope.cn/models/savagexy23/parakeet-v3/resolve/main/parakeet-v3.zip', isChinaAccessible: true, priority: 0 }], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.parakeetV3' },
  // LLM models
  { id: 'Qwen3-4B-Instruct-2507-Q4_K_M', name: 'Qwen3-4B-Instruct-2507-Q4_K_M', backend: 'Whisper', size: '~2.5GB', downloaded: false, downloadUrls: [], languages: [], descriptionKey: 'models.descriptions.qwen3b' },
  { id: 'Qwen3.5-9B-Q4_K_M', name: 'Qwen3.5-9B-Q4_K_M', backend: 'Whisper', size: '~6GB', downloaded: false, downloadUrls: [], languages: [], descriptionKey: 'models.descriptions.qwen7b' },
];

interface ModelListProps {
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
  onDownloadCancel?: (modelId: string) => void;
  autoDownloadModelId?: string;
}

interface ModelWithStatus extends Model {
  downloading?: boolean;
  downloadProgress?: DownloadProgress;
  error?: string;
  descriptionKey?: string;
  isUserModel?: boolean;  // 是否为用户自定义模型（无下载源）
  modelType?: 'asr' | 'llm';  // 模型类型：ASR 或 LLM
  accuracyScore?: number;  // 准确度评分 0-1
  speedScore?: number;  // 速度评分 0-1
}

// Filter component
const FilterButton = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
      active
        ? 'bg-gray-900 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
);

// Check icon component
const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

// Folder icon component
const FolderIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

// Custom badge component for user models
const CustomBadge = ({ t }: { t: (key: string) => string }) => (
  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-600 rounded-full border border-amber-200">
    {t('models.custom')}
  </span>
);

// Score bar component for model quality metrics
const ScoreBar = ({ label, score, color = 'blue' }: { label: string; score: number; color?: 'blue' | 'green' }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500 w-16 text-right">{label}</span>
    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color === 'blue' ? 'bg-blue-500' : 'bg-green-500'}`}
        style={{ width: `${score * 100}%` }}
      />
    </div>
  </div>
);

export default function ModelList({ downloadStates = {}, onDownload, onDownloadCancel, autoDownloadModelId }: ModelListProps) {
  const { t } = useTranslation();
  // Backend filter state: 'all' | 'voice' (ASR models) | 'llm' (GGUF models)
  const [backendFilter, setBackendFilter] = useState<'all' | 'voice' | 'llm'>('all');
  // Model lists with status
  const [asrModels, setAsrModels] = useState<AsrModelWithStatus[]>([]);
  const [llmModels, setLlmModels] = useState<LlmModelWithStatus[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track if auto-download has been triggered
  const autoDownloadTriggeredRef = useRef<string | null>(null);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      setIsLoading(true);
      setScanError(null);
      try {
        // Load both ASR and LLM models with status in parallel
        const [asrResult, llmResult] = await Promise.all([
          getAsrModelList(),
          getLlmModelList(),
        ]);
        setAsrModels(asrResult);
        setLlmModels(llmResult);
        log.info(`Loaded ${asrResult.length} ASR models (${asrResult.filter(m => m.downloaded).length} downloaded), ${llmResult.length} LLM models (${llmResult.filter(m => m.downloaded).length} downloaded)`);
      } catch (err) {
        log.error(`Failed to load models: ${err}`);
        setScanError(String(err));
      } finally {
        setIsLoading(false);
      }
    };
    loadModels();
  }, []);

  // Reload models when download completes
  useEffect(() => {
    let mounted = true;
    const unlisten = subscribeToDownloadComplete((event) => {
      if (!mounted) return;
      log.info(`Download complete for ${event.modelId}, reloading model list`);
      // Reload models to update downloaded status
      Promise.all([getAsrModelList(), getLlmModelList()])
        .then(([asrResult, llmResult]) => {
          if (!mounted) return;
          setAsrModels(asrResult);
          setLlmModels(llmResult);
        })
        .catch(err => log.error(`Failed to reload models: ${err}`));
    });
    return () => {
      mounted = false;
      unlisten.then(fn => fn());
    };
  }, []);

  // Build ASR model list with status
  const asrModelList: ModelWithStatus[] = asrModels.map(model => {
    // Find i18n description key for known presets
    const knownModel = DEFAULT_AVAILABLE_MODELS.find(m => m.id === model.preset.id);
    const descriptionKey = knownModel?.descriptionKey;

    // Determine if this is a user model (no download URLs)
    const isUserModel = !model.preset.downloadUrls || model.preset.downloadUrls.length === 0;

    const downloadState = downloadStates[model.preset.id];

    return {
      id: model.preset.id,
      name: model.preset.name,
      backend: model.preset.backend || 'Whisper',
      size: model.preset.size,
      downloaded: model.downloaded,
      downloadUrls: (model.preset.downloadUrls || []).map(url => ({
        name: url.name,
        url: url.url,
        isChinaAccessible: url.isChinaAccessible,
        priority: url.priority,
      })),
      languages: model.preset.languages || [],
      description: model.preset.description,
      descriptionKey,
      downloading: downloadState?.downloading ?? false,
      downloadProgress: downloadState?.progress,
      isUserModel,
      modelType: 'asr' as const,
      supportsStreaming: model.preset.supportsStreaming,
      accuracyScore: model.preset.accuracyScore,
      speedScore: model.preset.speedScore,
    };
  });

  // Build LLM model list with status
  const llmModelList: ModelWithStatus[] = llmModels.map(model => {
    const isUserModel = !model.preset.downloadUrls || model.preset.downloadUrls.length === 0;

    // Find i18n description key for known presets
    const knownModel = DEFAULT_AVAILABLE_MODELS.find(m => m.id === model.preset.id);
    const descriptionKey = knownModel?.descriptionKey;

    const downloadState = downloadStates[model.preset.id];

    return {
      id: model.preset.id,
      name: model.preset.name,
      backend: 'Whisper' as BackendType,  // Placeholder, not used for LLM display
      size: model.preset.size,
      downloaded: model.downloaded,
      downloadUrls: (model.preset.downloadUrls || []).map(url => ({
        name: url.name,
        url: url.url,
        isChinaAccessible: url.isChinaAccessible,
        priority: url.priority,
      })),
      languages: [],
      description: model.preset.description,
      descriptionKey,
      downloading: downloadState?.downloading ?? false,
      downloadProgress: downloadState?.progress,
      isUserModel,
      modelType: 'llm' as const,
    };
  });

  // Combined model list
  const modelList: ModelWithStatus[] = [...asrModelList, ...llmModelList];

  // Auto-download trigger (for preset models not yet downloaded - rare case)
  useEffect(() => {
    if (autoDownloadModelId && autoDownloadTriggeredRef.current !== autoDownloadModelId) {
      autoDownloadTriggeredRef.current = autoDownloadModelId;
      const model = modelList.find(m => m.id === autoDownloadModelId);
      if (model && !model.downloaded && !model.downloading && !model.isUserModel && onDownload) {
        setTimeout(() => {
          onDownload(model);
        }, 100);
      }
    }
  }, [autoDownloadModelId, modelList, onDownload]);

  const handleDownload = (model: ModelWithStatus) => {
    // User models cannot be downloaded (they're already on disk and have no download source)
    if (model.isUserModel || model.downloading || model.downloaded || !onDownload) return;
    onDownload(model);
  };

  const handleShowInFolder = async (modelId: string) => {
    try {
      await invoke('open_model_folder', { modelId });
    } catch (error) {
      log.error(`Failed to open folder: ${error}`);
    }
  };

  const handleCancelDownload = async (modelId: string) => {
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

  // Filter models: voice = ASR models, llm = LLM models (GGUF)
  const filteredModels = backendFilter === 'all'
    ? modelList
    : backendFilter === 'voice'
      ? modelList.filter(m => m.modelType === 'asr')
      : modelList.filter(m => m.modelType === 'llm');

  // Sort models: preset models first (with download URLs), then user models
  const sortedModels = [...filteredModels].sort((a, b) => {
    // Preset models come first
    if (!a.isUserModel && b.isUserModel) return -1;
    if (a.isUserModel && !b.isUserModel) return 1;
    // Within same group, sort by name
    return a.name.localeCompare(b.name);
  });

  if (isLoading) {
    return (
      <div className="model-list">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">{t('models.loading')}</div>
        </div>
      </div>
    );
  }

  if (scanError) {
    return (
      <div className="model-list">
        <div className="flex items-center justify-center py-8">
          <div className="text-red-500">{t('models.scanError')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="model-list">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-gray-900">{t('models.title')}</h2>
        {/* Backend filter */}
        <div className="flex items-center gap-2">
          <FilterButton
            active={backendFilter === 'all'}
            label={t('models.all')}
            onClick={() => setBackendFilter('all')}
          />
          <FilterButton
            active={backendFilter === 'voice'}
            label={t('models.voiceModel')}
            onClick={() => setBackendFilter('voice')}
          />
          <FilterButton
            active={backendFilter === 'llm'}
            label={t('models.llmModel')}
            onClick={() => setBackendFilter('llm')}
          />
        </div>
      </div>
      <div className="space-y-3">
        {sortedModels.map((model) => (
          <div
            key={model.id}
            className="relative flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-all duration-200 overflow-hidden"
          >
            {/* Full-card progress background */}
            {model.downloading && (
              <div className="absolute inset-0 overflow-hidden rounded-xl">
                {/* Progress fill - starts from left, expands right */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-100/60 to-blue-50/40 transition-all duration-300 ease-out"
                  style={{ width: `${model.downloadProgress?.percentage ?? 0}%` }}
                />
                {/* Subtle shimmer effect */}
                <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            )}

            {/* Content layer */}
            <div className="relative flex-1 z-10">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-medium text-gray-900">{model.name}</span>
                <span className="text-sm text-gray-500">({model.size})</span>
                {/* Backend type label - use LLM label for LLM models */}
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                  model.modelType === 'llm'
                    ? LLM_BACKEND_LABEL.color
                    : BACKEND_LABELS[model.backend].color
                }`}>
                  {model.modelType === 'llm'
                    ? LLM_BACKEND_LABEL.label
                    : BACKEND_LABELS[model.backend].label
                  }
                </span>
                {/* User model badge */}
                {model.isUserModel && <CustomBadge t={t} />}
                {/* Downloaded badge */}
                {!model.isUserModel && model.downloaded && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded-full border border-emerald-200">
                    <CheckIcon />
                    {t('models.ready')}
                  </span>
                )}
                {model.downloading && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-full border border-blue-100 animate-pulse">
                    {t('models.downloading')}
                  </span>
                )}
              </div>

              {/* Model description */}
              <div className="mt-1 text-sm text-gray-500">
                {model.descriptionKey ? t(model.descriptionKey) : model.description || ''}
              </div>

              {/* Accuracy, speed scores and streaming badge for ASR models */}
              {model.modelType === 'asr' && (model.accuracyScore || model.speedScore || model.supportsStreaming) && (
                <div className="mt-2 flex items-center gap-4">
                  {model.accuracyScore && (
                    <ScoreBar label={t('models.accuracy')} score={model.accuracyScore} color="blue" />
                  )}
                  {model.speedScore && (
                    <ScoreBar label={t('models.speed')} score={model.speedScore} color="green" />
                  )}
                  {model.supportsStreaming && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-cyan-50 text-cyan-700 rounded-full border border-cyan-200">
                      <AudioLines className="w-3 h-3" />
                      {t('models.streaming')}
                    </span>
                  )}
                </div>
              )}

              {/* Progress info */}
              {model.downloading && model.downloadProgress && (
                <div className="mt-2 flex items-center gap-4 text-sm">
                  <span className="font-medium text-blue-600">
                    {model.downloadProgress.percentage}%
                  </span>
                  <span className="text-gray-500">
                    {formatBytes(model.downloadProgress.downloaded)} / {formatBytes(model.downloadProgress.total)}
                  </span>
                  <span className="text-gray-400">
                    {formatSpeed(model.downloadProgress.speed)}
                  </span>
                  <button
                    onClick={() => handleCancelDownload(model.id)}
                    className="px-2 py-0.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                  >
                    {t('models.cancel')}
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="relative flex items-center gap-2 ml-4 z-10">
              {/* All scanned models are on disk, show "Open Location" button */}
              <button
                onClick={() => handleShowInFolder(model.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200 active:scale-95"
                title={t('models.showInFolder')}
              >
                <FolderIcon />
                {t('models.openLocation')}
              </button>
              {/* Only show download button for preset models (non-user models) that are not downloaded */}
              {!model.isUserModel && !model.downloaded && (
                <button
                  onClick={() => handleDownload(model)}
                  disabled={model.downloading}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {model.downloading ? t('models.downloading') : t('models.download')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {sortedModels.length === 0 && !isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">{t('models.noModels')}</div>
        </div>
      )}
    </div>
  );
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper function to format speed
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond} B/s`;
  }
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}