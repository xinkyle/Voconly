import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, Model, BackendType, LlmProfile } from '../types';
import { getFullModelId } from '../types';
import SceneForm from './SceneForm';
import LlmConfigModal from './LlmConfigModal';
import ShortcutErrorModal from './ShortcutErrorModal';
import { extractShortcutFromEvent } from '../utils/keyboard';
import { translateSceneName } from '../utils/i18n';
import { scanAsrModels, getAsrModelList, type ModelPreset, type AsrModelWithStatus, parseModelId } from '../services/config';
import { useToast } from './ui/Toast';
import { createLogger } from '../services/log';
import { loadModel, unloadModel } from '../services/whisper';
import type { DownloadProgress } from '../services/downloader';
import { AudioLines } from 'lucide-react';

// 创建日志记录器
const log = createLogger('SceneList');

// 推荐模型配置（根据语言场景推荐）
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

interface SceneListProps {
  scenes?: Scene[];
  models?: Model[];
  llmProfiles?: LlmProfile[];
  onEdit?: (scene: Scene) => void;
  onToggle?: (sceneId: string, enabled: boolean) => void;
  onAdd?: () => void;
  onSave?: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
  // Download related props
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
  onDownloadCancel?: (modelId: string) => void;
}

// Get model name by ID
// First searches in scannedModels (scanned models from directory), then falls back to models (predefined list)
function getModelName(modelId: string, models: Model[], scannedModels?: ModelPreset[]): string {
  // First, try to find in scannedModels (scanned models from disk)
  if (scannedModels) {
    const scannedModel = scannedModels.find(m => m.id === modelId);
    if (scannedModel) {
      return scannedModel.name;
    }
  }

  // Fallback to predefined models list
  const model = models.find(m => m.id === modelId);
  if (!model) {
    // Don't log error for custom models, just return the ID as name
    return modelId;
  }
  return model.name;
}

// Validate model ID format
function validateModelId(modelId: string): boolean {
  // Model IDs should be alphanumeric with hyphens, underscores, and dots
  // Prevent path traversal, special characters, etc.
  const validPattern = /^[a-zA-Z0-9_.-]+$/;
  return validPattern.test(modelId);
}

