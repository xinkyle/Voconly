import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Model, BackendType } from '../types';
import type { AsrModelWithStatus, QuantVariant, getQuantLabel } from '../services/config';
import type { DownloadProgress } from '../services/downloader';
import { AudioLines } from 'lucide-react';
import { QUANT_LABELS } from '../services/config';

// Recommended models for different languages
const ZH_RECOMMENDED_MODELS: Set<string> = new Set([
  'Qwen3-ASR-1.7B',
  'qwen3-asr-1.7b',
  'sensevoice-small',
  'SenseVoice-Small',
]);

const EN_RECOMMENDED_MODELS: Set<string> = new Set([
  'parakeet-unified-en-0.6b',
  'Parakeet-Unified-EN-0.6B',
  'cohere-transcribe-03-2026',
  'Cohere-Transcribe-03-2026',
]);

/**
 * Sort models by: 1) downloaded first, 2) recommended first, 3) name alphabetically
 * This ensures stable ordering across sessions.
 */
export function sortAsrModels(
  models: AsrModelWithStatus[],
  currentLanguage: string
): AsrModelWithStatus[] {
  const isZhLanguage = currentLanguage.startsWith('zh');
  const recommendedModels = isZhLanguage ? ZH_RECOMMENDED_MODELS : EN_RECOMMENDED_MODELS;

  return [...models].sort((a, b) => {
    // 1. Downloaded models first
    if (a.downloaded && !b.downloaded) return -1;
    if (!a.downloaded && b.downloaded) return 1;

    // 2. Recommended models first (within same download status)
    const aRecommended = recommendedModels.has(a.preset.id);
    const bRecommended = recommendedModels.has(b.preset.id);
    if (aRecommended && !bRecommended) return -1;
    if (!aRecommended && bRecommended) return 1;

    // 3. Sort by name alphabetically (stable)
    return a.preset.name.localeCompare(b.preset.name, undefined, { sensitivity: 'base' });
  });
}

// ASR model logo mapping
const ASR_MODEL_LOGO_MAP: Record<string, string> = {
  'whisper': 'openai.png',
  'ggml-': 'openai.png',
  'qwen': 'qwen.png',
  'nemotron': 'nvidia.svg',
  'parakeet': 'nvidia.svg',
  'sensevoice': 'qwen.png',
  'moonshine': 'custom.png',
  'cohere': 'cohere-logo.svg',
};

// Get ASR model logo path based on model id
const getAsrModelLogo = (modelId: string): string => {
  const lowerModelId = modelId.toLowerCase();
  for (const [prefix, logoFile] of Object.entries(ASR_MODEL_LOGO_MAP)) {
    if (lowerModelId.startsWith(prefix.toLowerCase())) {
      return `/icons/${logoFile}`;
    }
  }
  return '/icons/custom.png';
};

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

// Get model size (formatted: GB for >= 1GB, MB for < 1GB)
function getModelSize(model: AsrModelWithStatus): string {
  if (model.sizeMb) {
    const mb = model.sizeMb;
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)}GB`;
    }
    return `${mb}MB`;
  }
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
  <div className="flex items-center gap-1.5">
    <span className="text-[11px] text-gray-500 w-10 flex-shrink-0">{label}</span>
    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[60px]">
      <div
        className={`h-full rounded-full ${color === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'}`}
        style={{ width: `${(score || 0) * 100}%` }}
      />
    </div>
  </div>
);

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

export interface AsrModelSelectModalProps {
  /** ASR model list with status */
  models: AsrModelWithStatus[];
  /** Currently selected model ID (may include quantization suffix) */
  selectedModelId: string;
  /** Callback when a model is selected */
  onSelect: (modelId: string) => void;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Download states for models */
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  /** Callback to start downloading a model */
  onDownload?: (model: Model) => void;
  /** Callback to cancel a model download */
  onDownloadCancel?: (modelId: string) => void;
  /** Current language for recommendation (defaults to i18n.language) */
  currentLanguage?: string;
}

