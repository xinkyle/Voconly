import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, GlobalModelConfig, ProviderWithConfig } from '../types';
import { getFullModelId } from '../types';
import type { DownloadProgress } from '../services/downloader';
import { extractShortcutFromEvent, formatShortcut } from '../utils/keyboard';
import { getSceneNameFromPromptType } from '../utils/i18n';
import { getAsrModelList, type AsrModelWithStatus, parseModelId, QUANT_LABELS, loadConfig, saveConfig } from '../services/config';
import { switchAsrModel } from '../services/whisper';
import { subscribeToDownloadComplete } from '../services/downloader';
import { getFullStats, type FullStats } from '../services/history';
import { getProviderList, getLlmPromptPresets } from '../services/llm';
import AsrModelSelectModal from './AsrModelSelectModal';
import ShortcutErrorModal from './ShortcutErrorModal';
import { useToast } from './ui/Toast';
import { createLogger } from '../services/log';

const log = createLogger('HomePanelV2');

// ASR 图标
const AsrIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

// LLM 图标
const LlmIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

// 统计图标
const ClockIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TextIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const MicIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const CalendarIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// 获取量化版本的显示名称
function getQuantDisplayName(quant: string, t?: (key: string) => string): string {
  const label = QUANT_LABELS[quant];
  if (label) {
    return t ? t(`models.quantLabels.${label}`) : quant;
  }
  return quant;
}

// 获取模型名称
function getModelName(modelId: string, asrModels?: AsrModelWithStatus[]): string {
  const { baseId } = parseModelId(modelId);

  if (asrModels) {
    const asrModel = asrModels.find(m => m.preset.id.toLowerCase() === baseId.toLowerCase());
    if (asrModel) {
      return asrModel.preset.name;
    }
  }

  return modelId;
}

// 获取模型精度
function getModelQuant(modelId: string, asrModels?: AsrModelWithStatus[], t?: (key: string) => string): string | null {
  const { baseId, quant } = parseModelId(modelId);

  if (asrModels) {
    const asrModel = asrModels.find(m => m.preset.id.toLowerCase() === baseId.toLowerCase());
    if (asrModel) {
      const displayQuant = quant || asrModel.preset.quant;
      if (displayQuant) {
        return getQuantDisplayName(displayQuant, t);
      }
    }
  }

  if (quant) {
    return getQuantDisplayName(quant, t);
  }

  return null;
}

// 获取模型大小
function getModelSize(modelId: string, asrModels?: AsrModelWithStatus[]): string {
  const { baseId, quant } = parseModelId(modelId);

  if (asrModels) {
    const asrModel = asrModels.find(m => m.preset.id.toLowerCase() === baseId.toLowerCase());
    if (asrModel) {
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

      if (asrModel.sizeMb) {
        const mb = asrModel.sizeMb;
        if (mb >= 1024) {
          return `${(mb / 1024).toFixed(1)}GB`;
        }
        return `${mb}MB`;
      }
      if (asrModel.preset.size) {
        return asrModel.preset.size;
      }
    }
  }

  return '';
}

// 获取提示词类型显示名称
const getPromptTypeLabel = (type: string, t: (key: string) => string): string => {
  const labels: Record<string, string> = {
    lightPolish: t('llmConfig.promptTypes.lightPolish'),
    translate: t('llmConfig.promptTypes.translate'),
    professionalPolish: t('llmConfig.promptTypes.professionalPolish'),
    meetingSecretary: t('llmConfig.promptTypes.meetingSecretary'),
  };
  return labels[type] || type;
};

// 格式化时长
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface HomePanelV2Props {
  scenes?: Scene[];
  globalModelConfig?: GlobalModelConfig;
  modelQuantPrefs?: Record<string, string>;
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: any) => void;
  onDownloadCancel?: (modelId: string) => void;
  onGlobalModelConfigChange?: (config: GlobalModelConfig) => void;
  onNavigateToSettings?: () => void;
  onNavigateToLlmSettings?: () => void;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
  triggerSelectModelSceneId?: string | null;
  onTriggerSelectModelCleared?: () => void;
  onScenesSave?: (scenes: Scene[]) => void;
  onQuantPrefChange?: (modelId: string, quant: string) => void | Promise<void>;
}