// Toggle Switch Component
function ToggleSwitch({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
        disabled
          ? 'bg-gray-300 cursor-not-allowed opacity-60'
          : checked ? 'bg-gray-900' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Model Select Modal - Enhanced with download and quant version selection
function ModelSelectModal({
  allModels,
  selectedId,
  onSelect,
  onCancel,
  onDownload,
  onDownloadCancel,
  downloadStates,
  t,
  currentLanguage,
}: {
  allModels: AsrModelWithStatus[];
  selectedId: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
  onDownload?: (model: Model) => void;
  onDownloadCancel?: (modelId: string) => void;
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  t: (key: string, options?: Record<string, unknown>) => string;
  currentLanguage: string;
}) {
  // State for expanded quant panel - only one at a time
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  // Toggle quant panel expansion
  const toggleExpand = (modelId: string) => {
    setExpandedModelId(prev => prev === modelId ? null : modelId);
  };

  // Get recommendation badge based on language
  const shouldShowRecommendation = (modelId: string): boolean => {
    const isZhLanguage = currentLanguage.startsWith('zh');
    if (isZhLanguage) {
      return ZH_RECOMMENDED_MODELS.has(modelId);
    } else {
      return EN_RECOMMENDED_MODELS.has(modelId);
    }
  };

  // Build model list: downloaded models first, then not downloaded
  const sortedModels = [...allModels].sort((a, b) => {
    // Downloaded models first
    if (a.downloaded && !b.downloaded) return -1;
    if (!a.downloaded && b.downloaded) return 1;
    return 0;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 w-[720px] h-[85vh] overflow-hidden shadow-2xl animate-fade-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h4 className="font-semibold text-gray-900 text-lg">{t('sceneList.selectModel')}</h4>
          <button
            onClick={onCancel}
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
            const isDownloading = downloadStates?.[model.preset.id]?.downloading ?? false;
            const downloadProgress = downloadStates?.[model.preset.id]?.progress;
            const isExpanded = expandedModelId === model.preset.id;
            const showRecommendation = shouldShowRecommendation(model.preset.id);
            const logoPath = getAsrModelLogo(model.preset.id);

            // Get quant variants and downloaded quants
            const quantVariants = model.quantVariants || [];
            const downloadedQuants = model.downloadedQuants || model.preset.downloadedQuants || [];
            const activeQuant = model.activeQuant || model.preset.activeQuant;
            const hasMultipleQuantVariants = quantVariants.length > 1;

            // Parse selected quant from selectedId (format: "modelId-quant")
            const isThisModelSelected = selectedId === model.preset.id || selectedId.startsWith(model.preset.id + '-');
            let selectedQuant: string | undefined;
            if (isThisModelSelected && selectedId.startsWith(model.preset.id + '-')) {
              selectedQuant = selectedId.slice(model.preset.id.length + 1);
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
                  selectedId === model.preset.id || selectedId.startsWith(model.preset.id + '-')
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
                          <span className="font-medium text-gray-900 text-sm">
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
                      {isDownloaded ? (
                        // Downloaded: show status
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100">
                          {(selectedId === model.preset.id || selectedId.startsWith(model.preset.id + '-')) ? (
                            <>
                              <CheckIcon className="w-4 h-4 text-emerald-600" />
                              <span className="text-gray-700">
                                {selectedQuant ? `${t('sceneList.selected')} ${selectedQuant}` : t('sceneList.selected')}
                              </span>
                            </>
                          ) : (
                            hasMultipleQuantVariants && (
                              <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                            )
                          )}
                        </div>
                      ) : isDownloading ? (
                        // Downloading: show progress
                        <div className="flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                          <span className="text-sm font-medium text-blue-600">{downloadProgress?.percentage || 0}%</span>
                          {onDownloadCancel && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDownloadCancel(model.preset.id);
                              }}
                              className="text-xs text-red-500 hover:text-red-600 underline"
                            >
                              {t('models.cancel')}
                            </button>
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
                        {quantVariants.map((variant) => {
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
                                <span className="font-medium text-gray-700">{variant.quant}</span>
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
                                        onDownload(modelForDownload);
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

export default function SceneList({
  scenes = [],
  models = [],
  llmProfiles = [],
  onEdit,
  onToggle,
  onAdd,
  onSave,
  checkConflict,
  tryRegisterShortcut,
  downloadStates,
  onDownload,
  onDownloadCancel,
}: SceneListProps) {
  const { t, i18n } = useTranslation();
  const [localScenes, setLocalScenes] = useState<Scene[]>(scenes);
  const [showForm, setShowForm] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [scannedModels, setScannedModels] = useState<ModelPreset[]>([]);
  const [allModels, setAllModels] = useState<AsrModelWithStatus[]>([]);
  const { showToast } = useToast();

  // For inline editing
  const [listeningShortcut, setListeningShortcut] = useState<string | null>(null); // scene id
  const [selectingModel, setSelectingModel] = useState<Scene | null>(null);
  const [llmConfigScene, setLlmConfigScene] = useState<Scene | null>(null);

  // For shortcut error modal
  const [shortcutError, setShortcutError] = useState<{
    shortcut: string;
    errorType: 'unsupported' | 'occupied' | 'unknown';
    errorMessage: string;
  } | null>(null);

  // Ref for the listening timeout
  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load scanned models and all models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        // Load scanned models (for backward compatibility)
        const scanned = await scanAsrModels();
        setScannedModels(scanned);
        log.info(`Scanned ${scanned.length} ASR models`);

        // Load full model list with status
        const fullList = await getAsrModelList();
        setAllModels(fullList);
        log.info(`Loaded ${fullList.length} models with status`);
      } catch (err) {
        log.error(`Failed to load models: ${err}`);
      }
    };
    loadModels();
  }, []);

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

  const handleAdd = () => {
    setEditingScene(null);
    setShowForm(true);
    if (onAdd) {
      onAdd();
    }
  };

  const handleEditName = (scene: Scene) => {
    setEditingScene(scene);
    setShowForm(true);
    if (onEdit) {
      onEdit(scene);
    }
  };

  const handleToggle = async (sceneId: string, currentEnabled: boolean) => {
    const scene = localScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const newEnabled = !currentEnabled;

    // 更新场景状态
    const updatedScene = { ...scene, enabled: newEnabled };
    const newScenes = localScenes.map((s) => (s.id === sceneId ? updatedScene : s));
    setLocalScenes(newScenes);

    if (onToggle) {
      onToggle(sceneId, newEnabled);
    } else if (onSave) {
      onSave(newScenes);
    }

    // 获取模型信息（使用完整模型 ID）
    const fullModelId = getFullModelId(scene.model);
    const model = models.find(m => m.id === scene.model.modelId);
    const modelName = model?.name || scene.model.modelId;
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
          // 检查是否是内存不足错误
          if (result.error?.startsWith('MEMORY_INSUFFICIENT|')) {
            const parts = result.error.split('|');
            const errorMsg = parts[1] || '内存不足';
            // 解析内存信息
            const memoryMatch = errorMsg.match(/需要约 (\d+MB).*可用 (\d+MB)/);
            const requiredMemory = memoryMatch?.[1] || '未知';
            const availableMemory = memoryMatch?.[2] || '未知';

            // 显示内存不足提示（dialog 在 App.tsx 中统一处理，这里显示 toast）
            showToast({
              type: 'warning',
              title: '内存空间不足',
              description: `${modelName} 需要约 ${requiredMemory}，但系统仅可用 ${availableMemory}。请在录音时根据提示选择是否强制加载。`,
            });

            // 回滚场景状态（保持禁用）
            const rollbackScenes = localScenes.map((s) =>
              s.id === sceneId ? { ...s, enabled: false } : s
            );
            setLocalScenes(rollbackScenes);
            if (onSave) {
              onSave(rollbackScenes);
            }
          } else {
            showToast({
              type: 'warning',
              title: '模型加载失败',
              description: result.error || '未知错误',
            });
          }
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
  };

  const handleSave = (scene: Scene) => {
    // Calculate new scenes first
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

    if (onSave) {
      onSave(newScenes);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingScene(null);
  };

  const handleDelete = (sceneId: string) => {
    if (!confirm(t('sceneList.confirmDelete'))) {
      return;
    }

    const newScenes = localScenes.filter((s) => s.id !== sceneId);
    setLocalScenes(newScenes);

    if (onSave) {
      onSave(newScenes);
    }
  };

  // Handle shortcut key capture
  const handleShortcutClick = useCallback((scene: Scene) => {
    // Cancel any existing listening
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }

    // Start listening for this scene
    setListeningShortcut(scene.id);

    // Auto-cancel after 5 seconds
    listeningTimeoutRef.current = setTimeout(() => {
      setListeningShortcut(null);
    }, 5000);
  }, []);

  // Keydown handler for shortcut capture
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    if (!listeningShortcut) return;

    e.preventDefault();
    e.stopPropagation();

    const newShortcut = extractShortcutFromEvent(e);
    if (!newShortcut) return;

    // Find the scene being edited
    const scene = localScenes.find(s => s.id === listeningShortcut);
    if (!scene) return;

    // Check conflict
    if (checkConflict) {
      const conflict = checkConflict(newShortcut, scene.id);
      if (conflict) {
        // Conflict detected, cancel listening
        setListeningShortcut(null);
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        alert(conflict);
        return;
      }
    }

    // Try register before saving
    if (tryRegisterShortcut) {
      const result = await tryRegisterShortcut(newShortcut, scene.id);
      if (!result.success) {
        // Show error modal
        setShortcutError({
          shortcut: newShortcut,
          errorType: (result.errorType as 'unsupported' | 'occupied' | 'unknown') || 'unknown',
          errorMessage: result.error || '',
        });
        setListeningShortcut(null);
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        return; // Don't save the new shortcut
      }
    }

    // Update the scene with new shortcut
    const updatedScene = { ...scene, shortcut: newShortcut };

    // Calculate new scenes first (before state update to ensure correct value)
    const newScenes = localScenes.map((s) => (s.id === updatedScene.id ? updatedScene : s));

    // Update local state
    setLocalScenes(newScenes);

    // Notify parent with the correct newScenes
    if (onSave) {
      onSave(newScenes);
    }

    // Clear listening state
    setListeningShortcut(null);
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }
  }, [listeningShortcut, localScenes, checkConflict, onSave, tryRegisterShortcut]);

  // Attach global keydown listener when in listening mode
  useEffect(() => {
    if (listeningShortcut) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [listeningShortcut, handleKeyDown]);

  // Handle model select
  const handleModelClick = (scene: Scene) => {
    setSelectingModel(scene);
  };

  const handleModelSelect = (modelId: string) => {
    if (!selectingModel) return;
    log.debug(`handleModelSelect: sceneId=${selectingModel.id}, newModelId=${modelId}`);

    // Validate model ID format
    if (!validateModelId(modelId)) {
      log.error(`Invalid model ID format: ${modelId}`);
      showToast({
        type: 'error',
        title: t('sceneList.invalidModelId'),
        description: t('sceneList.invalidModelIdDesc'),
      });
      return;
    }

    // 解析模型 ID（可能包含量化后缀）
    const { baseId, quant } = parseModelId(modelId);
    const updatedScene = {
      ...selectingModel,
      model: {
        modelId: baseId,
        quantization: quant,
      },
    };
    log.debug(`Updated scene: ${JSON.stringify(updatedScene)}`);

    // Calculate new scenes first
    const newScenes = localScenes.map((s) => (s.id === updatedScene.id ? updatedScene : s));
    log.debug(`New scenes: ${JSON.stringify(newScenes)}`);

    // Update local state
    setLocalScenes(newScenes);

    // Notify parent
    if (onSave) {
      log.debug('Calling onSave');
      onSave(newScenes);
    } else {
      log.debug('No onSave callback!');
    }

    setSelectingModel(null);
  };

  // Render scene list
  const renderSceneList = () => (
    <div className="scene-list">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-gray-900">{t('sceneList.title')}</h2>
        <button
          onClick={handleAdd}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 active:scale-95"
        >
          {t('sceneList.addScene')}
        </button>
      </div>

      {localScenes.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
          <div className="text-4xl mb-3">🎤</div>
          <p>{t('sceneList.noScenes')}</p>
          <p className="text-sm mt-1">{t('sceneList.noScenesHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {localScenes.map((scene) => {
            const isListening = listeningShortcut === scene.id;
            // 检查该场景是否启用了 LLM
            const sceneLlmProfile = llmProfiles.find(p => p.sceneId === scene.id);
            const llmEnabled = sceneLlmProfile?.enabled ?? false;

            return (
              <div
                key={scene.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                  scene.enabled
                    ? 'bg-white border-gray-100'
                    : 'bg-gray-50/50 border-gray-100'
                } ${isListening ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
              >
                {/* Scene Info */}
                <div className="flex-1 flex items-center gap-6">
                  {/* Scene Name - Click to edit */}
                  <button
                    onClick={() => handleEditName(scene)}
                    className={`font-medium text-left hover:underline transition-colors ${
                      scene.enabled ? 'text-gray-900' : 'text-gray-500'
                    }`}
                    title={t('sceneList.clickToEdit')}
                  >
                    {translateSceneName(scene.name, t)}
                  </button>

                  {/* Shortcut - Click to capture or show listening state */}
                  {scene.enabled ? (
                    <button
                      onClick={() => !isListening && handleShortcutClick(scene)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono transition-all duration-200 min-w-[80px] justify-center ${
                        isListening
                          ? 'bg-amber-100 text-amber-700 animate-pulse'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      title={isListening ? t('home.pressAnyKey') : t('sceneList.clickToChangeShortcut')}
                    >
                      {isListening ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                          </svg>
                          {t('sceneList.pressKey')}
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                          </svg>
                          {scene.shortcut}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono bg-gray-100/50 text-gray-400 min-w-[80px] justify-center cursor-not-allowed">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                      </svg>
                      {scene.shortcut}
                    </div>
                  )}

                  {/* Model - Click to select */}
                  {scene.enabled ? (
                    <button
                      onClick={() => handleModelClick(scene)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 bg-gray-100 text-gray-700 hover:bg-gray-200"
                      title={!scene.model?.modelId ? t('home.selectModelFirst') : t('sceneList.clickToSwitchModel')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {scene.model?.modelId ? getModelName(scene.model.modelId, models, scannedModels) : t('home.clickToSelect')}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-100/50 text-gray-400 cursor-not-allowed">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {scene.model?.modelId ? getModelName(scene.model.modelId, models, scannedModels) : t('home.noModelSelected')}
                    </div>
                  )}
                </div>

                {/* Right side: Delete and Toggles */}
                <div className="flex items-center gap-4">
                  {/* LLM Config Button */}
                  <button
                    onClick={() => setLlmConfigScene(scene)}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      llmEnabled
                        ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                        : 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100'
                    }`}
                    title={llmEnabled ? t('home.llmEnabled') : t('sceneList.llmConfig')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(scene.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                    title={t('sceneList.deleteScene')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  {/* Enable/Disable Toggle */}
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${scene.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                      {scene.enabled ? t('sceneList.on') : t('sceneList.off')}
                    </span>
                    <ToggleSwitch
                      checked={scene.enabled}
                      onChange={() => handleToggle(scene.id, scene.enabled)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      {renderSceneList()}

      {/* Add/Edit Scene Modal */}
      {showForm && (
        <SceneForm
          scene={editingScene}
          models={models}
          onSave={handleSave}
          onCancel={handleCancel}
          checkConflict={checkConflict}
        />
      )}

      {/* Model Select Modal */}
      {selectingModel && (
        <ModelSelectModal
          allModels={allModels}
          selectedId={getFullModelId(selectingModel.model)}
          onSelect={handleModelSelect}
          onCancel={() => setSelectingModel(null)}
          onDownload={onDownload}
          onDownloadCancel={onDownloadCancel}
          downloadStates={downloadStates}
          t={t}
          currentLanguage={i18n.language}
        />
      )}

      {/* LLM Config Modal */}
      {llmConfigScene && (
        <LlmConfigModal
          isOpen={!!llmConfigScene}
          scene={llmConfigScene}
          onClose={() => setLlmConfigScene(null)}
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
    </>
  );
}