/**
 * ASR Model Selection Modal
 *
 * A modal component for selecting ASR models with support for:
 * - Model download status display
 * - Quantization version selection
 * - Progress indicators for downloads
 * - Language-based model recommendations
 */
function AsrModelSelectModal({
  models,
  selectedModelId,
  onSelect,
  onClose,
  downloadStates,
  onDownload,
  onDownloadCancel,
  currentLanguage,
}: AsrModelSelectModalProps) {
  const { t, i18n } = useTranslation();

  // Use provided language or fall back to i18n language
  const activeLanguage = currentLanguage || i18n.language;

  // State for expanded quant panel - only one at a time
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  // Toggle quant panel expansion
  const toggleExpand = (modelId: string) => {
    setExpandedModelId(prev => prev === modelId ? null : modelId);
  };

  // Get recommendation badge based on language
  const shouldShowRecommendation = (modelId: string): boolean => {
    const isZhLanguage = activeLanguage.startsWith('zh');
    if (isZhLanguage) {
      return ZH_RECOMMENDED_MODELS.has(modelId);
    } else {
      return EN_RECOMMENDED_MODELS.has(modelId);
    }
  };

  // Sort models: downloaded first, recommended first, then alphabetically
  const sortedModels = sortAsrModels(models, activeLanguage);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-[720px] h-[85vh] overflow-hidden shadow-2xl animate-fade-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h4 className="font-semibold text-gray-900 text-lg">{t('sceneList.selectModel')}</h4>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-2 flex-1 overflow-y-auto pr-1">
          {sortedModels.map((model) => {
            const isDownloaded = model.downloaded;
            const quantVariants = model.quantVariants || [];
            const downloadedQuants = model.downloadedQuants || model.preset.downloadedQuants || [];
            const activeQuant = model.activeQuant || model.preset.activeQuant;
            const hasMultipleQuantVariants = quantVariants.length > 1;

            // Check if any quantization version is downloading
            const isDownloading = quantVariants.some(
              v => downloadStates?.[`${model.preset.id}-${v.quant}`]?.downloading
            ) || (downloadStates?.[model.preset.id]?.downloading ?? false);

            // Get current download progress (if any)
            const downloadProgress = quantVariants
              .map(v => downloadStates?.[`${model.preset.id}-${v.quant}`]?.progress)
              .find(p => p !== undefined) || downloadStates?.[model.preset.id]?.progress;

            const isExpanded = expandedModelId === model.preset.id;
            const showRecommendation = shouldShowRecommendation(model.preset.id);
            const logoPath = getAsrModelLogo(model.preset.id);

            // Parse selected quant from selectedModelId (format: "modelId-quant")
            const isThisModelSelected = selectedModelId === model.preset.id || selectedModelId.startsWith(model.preset.id + '-');
            let selectedQuant: string | undefined;
            if (isThisModelSelected && selectedModelId.startsWith(model.preset.id + '-')) {
              selectedQuant = selectedModelId.slice(model.preset.id.length + 1);
            }

            // Build download URL for the model
            const downloadUrls = model.preset.downloadUrls || [];
            const modelForDownload: Model = {
              id: model.preset.id,
              name: model.preset.name,
              backend: (model.preset.backend || 'Whisper') as BackendType,
              size: model.preset.size || '',
              downloaded: isDownloaded,
              downloadUrls: downloadUrls,
              languages: model.preset.languages || [],
              modelType: 'asr',
            };

            // Handle click on the entire card
            const handleCardClick = () => {
              if (hasMultipleQuantVariants) {
                toggleExpand(model.preset.id);
              } else if (isDownloaded) {
                // Single version: directly select
                const selectId = activeQuant
                  ? `${model.preset.id}-${activeQuant}`
                  : model.preset.id;
                onSelect(selectId);
              } else if (!isDownloading && onDownload) {
                // Not downloaded: download
                onDownload(modelForDownload);
              }
            };

            return (
              <div
                key={model.preset.id}
                onClick={handleCardClick}
                className={`relative rounded-xl border transition-all duration-200 cursor-pointer ${
                  selectedModelId === model.preset.id || selectedModelId.startsWith(model.preset.id + '-')
                    ? 'border-gray-900 bg-gray-50'
                    : isDownloaded
                      ? 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      : 'border-gray-200 bg-white hover:border-gray-200'
                }`}
              >
                {/* Progress background */}
                {isDownloading && (
                  <div className="absolute inset-0 overflow-hidden rounded-xl">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-100/60 to-blue-50/40 transition-all duration-300 ease-out"
                      style={{ width: `${downloadProgress?.percentage ?? 0}%` }}
                    />
                    <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                  </div>
                )}

                <div className="relative px-4 py-3 z-10">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left side: Model info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Logo */}
                      {logoPath && (
                        <img
                          src={logoPath}
                          alt={model.preset.name}
                          className="w-6 h-6 object-contain flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        {/* Name and badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">
                            {model.preset.name}
                          </span>
                          {getModelSize(model) && (
                            <span className="text-xs text-gray-400">({getModelSize(model)})</span>
                          )}
                          {/* Recommendation badge */}
                          {showRecommendation && (
                            <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-blue-600 text-white">
                              {t('models.recommended')}
                            </span>
                          )}
                        </div>
                        {/* Description */}
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                          {model.preset.description || ''}
                        </p>
                        {/* Accuracy, Speed Scores and Streaming Badge */}
                        {(model.preset.accuracyScore !== undefined || model.preset.speedScore !== undefined || model.preset.supportsStreaming) && (
                          <div className="flex items-center gap-3 mt-2">
                            {model.preset.accuracyScore !== undefined && (
                              <div className="flex-shrink-0">
                                <ScoreBar label={t('models.accuracy')} score={model.preset.accuracyScore} color="blue" />
                              </div>
                            )}
                            {model.preset.speedScore !== undefined && (
                              <div className="flex-shrink-0">
                                <ScoreBar label={t('models.speed')} score={model.preset.speedScore} color="green" />
                              </div>
                            )}
                            {model.preset.supportsStreaming && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-cyan-50 text-cyan-700 rounded-full border border-cyan-200 flex-shrink-0">
                                <AudioLines className="w-3 h-3" />
                                {t('models.streaming')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side: Status indicator */}
                    <div className="flex-shrink-0">
                      {isDownloading ? (
                        // Downloading: show progress
                        <div className="flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                          <span className="text-sm font-medium text-blue-600">{downloadProgress?.percentage || 0}%</span>
                          {onDownloadCancel && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Cancel all possible downloads (including quantization versions)
                                quantVariants.forEach((v: QuantVariant) => {
                                  onDownloadCancel(`${model.preset.id}-${v.quant}`);
                                });
                                onDownloadCancel(model.preset.id);
                              }}
                              className="text-xs text-red-500 hover:text-red-600 underline"
                            >
                              {t('models.cancel')}
                            </button>
                          )}
                        </div>
                      ) : isDownloaded ? (
                        // Downloaded: show status
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100">
                          {(selectedModelId === model.preset.id || selectedModelId.startsWith(model.preset.id + '-')) ? (
                            <>
                              <CheckIcon className="w-4 h-4 text-emerald-600" />
                              <span className="text-gray-700">
                                {selectedQuant
                                  ? `${t('sceneList.selected')} ${QUANT_LABELS[selectedQuant] ? t(`models.quantLabels.${QUANT_LABELS[selectedQuant]}`) : selectedQuant}`
                                  : t('sceneList.selected')}
                              </span>
                              {hasMultipleQuantVariants && (
                                <span className="text-gray-400 ml-1">{isExpanded ? '▲' : '▼'}</span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-gray-500">{t('models.downloaded')}</span>
                              {hasMultipleQuantVariants && (
                                <span className="text-gray-400 ml-1">{isExpanded ? '▲' : '▼'}</span>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        // Not downloaded: show download indicator
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100">
                          <DownloadIcon className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-600">{t('models.download')}</span>
                          {hasMultipleQuantVariants && (
                            <span className="text-gray-400 ml-1">{isExpanded ? '▲' : '▼'}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quant version panel - Show for both downloaded and not downloaded models */}
                  {isExpanded && hasMultipleQuantVariants && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-500 mb-2">{t('models.quantVersions')}:</div>
                      <div className="space-y-1.5">
                        {quantVariants.map((variant: QuantVariant) => {
                          const isDownloadedVariant = downloadedQuants.includes(variant.quant);
                          // Use selectedQuant for UI display (user's selection)
                          const isSelectedVariant = selectedQuant === variant.quant;

                          return (
                            <div
                              key={variant.quant}
                              className={`relative flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                                isDownloadedVariant
                                  ? isSelectedVariant
                                    ? 'bg-blue-50 border border-blue-200'
                                    : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
                                  : 'hover:bg-gray-50'
                              }`}
                              onClick={isDownloadedVariant && !isSelectedVariant ? (e) => {
                                e.stopPropagation();
                                const selectId = `${model.preset.id}-${variant.quant}`;
                                onSelect(selectId);
                              } : undefined}
                            >
                              <div className="relative flex items-center gap-2 z-10">
                                {/* Radio button style */}
                                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                  isSelectedVariant
                                    ? 'border-blue-500 bg-blue-500'
                                    : isDownloadedVariant
                                      ? 'border-gray-300'
                                      : 'border-gray-200'
                                }`}>
                                  {isSelectedVariant && (
                                    <span className="w-2 h-2 rounded-full bg-white" />
                                  )}
                                </span>
                                {/* Display precision label instead of quant name */}
                                <span className="font-medium text-gray-700">
                                  {QUANT_LABELS[variant.quant]
                                    ? t(`models.quantLabels.${QUANT_LABELS[variant.quant]}`)
                                    : variant.quant}
                                </span>
                                {variant.isRecommended && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-50 text-green-600 rounded">
                                    {t('models.recommended')}
                                  </span>
                                )}
                              </div>
                              <div className="relative flex items-center gap-3 z-10">
                                <span className="text-gray-400">{formatBytes(variant.sizeBytes)}</span>
                                {isDownloadedVariant ? (
                                  isSelectedVariant ? (
                                    <span className="text-blue-600 font-medium text-xs">{t('models.currentUse')}</span>
                                  ) : (
                                    <span className="text-xs text-gray-400">{t('models.downloaded')}</span>
                                  )
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onDownload) {
                                        // Build model object with quantization version info
                                        const modelWithQuant: Model = {
                                          id: `${model.preset.id}-${variant.quant}`,
                                          name: `${model.preset.name} (${variant.quant})`,
                                          backend: (model.preset.backend || 'Whisper') as BackendType,
                                          size: model.preset.size || '',
                                          downloaded: isDownloaded,
                                          downloadUrls: model.preset.downloadUrls.map(url => ({
                                            ...url,
                                            url: url.url.substring(0, url.url.lastIndexOf('/') + 1) + variant.filename,
                                          })),
                                          languages: model.preset.languages || [],
                                          modelType: 'asr',
                                        };
                                        onDownload(modelWithQuant);
                                      }
                                    }}
                                    className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  >
                                    {t('models.download')}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Downloaded versions statistics */}
                      {downloadedQuants.length > 0 && (
                        <div className="mt-2 text-xs text-gray-400">
                          {t('models.downloadedCount')}: {downloadedQuants.length}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AsrModelSelectModal;