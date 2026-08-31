import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type {
  AsrModelWithStatus,
  LlmModelWithStatus,
  LlmModelPreset,
} from '../services/config';
import type { Model, LlmProviderInstance, GlobalModelConfig } from '../types';
import {
  getAsrModelList,
  getLlmModelList,
  getCustomAsrModelDirs,
  addCustomAsrModelDir,
  removeCustomAsrModelDir,
  loadConfig,
  saveConfig,
  parseModelId,
} from '../services/config';
import { getProviderList, saveProviderConfig, detectGpu } from '../services/llm';
import { createLogger } from '../services/log';
import type { DownloadProgress, DownloadCompleteEvent } from '../services/downloader';
import { subscribeToDownloadComplete, cancelModelDownload } from '../services/downloader';
import { useToast } from './ui/Toast';
import { Info } from 'lucide-react';
import AsrModelList from './AsrModelList';
import { getFullModelId } from '../types';

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
  modelQuantPrefs?: Record<string, string>;
  onQuantPrefChange?: (modelId: string, quant: string) => void | Promise<void>;
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

// LLM Model Card Component
interface LlmModelCardProps {
  model: LlmModelWithStatus;
  isSelected: boolean; // 当前是否正在使用
  isDownloading: boolean;
  downloadProgress?: DownloadProgress;
  onDownload: () => void;
  onDownloadCancel?: () => void;
  t: (key: string) => string;
}

function LlmModelCard({ model, isSelected, isDownloading, downloadProgress, onDownload, onDownloadCancel, t }: LlmModelCardProps) {
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

          {/* Status/Action - 右侧标签样式，与 ASR 模型列表一致 */}
          <div className="relative flex-shrink-0 z-10 flex items-center gap-2">
            {isDownloaded ? (
              isSelected ? (
                // 已选中（当前使用）：显示勾勾 + "当前使用"
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('models.currentUse')}</span>
                </div>
              ) : (
                // 已下载未选中：显示"已下载"
                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{t('models.downloaded')}</span>
                </div>
              )
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
              // 未下载：显示下载按钮
              <button
                onClick={onDownload}
                className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium text-gray-600 transition-colors"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                <span>{t('models.download')}</span>
              </button>
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
  modelQuantPrefs,
  onQuantPrefChange,
}: ModelConfigPanelProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const currentLanguage = i18n.language;

  // State
  const [asrModels, setAsrModels] = useState<AsrModelWithStatus[]>([]);
  const [llmModels, setLlmModels] = useState<LlmModelWithStatus[]>([]);
  const [customDirs, setCustomDirs] = useState<string[]>([]);
  const [globalModelConfig, setGlobalModelConfig] = useState<GlobalModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCustomDirModal, setShowCustomDirModal] = useState(false);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [asrResult, llmResult, customDirsResult, configResult] = await Promise.all([
          getAsrModelList(),
          getLlmModelList(),
          getCustomAsrModelDirs(),
          loadConfig(),
        ]);
        setAsrModels(asrResult);
        setLlmModels(llmResult);
        setCustomDirs(customDirsResult);
        setGlobalModelConfig(configResult.globalModelConfig || null);
        log.info(
          `Loaded ${asrResult.length} ASR models, ${llmResult.length} LLM models, ${customDirsResult.length} custom dirs`
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
  // Handle ASR model selection
  const handleAsrModelSelect = useCallback(async (modelId: string) => {
    if (!modelId) {
      return;
    }

    const { baseId, quant } = parseModelId(modelId);
    const newConfig: GlobalModelConfig = {
      asrModel: {
        modelId: baseId,
        quantization: quant,
      },
      llm: globalModelConfig?.llm || {
        providerId: '',
        model: '',
        maxTokens: 1024,
        temperature: 0.3,
      },
    };

    // Save config
    try {
      const config = await loadConfig();
      await saveConfig({
        ...config,
        globalModelConfig: newConfig,
      });

      setGlobalModelConfig(newConfig);
      onConfigUpdate?.();

      showToast({
        type: 'success',
        title: t('common.saved'),
        description: t('home.asrModelUpdated'),
      });
    } catch (err) {
      log.error(`Failed to save ASR model: ${err}`);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(err),
      });
    }
  }, [globalModelConfig, onConfigUpdate, showToast, t]);

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
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('modelConfig.title')}</h1>
        <p className="text-sm text-gray-600">{t('modelConfig.subtitle')}</p>
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
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-700 text-white rounded-full">
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
                                onClick={() => openUrl('https://huggingface.co/voconly-org')}
                                className="text-blue-600 hover:text-blue-700 hover:underline block"
                              >
                                HuggingFace
                              </button>
                            </div>
                            <div className="border-t border-gray-200 pt-2 mt-2">
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

        <div className="p-5">
          {/* Warning for no ASR */}
          {!hasDownloadedAsr && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-800">{t('modelConfig.asrRequired')}</p>
            </div>
          )}

          <AsrModelList
            models={asrModels}
            selectedModelId={globalModelConfig?.asrModel ? getFullModelId(globalModelConfig.asrModel) : ''}
            onSelect={handleAsrModelSelect}
            downloadStates={downloadStates}
            onDownload={onDownload}
            onDownloadCancel={onDownloadCancel}
            currentLanguage={currentLanguage}
            layout="grid"
            modelQuantPrefs={modelQuantPrefs}
            onQuantPrefChange={onQuantPrefChange}
          />
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
                isSelected={globalModelConfig?.llm?.model === model.preset.id}
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

      {/* Custom Directory Management Modal */}
      {showCustomDirModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden min-h-[320px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{t('modelConfig.customDirModalTitle')}</h3>
              <button
                onClick={() => setShowCustomDirModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-4 py-3 flex-1">
              <p className="text-sm text-gray-500 mb-3">{t('modelConfig.customDirModalDesc')}</p>

              {/* Add button */}
              <button
                onClick={handleImportCustomDir}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 text-sm text-gray-600 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>{t('modelConfig.addCustomDir')}</span>
              </button>

              {/* Directory list */}
              <div className="mt-3">
                {customDirs.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <svg className="w-10 h-10 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <p className="text-sm">{t('modelConfig.noCustomDirs')}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {customDirs.map((dirPath) => (
                      <div
                        key={dirPath}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors"
                      >
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="flex-1 text-sm text-gray-700 truncate" title={dirPath}>{dirPath}</span>
                        <button
                          onClick={() => handleRemoveCustomDir(dirPath)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title={t('modelConfig.removeCustomDir')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-100 flex justify-center">
              <button
                onClick={() => setShowCustomDirModal(false)}
                className="px-8 py-2 bg-gray-900 text-white text-sm rounded-lg font-medium hover:bg-gray-800 transition-colors"
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
