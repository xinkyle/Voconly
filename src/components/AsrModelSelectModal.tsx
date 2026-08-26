import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Model, BackendType } from '../types';
import type { AsrModelWithStatus, QuantVariant } from '../services/config';
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
        className={`h-full rounded-full ${color === 'blue' ? 'bg-[#047857]' : 'bg-emerald-500'}`}
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

/**
 * Get the default quantization for a model
 * Priority:
 * 1. User's preferred quantization (if downloaded)
 * 2. Recommended quantization (isRecommended: true)
 * 3. First downloaded quantization
 * 4. First quantization in the list
 */
function getDefaultQuant(
  model: AsrModelWithStatus,
  modelQuantPrefs?: Record<string, string>
): { quant: string; isDownloaded: boolean } | null {
  const quantVariants = model.quantVariants || [];
  const downloadedQuants = model.downloadedQuants || model.preset.downloadedQuants || [];

  if (quantVariants.length === 0) {
    // No quantization variants (e.g., ONNX models)
    return { quant: '', isDownloaded: model.downloaded };
  }

  // 1. Check for user's preferred quantization (if downloaded)
  const modelId = model.preset.id;
  const userPrefQuant = modelQuantPrefs?.[modelId];
  if (userPrefQuant) {
    const isDownloaded = downloadedQuants.includes(userPrefQuant);
    if (isDownloaded) {
      return { quant: userPrefQuant, isDownloaded: true };
    }
  }

  // 2. Check for recommended quantization
  const recommended = quantVariants.find(v => v.isRecommended);
  if (recommended) {
    const isDownloaded = downloadedQuants.includes(recommended.quant);
    return { quant: recommended.quant, isDownloaded };
  }

  // 3. Check for first downloaded quantization
  for (const downloadedQuant of downloadedQuants) {
    const variant = quantVariants.find(v => v.quant === downloadedQuant);
    if (variant) {
      return { quant: variant.quant, isDownloaded: true };
    }
  }

  // 4. Fall back to first quantization
  const first = quantVariants[0];
  return { quant: first.quant, isDownloaded: false };
}

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
  /** User's quantization preferences for each model */
  modelQuantPrefs?: Record<string, string>;
  /** Callback when user selects a quantization version */
  onQuantPrefChange?: (modelId: string, quant: string) => void | Promise<void>;
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
  modelQuantPrefs,
  onQuantPrefChange,
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

  // Check if a model is the currently selected one
  const isModelSelected = (model: AsrModelWithStatus): boolean => {
    const modelId = model.preset.id;
    return selectedModelId === modelId || selectedModelId.startsWith(modelId + '-');
  };

  // Get the selected quantization from selectedModelId
  const getSelectedQuant = (model: AsrModelWithStatus): string | undefined => {
    if (!isModelSelected(model)) return undefined;
    if (selectedModelId.startsWith(model.preset.id + '-')) {
      return selectedModelId.slice(model.preset.id.length + 1);
    }
    return undefined;
  };

  // Helper function to start downloading a model variant
  const startDownload = (model: AsrModelWithStatus, quant?: string) => {
    if (!onDownload) return;

    const quantVariants = model.quantVariants || [];
    const variant = quant ? quantVariants.find(v => v.quant === quant) : undefined;

    // Build model object for download
    const modelForDownload: Model = {
      id: quant ? `${model.preset.id}-${quant}` : model.preset.id,
      name: model.preset.name,
      backend: (model.preset.backend || 'Whisper') as BackendType,
      size: model.preset.size || '',
      downloaded: model.downloaded,
      downloadUrls: variant
        ? model.preset.downloadUrls.map(url => ({
            ...url,
            url: url.url.substring(0, url.url.lastIndexOf('/') + 1) + variant.filename,
          }))
        : model.preset.downloadUrls,
      languages: model.preset.languages || [],
      modelType: 'asr',
    };

    onDownload(modelForDownload);
  };

  // Handle card click (select model)
  const handleCardClick = async (model: AsrModelWithStatus) => {
    const isSelected = isModelSelected(model);

    // If already selected, just close the modal
    if (isSelected) {
      onClose();
      return;
    }

    // Get default quantization (respecting user preference)
    const defaultQuantInfo = getDefaultQuant(model, modelQuantPrefs);

    // Check if default quant is downloaded
    if (defaultQuantInfo?.isDownloaded) {
      // Save quantization preference before selecting
      if (defaultQuantInfo.quant && onQuantPrefChange) {
        await onQuantPrefChange(model.preset.id, defaultQuantInfo.quant);
      }
      // Select the model
      const selectId = defaultQuantInfo.quant
        ? `${model.preset.id}-${defaultQuantInfo.quant}`
        : model.preset.id;
      onSelect(selectId);
      onClose();
    } else {
      // Start downloading directly and save preference
      if (defaultQuantInfo?.quant && onQuantPrefChange) {
        await onQuantPrefChange(model.preset.id, defaultQuantInfo.quant);
      }
      startDownload(model, defaultQuantInfo?.quant || '');
    }
  };

  // Handle clicking the right side tag (expand/collapse)
  const handleTagClick = (e: React.MouseEvent, model: AsrModelWithStatus) => {
    e.stopPropagation();
    const quantVariants = model.quantVariants || [];
    if (quantVariants.length > 1) {
      toggleExpand(model.preset.id);
    }
  };

  // Handle selecting a quantization variant
  const handleQuantSelect = async (model: AsrModelWithStatus, quant: string, isDownloaded: boolean) => {
    console.log(`[DEBUG handleQuantSelect] model=${model.preset.id}, quant=${quant}, isDownloaded=${isDownloaded}`);
    if (isDownloaded) {
      // Save quantization preference before selecting
      if (onQuantPrefChange) {
        console.log(`[DEBUG handleQuantSelect] Calling onQuantPrefChange(${model.preset.id}, ${quant})`);
        await onQuantPrefChange(model.preset.id, quant);
        console.log(`[DEBUG handleQuantSelect] onQuantPrefChange completed`);
      }
      // Select and close
      const selectId = `${model.preset.id}-${quant}`;
      onSelect(selectId);
      onClose();
    } else {
      // Save quantization preference for future use
      if (onQuantPrefChange) {
        console.log(`[DEBUG handleQuantSelect] Calling onQuantPrefChange(${model.preset.id}, ${quant})`);
        await onQuantPrefChange(model.preset.id, quant);
        console.log(`[DEBUG handleQuantSelect] onQuantPrefChange completed`);
      }
      // Start downloading directly and collapse the panel
      startDownload(model, quant);
      setExpandedModelId(null);
    }
  };

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
            const quantVariants = model.quantVariants || [];
            const downloadedQuants = model.downloadedQuants || model.preset.downloadedQuants || [];
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

            // Check if this model is selected
            const isSelected = isModelSelected(model);
            const selectedQuant = getSelectedQuant(model);

            // Get default quantization (respecting user preference)
            const defaultQuantInfo = getDefaultQuant(model, modelQuantPrefs);
            console.log(`[DEBUG] Model: ${model.preset.id}, modelQuantPrefs:`, JSON.stringify(modelQuantPrefs), 'defaultQuantInfo:', JSON.stringify(defaultQuantInfo));
            const defaultQuantLabel = defaultQuantInfo?.quant && QUANT_LABELS[defaultQuantInfo.quant]
              ? t(`models.quantLabels.${QUANT_LABELS[defaultQuantInfo.quant]}`)
              : defaultQuantInfo?.quant || '';

            // Download status indicator: green dot = downloaded, gray dot = not downloaded
            const isDefaultQuantDownloaded = defaultQuantInfo?.isDownloaded ?? model.downloaded;

            return (
              <div
                key={model.preset.id}
                onClick={() => handleCardClick(model)}
                className={`relative rounded-xl border transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'border-gray-900 bg-gray-50'
                    : isDefaultQuantDownloaded
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
                            <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-emerald-600 text-white">
                              {t('models.recommended')}
                            </span>
                          )}
                        </div>
                        {/* Description */}
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                          {model.preset.description || ''}
                        </p>
                        {/* Accuracy, Speed Scores and Streaming Badges */}
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
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-[rgba(0,212,170,0.1)] text-[#00d4aa] rounded-full border border-[rgba(0,212,170,0.3)] flex-shrink-0">
                                <AudioLines className="w-3 h-3" />
                                {t('models.streaming')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side: Status indicator */}
                    <div className="flex-shrink-0" onClick={(e) => handleTagClick(e, model)}>
                      {isDownloading ? (
                        // Downloading: show progress and cancel button
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
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
                              className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                            >
                              {t('models.cancel')}
                            </button>
                          )}
                        </div>
                      ) : isSelected ? (
                        // Selected: show "已选中"
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100">
                          <CheckIcon className="w-4 h-4 text-emerald-600" />
                          <span className="text-gray-700">
                            {selectedQuant
                              ? `${t('sceneList.selected')} ${QUANT_LABELS[selectedQuant] ? t(`models.quantLabels.${QUANT_LABELS[selectedQuant]}`) : selectedQuant}`
                              : t('sceneList.selected')}
                          </span>
                          {hasMultipleQuantVariants && (
                            <span className="text-gray-400 ml-1">{isExpanded ? '▲' : '▼'}</span>
                          )}
                        </div>
                      ) : hasMultipleQuantVariants ? (
                        // Multiple quant variants: show default quant label + expand arrow
                        <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100">
                          {/* Download status dot */}
                          <span className={`w-2 h-2 rounded-full ${isDefaultQuantDownloaded ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          <span className="text-gray-700">{defaultQuantLabel}</span>
                          <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      ) : isDefaultQuantDownloaded ? (
                        // Single quant, downloaded: show default quant label
                        <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-gray-700">{defaultQuantLabel || t('models.downloaded')}</span>
                        </div>
                      ) : (
                        // Single quant, not downloaded: show download indicator
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100">
                          <DownloadIcon className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-600">{t('models.download')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quant version panel - Show for both downloaded and not downloaded models */}
                  {isExpanded && hasMultipleQuantVariants && (
                    <div className="mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                      <div className="text-xs text-gray-500 mb-2">{t('models.quantVersions')}:</div>
                      <div className="space-y-1.5">
                        {quantVariants.map((variant: QuantVariant) => {
                          const isDownloadedVariant = downloadedQuants.includes(variant.quant);
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
                              onClick={isDownloadedVariant && !isSelectedVariant ? () => {
                                handleQuantSelect(model, variant.quant, true);
                              } : !isDownloadedVariant ? () => {
                                handleQuantSelect(model, variant.quant, false);
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
                                      handleQuantSelect(model, variant.quant, false);
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