export default function HomePanelV2({
  scenes = [],
  globalModelConfig,
  modelQuantPrefs = {},
  downloadStates = {},
  onDownload,
  onDownloadCancel,
  onGlobalModelConfigChange,
  onNavigateToSettings: _onNavigateToSettings,
  onNavigateToLlmSettings,
  tryRegisterShortcut,
  triggerSelectModelSceneId: _triggerSelectModelSceneId,
  onTriggerSelectModelCleared: _onTriggerSelectModelCleared,
  onScenesSave,
  onQuantPrefChange,
}: HomePanelV2Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [localScenes, setLocalScenes] = useState<Scene[]>(scenes);
  const [asrModels, setAsrModels] = useState<AsrModelWithStatus[]>([]);
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [selectingSceneId, setSelectingSceneId] = useState<string | null>(null);
  const [stats, setStats] = useState<FullStats>({
    totalDuration: 0,
    totalWords: 0,
    totalCount: 0,
    todayCount: 0,
    activeDays: 0,
  });

  // 快捷键监听状态
  const [listeningSceneId, setListeningSceneId] = useState<string | null>(null);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const listeningSceneIdRef = useRef(listeningSceneId);
  const localScenesRef = useRef(localScenes);
  const tryRegisterShortcutRef = useRef(tryRegisterShortcut);
  const onScenesSaveRef = useRef(onScenesSave);

  // 自定义预设
  const [customPresets, setCustomPresets] = useState<Record<string, string>>({});

  // 快捷键错误弹窗状态
  const [shortcutError, setShortcutError] = useState<{
    shortcut: string;
    errorType: 'unsupported' | 'occupied' | 'unknown';
    errorMessage: string;
  } | null>(null);

  // 计算平均值
  const avgStats = useMemo(() => {
    const days = stats.activeDays || 1;
    return {
      avgWordsPerDay: Math.round(stats.totalWords / days),
      avgRecordsPerDay: Math.round(stats.totalCount / days),
    };
  }, [stats]);

  // 加载统计数据
  useEffect(() => {
    getFullStats()
      .then(s => {
        setStats({
          totalDuration: s?.totalDuration ?? 0,
          totalWords: s?.totalWords ?? 0,
          totalCount: s?.totalCount ?? 0,
          todayCount: s?.todayCount ?? 0,
          activeDays: s?.activeDays ?? 0,
        });
      })
      .catch(() => {
        setStats({ totalDuration: 0, totalWords: 0, totalCount: 0, todayCount: 0, activeDays: 0 });
      });
  }, []);

  // 加载 ASR 模型列表
  useEffect(() => {
    const loadAsrModels = async () => {
      try {
        const result = await getAsrModelList();
        setAsrModels(result);
        log.info(`Loaded ${result.length} ASR models`);
      } catch (err) {
        log.error(`Failed to load ASR models: ${err}`);
      }
    };
    loadAsrModels();
  }, []);

  // 加载 Provider 列表
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const result = await getProviderList();
        setProviders(result);
        log.info(`Loaded ${result.length} providers`);
      } catch (err) {
        log.error(`Failed to load providers: ${err}`);
      }
    };
    loadProviders();
  }, []);

  // 下载完成后重新加载模型列表
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

  // 同步 scenes
  useEffect(() => {
    setLocalScenes(scenes);
  }, [scenes]);

  // 更新 refs
  useEffect(() => {
    localScenesRef.current = localScenes;
  }, [localScenes]);

  useEffect(() => {
    listeningSceneIdRef.current = listeningSceneId;
  }, [listeningSceneId]);

  useEffect(() => {
    tryRegisterShortcutRef.current = tryRegisterShortcut;
  }, [tryRegisterShortcut]);

  useEffect(() => {
    onScenesSaveRef.current = onScenesSave;
  }, [onScenesSave]);

  // 加载自定义预设
  useEffect(() => {
    getLlmPromptPresets().then(presets => {
      if (presets?.customPresets) {
        setCustomPresets(presets.customPresets);
      }
    });
  }, []);

  // 处理 ASR 模型选择
  const handleAsrModelSelect = useCallback(async (modelId: string) => {
    if (!modelId || !globalModelConfig) {
      setSelectingSceneId(null);
      return;
    }

    // 获取旧模型 ID（用于卸载）
    const oldModelId = globalModelConfig.asrModel
      ? getFullModelId(globalModelConfig.asrModel)
      : null;

    const { baseId, quant } = parseModelId(modelId);
    const newConfig: GlobalModelConfig = {
      asrModel: {
        modelId: baseId,
        quantization: quant,
      },
      llm: globalModelConfig.llm || {
        providerId: '',
        model: '',
        maxTokens: 1024,
        temperature: 0.3,
      },
    };

    // 保存配置
    try {
      const config = await loadConfig();
      await saveConfig({
        ...config,
        globalModelConfig: newConfig,
      });

      // 切换模型（卸载旧模型 + 加载新模型）
      log.info(`Switching ASR model from ${oldModelId} to ${modelId}`);
      const result = await switchAsrModel(oldModelId, modelId);

      if (result.success) {
        log.info(`ASR model switched successfully: ${modelId}`);
        showToast({
          type: 'success',
          title: t('common.saved'),
          description: t('home.asrModelUpdated'),
        });
      } else {
        log.warn(`ASR model switch failed: ${result.error}`);
        showToast({
          type: 'warning',
          title: t('common.saved'),
          description: result.error || '模型加载失败，但配置已保存',
        });
      }

      if (onGlobalModelConfigChange) {
        onGlobalModelConfigChange(newConfig);
      }
    } catch (err) {
      log.error(`Failed to save ASR model: ${err}`);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(err),
      });
    }

    setSelectingSceneId(null);
  }, [globalModelConfig, onGlobalModelConfigChange, showToast, t]);

  // 处理快捷键点击
  const handleShortcutClick = useCallback((sceneId: string) => {
    // 取消已有的监听
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }

    setListeningSceneId(sceneId);

    // 5秒后自动取消
    listeningTimeoutRef.current = setTimeout(() => {
      setListeningSceneId(null);
    }, 5000);
  }, []);

  // 键盘事件监听 - 用于捕获快捷键
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

      // 尝试注册
      const tryRegister = tryRegisterShortcutRef.current;
      if (tryRegister) {
        const result = await tryRegister(newShortcut, scene.id);
        if (!result.success) {
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
          return;
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

      if (onScenesSaveRef.current) {
        onScenesSaveRef.current(newScenes);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  // 获取全局 ASR 模型信息
  const asrModelId = globalModelConfig?.asrModel ? getFullModelId(globalModelConfig.asrModel) : '';
  const asrModelBaseName = asrModelId ? getModelName(asrModelId, asrModels) : t('home.noAsrModelSelected');
  const asrModelQuant = asrModelId ? getModelQuant(asrModelId, asrModels, t) : null;
  const asrModelName = asrModelQuant ? `${asrModelBaseName} (${asrModelQuant})` : asrModelBaseName;

  // 获取全局 LLM 配置信息
  const llmConfig = globalModelConfig?.llm;
  const currentProvider = providers.find(p => p.meta.id === llmConfig?.providerId);

  // 获取 Provider 友好显示名称
  const getProviderDisplayName = (providerId: string): string => {
    // llama.cpp 显示为"本地大模型"，更易于理解
    if (providerId === 'llama_cpp') {
      return '本地大模型';
    }
    // 其他 Provider 使用原有 label
    return currentProvider?.meta.label || providerId;
  };

  // 显示格式：provider名称 - 模型名称
  const llmModelName = currentProvider && llmConfig?.model
    ? `${getProviderDisplayName(currentProvider.meta.id)} - ${llmConfig.model}`
    : currentProvider
      ? getProviderDisplayName(currentProvider.meta.id)
      : t('home.noModelSelected');

  // 有 providerId 就算配置了
  const hasLlmConfig = !!llmConfig?.providerId;

  // 只显示前两个启用的场景（首页展示限制）
  const enabledScenes = localScenes.filter(s => s.enabled).slice(0, 2);

  return (
    <div className="min-h-[400px] flex flex-col">
      {/* 头部区域：品牌 + 模型状态 */}
      <header className="mb-2">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Voconly</h1>
        <p className="text-sm text-gray-400 mt-1">说出你的想法，让 AI 优化你的表达</p>

        {/* 模型状态栏 */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setSelectingSceneId('global')}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 text-xs rounded-lg"
          >
            <AsrIcon className="w-3 h-3 text-gray-800" />
            <span>{asrModelName}</span>
            {globalModelConfig?.asrModel?.modelId && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            onClick={onNavigateToLlmSettings}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 text-xs rounded-lg"
          >
            <LlmIcon className="w-3 h-3 text-gray-800" />
            <span>{llmModelName}</span>
            {hasLlmConfig && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>
      </header>

      {/* 场景快捷键 - 主角区域 */}
      <section className="flex-1 flex flex-col justify-center">
        <div className="-mx-4 px-4 py-10" style={{ background: 'radial-gradient(ellipse at center, rgba(243, 244, 246, 0.7) 0%, rgba(243, 244, 246, 0.4) 50%, transparent 90%)' }}>
          <div className="text-center mb-8">
            <h2 className="text-base font-medium text-gray-500 mb-2">场景快捷键</h2>
            <p className="text-xs text-gray-400">按下快捷键开始语音输入，再次按下结束识别</p>
          </div>

          {enabledScenes.length > 0 ? (
            <div className="flex flex-wrap gap-10 justify-center">
              {enabledScenes.map((scene) => {
                const promptType = scene.promptType || 'lightPolish';
                const hasLlm = hasLlmConfig && (scene.promptType || scene.customPrompt);
                const isListening = listeningSceneId === scene.id;

                return (
                  <button
                    key={scene.id}
                    className="group relative flex flex-col items-center bg-white border border-gray-100 rounded-2xl p-12 text-center transition-all duration-200 hover:border-gray-200 hover:shadow-lg min-w-[260px] w-[280px]"
                    onClick={() => handleShortcutClick(scene.id)}
                  >
                    {/* 键帽样式快捷键 */}
                    <div className="relative mb-5">
                      <div
                        className={`w-20 h-20 rounded-xl font-mono text-2xl font-bold flex items-center justify-center transition-all duration-150 ${
                          isListening
                            ? 'bg-amber-400 text-amber-900 shadow-lg shadow-amber-200 animate-pulse'
                            : 'bg-gray-800 text-white shadow-lg group-hover:bg-gray-900 group-hover:shadow-xl group-hover:-translate-y-0.5'
                        }`}
                        style={{
                          boxShadow: isListening
                            ? '0 8px 0 0 rgb(217 119 6), 0 12px 24px -4px rgba(217, 119, 6, 0.4)'
                            : '0 8px 0 0 rgb(31 41 55), 0 12px 24px -4px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        {isListening ? (
                          <span className="text-base">...</span>
                        ) : (
                          formatShortcut(scene.shortcut)
                        )}
                      </div>
                    </div>

                    {/* 场景名称 */}
                    <div className="text-sm font-medium text-gray-900">
                      {getSceneNameFromPromptType(scene.promptType, scene.customPrompt, t, customPresets)}
                    </div>

                    {/* 场景描述 */}
                    {hasLlm && promptType && ['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'].includes(promptType) && (
                      <div className="text-xs text-gray-400 mt-1.5 line-clamp-1">
                        {t(`llmConfig.promptTypeDescs.${promptType}`)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-white/60 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center py-12">
              <div className="text-sm font-medium text-gray-400 mb-1">暂无启用的场景</div>
              <div className="text-xs text-gray-400">请前往设置添加场景</div>
            </div>
          )}
        </div>
      </section>

      {/* 统计卡片 - 底部区域 */}
      <section className="mt-8 pt-6 border-t border-gray-100">
        <div className="grid grid-cols-4 gap-3">
          {/* 总时长 */}
          <div className="bg-gray-100 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t('memory.totalDuration')}</div>
            <div className="text-lg font-bold text-gray-900">{formatDuration(stats.totalDuration)}</div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.activeDays > 0 ? `共 ${stats.activeDays} 天` : '—'}
            </div>
          </div>

          {/* 总字数 */}
          <div className="bg-gray-100 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t('memory.totalWords')}</div>
            <div className="text-lg font-bold text-gray-900">{(stats.totalWords ?? 0).toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.activeDays > 0 ? `日均 ${avgStats.avgWordsPerDay.toLocaleString()}` : '—'}
            </div>
          </div>

          {/* 总记录 */}
          <div className="bg-gray-100 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t('memory.totalCount')}</div>
            <div className="text-lg font-bold text-gray-900">{stats.totalCount}</div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.activeDays > 0 ? `日均 ${avgStats.avgRecordsPerDay}` : '—'}
            </div>
          </div>

          {/* 今日 */}
          <div className="bg-gray-100 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t('memory.todayCount')}</div>
            <div className="text-lg font-bold text-gray-900">{stats.todayCount}</div>
            <div className="text-xs text-gray-500 mt-1">今日记录</div>
          </div>
        </div>
      </section>

      {/* ASR 模型选择弹窗 */}
      {selectingSceneId && (
        <AsrModelSelectModal
          models={asrModels}
          selectedModelId={globalModelConfig?.asrModel ? getFullModelId(globalModelConfig.asrModel) : ''}
          onSelect={handleAsrModelSelect}
          onClose={() => setSelectingSceneId(null)}
          downloadStates={downloadStates}
          onDownload={onDownload}
          onDownloadCancel={onDownloadCancel}
          currentLanguage="zh"
          modelQuantPrefs={modelQuantPrefs}
          onQuantPrefChange={onQuantPrefChange}
        />
      )}

      {/* 快捷键错误弹窗 */}
      {shortcutError && (
        <ShortcutErrorModal
          isOpen={true}
          shortcut={shortcutError.shortcut}
          errorType={shortcutError.errorType}
          errorMessage={shortcutError.errorMessage}
          onClose={() => setShortcutError(null)}
        />
      )}
    </div>
  );
}