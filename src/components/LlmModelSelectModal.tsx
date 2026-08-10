import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LlmModelWithStatus } from '../services/llm';
import { getLlmModelList } from '../services/llm';
import type { DownloadProgress } from '../services/downloader';
import { subscribeToDownloadComplete, cancelModelDownload } from '../services/downloader';
import type { Model } from '../types';
import { createLogger } from '../services/log';

const log = createLogger('LlmModelSelectModal');

// Get model size (formatted: GB for >= 1GB, MB for < 1GB)
function getModelSize(model: LlmModelWithStatus): string {
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

// Default LLM models with descriptions
const DEFAULT_LLM_MODELS: { id: string; descriptionKey: string }[] = [
  { id: 'Qwen3-4B-Instruct-2507-Q4_K_M', descriptionKey: 'models.descriptions.qwen3b' },
  { id: 'Qwen3.5-9B-Q4_K_M', descriptionKey: 'models.descriptions.qwen7b' },
];

interface LlmModelSelectModalProps {
  selectedId: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
}

export default function LlmModelSelectModal({
  selectedId,
  onSelect,
  onCancel,
  downloadStates = {},
  onDownload,
}: LlmModelSelectModalProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<LlmModelWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      setLoading(true);
      try {
        const result = await getLlmModelList();
        setModels(result);
        log.info(`Loaded ${result.length} LLM models`);
      } catch (err) {
        log.error(`Failed to load LLM models: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    loadModels();
  }, []);

  // Subscribe to download complete to refresh list
  useEffect(() => {
    let mounted = true;
    const unlistenPromise = subscribeToDownloadComplete(async (event) => {
      if (!mounted) return;

      // Check if this is an LLM model download
      const isLlmDownload = event.modelId && !event.modelId.startsWith('whisper') &&
                            !event.modelId.startsWith('sensevoice') &&
                            !event.modelId.startsWith('moonshine') &&
                            !event.modelId.startsWith('parakeet');

      if (isLlmDownload) {
        // Refresh model list
        try {
          const result = await getLlmModelList();
          if (mounted) {
            setModels(result);
          }
        } catch (err) {
          log.error(`Failed to refresh LLM models: ${err}`);
        }
      }
    });

    return () => {
      mounted = false;
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Handle download
  const handleDownload = async (modelId: string) => {
    log.info(`Downloading LLM model: ${modelId}`);

    // Find the model in the list
    const model = models.find(m => m.preset.id === modelId);
    if (!model) {
      log.error(`Model not found: ${modelId}`);
      return;
    }

    // Call parent's onDownload callback with Model object
    if (onDownload) {
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

  // Handle cancel download
  const handleCancelDownload = async (modelId: string) => {
    log.info(`Canceling download for LLM model: ${modelId}`);
    try {
      const success = await cancelModelDownload(modelId);
      if (success) {
        log.info(`Download cancelled for ${modelId}`);
      }
    } catch (err) {
      log.error(`Failed to cancel download: ${err}`);
    }
  };

  // Check if downloading
  const isDownloading = (modelId: string) => {
    return downloadStates[modelId]?.downloading ?? false;
  };

  // Get download progress
  const getDownloadProgress = (modelId: string) => {
    return downloadStates[modelId]?.progress;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-10 w-[680px] max-h-[80vh] overflow-hidden shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h4 className="font-semibold text-gray-900 text-lg">{t('llmConfig.selectModel')}</h4>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3 max-h-[28rem] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-gray-500">
              {t('common.loading')}
            </div>
          ) : models.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {t('modelConfig.noLlmModels')}
            </div>
          ) : (
            models.map((model) => {
              const downloaded = model.downloaded;
              const downloading = isDownloading(model.preset.id);
              const progress = getDownloadProgress(model.preset.id);
              const knownModel = DEFAULT_LLM_MODELS.find(m => m.id === model.preset.id);
              const description = knownModel ? t(knownModel.descriptionKey) : model.preset.description;
              const isSelected = selectedId === model.preset.id;

              return (
                <div
                  key={model.preset.id}
                  onClick={downloaded ? () => onSelect(model.preset.id) : undefined}
                  className={`group relative rounded-xl border transition-all duration-200 overflow-hidden ${
                    isSelected
                      ? 'border-gray-900 bg-gray-50'
                      : downloaded
                        ? 'border-gray-200 bg-gray-50 hover:border-gray-300 cursor-pointer'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* Progress background */}
                  {downloading && (
                    <div className="absolute inset-0 overflow-hidden rounded-xl">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-100/60 to-blue-50/40 transition-all duration-300 ease-out"
                        style={{ width: `${progress?.percentage ?? 0}%` }}
                      />
                      <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </div>
                  )}

                  {/* Downloaded badge */}
                  {downloaded && !isSelected && (
                    <div className="absolute top-2 right-2 z-10">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  <div className="relative px-4 py-3 z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 pr-6">
                        {/* Model Name */}
                        <div className={`flex items-center gap-2 ${isSelected ? 'text-gray-900' : 'text-gray-800'}`}>
                          <h3 className="font-semibold text-sm truncate">
                            {model.preset.name}
                            {getModelSize(model) && (
                              <span className="text-gray-400 font-normal ml-1">({getModelSize(model)})</span>
                            )}
                          </h3>
                          {/* Recommendation badge */}
                          {model.preset.recommended && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded bg-blue-600 text-white">
                              {t('models.recommended')}
                            </span>
                          )}
                        </div>
                        {/* Description */}
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{description}</p>
                      </div>

                      {/* Status/Action */}
                      <div className="relative flex-shrink-0 z-10">
                        {downloaded ? (
                          isSelected ? (
                            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null
                        ) : downloading ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-medium text-blue-600">{progress?.percentage || 0}%</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelDownload(model.preset.id);
                              }}
                              className="text-xs text-red-500 hover:text-red-600 underline"
                            >
                              {t('models.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(model.preset.id);
                            }}
                            className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Selected indicator bar */}
                  {isSelected && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-b-xl" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}