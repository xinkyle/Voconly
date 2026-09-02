import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, GlobalModelConfig, ProviderWithConfig } from '../types';
import { getFullModelId } from '../types';
import type { DownloadProgress } from '../services/downloader';
import { extractShortcutFromEvent, parseShortcutForDisplay } from '../utils/keyboard';
import { getSceneNameFromPromptType } from '../utils/i18n';
import { getAsrModelList, type AsrModelWithStatus, parseModelId, QUANT_LABELS, loadConfig, saveConfig } from '../services/config';
import { switchAsrModel, isModelLoaded } from '../services/whisper';
import { subscribeToDownloadComplete } from '../services/downloader';
import { getFullStats, type FullStats } from '../services/history';
import { getProviderList, getLlmPromptPresets } from '../services/llm';
import { listen } from '@tauri-apps/api/event';
import AsrModelSelectModal from './AsrModelSelectModal';
import ShortcutErrorModal from './ShortcutErrorModal';
import { Tutorial } from './Tutorial';
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
  tutorialCompleted?: boolean;
  onTutorialComplete?: () => void;
  setPaused?: (paused: boolean) => void;
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
  tutorialCompleted,
  onTutorialComplete,
  setPaused,
}: HomePanelV2Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [localScenes, setLocalScenes] = useState<Scene[]>(scenes);
  const [asrModels, setAsrModels] = useState<AsrModelWithStatus[]>([]);
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [selectingSceneId, setSelectingSceneId] = useState<string | null>(null);
  const [asrLoading, setAsrLoading] = useState(false); // ASR 模型加载中状态
  const [asrModelLoaded, setAsrModelLoaded] = useState(false); // ASR 模型是否真正加载到内存
  const [stats, setStats] = useState<FullStats>({
    totalDuration: 0,
    totalWords: 0,
    totalCount: 0,
    todayCount: 0,
    activeDays: 0,
  });
  const [showTutorial, setShowTutorial] = useState(false);

  // 快捷键监听状态
  const [listeningSceneId, setListeningSceneId] = useState<string | null>(null);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const listeningSceneIdRef = useRef(listeningSceneId);
  const localScenesRef = useRef(localScenes);
  const tryRegisterShortcutRef = useRef(tryRegisterShortcut);
  const onScenesSaveRef = useRef(onScenesSave);
  const setPausedRef = useRef(setPaused);

  // 更新 refs
  useEffect(() => {
    setPausedRef.current = setPaused;
  }, [setPaused]);

  // 监听 listeningSceneId 变化，暂停/恢复全局快捷键监听
  useEffect(() => {
    if (listeningSceneId) {
      // 开始编辑快捷键，暂停全局监听
      setPausedRef.current?.(true);
    } else {
      // 编辑结束，恢复全局监听
      setPausedRef.current?.(false);
    }
  }, [listeningSceneId]);

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

  // 检测 ASR 模型加载状态（应用启动时）
  useEffect(() => {
    let mounted = true;

    const checkModelLoadStatus = async () => {
      const modelId = globalModelConfig?.asrModel
        ? getFullModelId(globalModelConfig.asrModel)
        : '';

      if (!modelId) {
        // 未配置模型，不显示加载状态
        setAsrLoading(false);
        setAsrModelLoaded(false);
        return;
      }

      // 初始设为加载中，后端可能在预加载
      setAsrLoading(true);
      setAsrModelLoaded(false);

      try {
        // 检查模型是否已加载
        const loaded = await isModelLoaded(modelId);
        if (mounted) {
          setAsrLoading(!loaded);
          setAsrModelLoaded(loaded);
          if (loaded) {
            log.info(`ASR model ${modelId} is already loaded`);
          } else {
            log.info(`ASR model ${modelId} is not loaded yet`);
            // 如果未加载，等待一段时间后再次检查（后端可能正在预加载）
            setTimeout(async () => {
              if (!mounted) return;
              try {
                const reloaded = await isModelLoaded(modelId);
                if (mounted) {
                  setAsrLoading(!reloaded);
                  setAsrModelLoaded(reloaded);
                  if (reloaded) {
                    log.info(`ASR model ${modelId} loaded after retry`);
                  }
                }
              } catch (e) {
                log.warn(`Failed to recheck model load status: ${e}`);
                if (mounted) {
                  setAsrLoading(false);
                  setAsrModelLoaded(false);
                }
              }
            }, 2000);
          }
        }
      } catch (err) {
        log.error(`Failed to check model load status: ${err}`);
        if (mounted) {
          setAsrLoading(false);
          setAsrModelLoaded(false);
        }
      }
    };

    // 只有在有配置时才检查
    if (globalModelConfig?.asrModel?.modelId) {
      checkModelLoadStatus();
    }

    return () => {
      mounted = false;
    };
  }, [globalModelConfig?.asrModel]);

  // 监听模型卸载事件（闲置自动卸载）
  useEffect(() => {
    let mounted = true;

    const unlisten = listen<string[]>('asr-models-unloaded', async (event) => {
      if (!mounted) return;

      const unloadedModels = event.payload;
      log.info(`[HomePanel] 收到模型卸载通知: ${JSON.stringify(unloadedModels)}`);

      // 检查当前模型是否被卸载
      const currentModelId = globalModelConfig?.asrModel
        ? getFullModelId(globalModelConfig.asrModel)
        : '';

      if (currentModelId && unloadedModels.includes(currentModelId)) {
        log.info(`[HomePanel] 当前模型 ${currentModelId} 已被卸载，更新状态`);
        setAsrLoading(false);
        setAsrModelLoaded(false); // 标记模型未加载
      }
    });

    return () => {
      mounted = false;
      unlisten.then(fn => fn());
    };
  }, [globalModelConfig?.asrModel]);

  // 监听模型加载开始事件（转录时自动加载）
  useEffect(() => {
    let mounted = true;

    const unlisten = listen<{ modelId: string }>('asr-model-loading', async (event) => {
      if (!mounted) return;

      const { modelId } = event.payload;
      log.info(`[HomePanel] 收到模型加载开始通知: ${modelId}`);

      // 检查是否是当前配置的模型
      const currentModelId = globalModelConfig?.asrModel
        ? getFullModelId(globalModelConfig.asrModel)
        : '';

      if (currentModelId === modelId) {
        log.info(`[HomePanel] 当前模型 ${modelId} 正在加载，显示加载动画`);
        setAsrLoading(true);
        setAsrModelLoaded(false);
      }
    });

    return () => {
      mounted = false;
      unlisten.then(fn => fn());
    };
  }, [globalModelConfig?.asrModel]);

  // 监听模型加载完成事件
  useEffect(() => {
    let mounted = true;

    const unlisten = listen<{ modelId: string }>('asr-model-loaded', async (event) => {
      if (!mounted) return;

      const { modelId } = event.payload;
      log.info(`[HomePanel] 收到模型加载完成通知: ${modelId}`);

      // 检查是否是当前配置的模型
      const currentModelId = globalModelConfig?.asrModel
        ? getFullModelId(globalModelConfig.asrModel)
        : '';

      if (currentModelId === modelId) {
        log.info(`[HomePanel] 当前模型 ${modelId} 已加载完成，显示绿点`);
        setAsrLoading(false);
        setAsrModelLoaded(true);
      }
    });

    return () => {
      mounted = false;
      unlisten.then(fn => fn());
    };
  }, [globalModelConfig?.asrModel]);

  // 监听模型加载失败事件
  useEffect(() => {
    let mounted = true;

    const unlisten = listen<{ modelId: string; error?: string }>('asr-model-load-failed', async (event) => {
      if (!mounted) return;

      const { modelId } = event.payload;
      log.info(`[HomePanel] 收到模型加载失败通知: ${modelId}`);

      // 检查是否是当前配置的模型
      const currentModelId = globalModelConfig?.asrModel
        ? getFullModelId(globalModelConfig.asrModel)
        : '';

      if (currentModelId === modelId) {
        log.info(`[HomePanel] 当前模型 ${modelId} 加载失败，显示灰点`);
        setAsrLoading(false);
        setAsrModelLoaded(false);
      }
    });

    return () => {
      mounted = false;
      unlisten.then(fn => fn());
    };
  }, [globalModelConfig?.asrModel]);

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

  // 检查是否需要显示引导
  useEffect(() => {
    if (scenes.length > 0 && !tutorialCompleted) {
      setShowTutorial(true);
    }
  }, [scenes.length, tutorialCompleted]);

  // 处理引导完成
  const handleTutorialComplete = useCallback(() => {
    setShowTutorial(false);
    if (onTutorialComplete) {
      onTutorialComplete();
    }
  }, [onTutorialComplete]);

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

      // 开始加载模型，设置加载中状态
      setAsrLoading(true);
      setAsrModelLoaded(false);
      log.info(`Switching ASR model from ${oldModelId} to ${modelId}`);

      // 切换模型（卸载旧模型 + 加载新模型）
      const result = await switchAsrModel(oldModelId, modelId);

      if (result.success) {
        log.info(`ASR model switched successfully: ${modelId}`);
        setAsrModelLoaded(true); // 标记模型已加载
        showToast({
          type: 'success',
          title: t('common.saved'),
          description: t('home.asrModelUpdated'),
        });
      } else {
        log.warn(`ASR model switch failed: ${result.error}`);
        setAsrModelLoaded(false); // 标记模型未加载
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
      setAsrModelLoaded(false);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(err),
      });
    } finally {
      // 加载完成（无论成功失败），清除加载中状态
      setAsrLoading(false);
    }

    setSelectingSceneId(null);
  }, [globalModelConfig, onGlobalModelConfigChange, showToast, t]);

  // 处理快捷键点击
  const handleShortcutClick = useCallback((sceneId: string) => {
    // 立即暂停全局快捷键监听（同步操作，避免 keyhook 在 useEffect 执行前捕获按键）
    setPausedRef.current?.(true);

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
    // llama.cpp 显示为"本地大模型"/"Local LLM"，更易于理解
    if (providerId === 'llama_cpp') {
      return t('home.localLlm');
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
        <p className="text-sm text-gray-500 mt-1">{t('app.tagline')}</p>

        {/* 模型状态栏 */}
        <div className="flex items-center gap-2 mt-4">
          <button
            id="asr-model-button"
            onClick={() => setSelectingSceneId('global')}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 text-xs rounded-lg"
          >
            <AsrIcon className="w-3 h-3 text-gray-800" />
            <span>{asrModelName}</span>
            {asrLoading ? (
              // 加载中：三个点依次闪烁的动画
              <span className="inline-flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-gray-500 animate-loading-dot" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-gray-500 animate-loading-dot" style={{ animationDelay: '200ms' }} />
                <span className="w-1 h-1 rounded-full bg-gray-500 animate-loading-dot" style={{ animationDelay: '400ms' }} />
              </span>
            ) : globalModelConfig?.asrModel?.modelId && (
              asrModelLoaded ? (
                // 已加载：绿点
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ) : (
                // 未加载（被卸载）：灰点（表示"已配置但未加载"的状态）
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              )
            )}
          </button>
          <button
            id="llm-config-button"
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
            <h2 className="text-base font-medium text-gray-500 mb-2">{t('home.shortcutTitle')}</h2>
            <p className="text-xs text-gray-400">{t('home.shortcutHint')}</p>
          </div>

          {enabledScenes.length > 0 ? (
            <div id="scene-cards-area" className="flex flex-wrap gap-10 justify-center">
              {enabledScenes.map((scene, index) => {
                const promptType = scene.promptType || 'lightPolish';
                const hasLlm = hasLlmConfig && (scene.promptType || scene.customPrompt);
                const isListening = listeningSceneId === scene.id;
                const { prefix, main } = parseShortcutForDisplay(scene.shortcut, t);

                return (
                  <button
                    key={scene.id}
                    id={index === 0 ? 'scene-card-first' : undefined}
                    className="group relative flex flex-col items-center bg-gray-100 border border-gray-200 rounded-2xl p-12 text-center transition-all duration-200 hover:border-gray-300 hover:shadow-lg min-w-[260px] w-[280px]"
                    onClick={() => handleShortcutClick(scene.id)}
                  >
                    {/* 键帽样式快捷键 */}
                    <div className="relative mb-5">
                      {/* 键帽底座 - 浅灰色层 */}
                      <div className="absolute top-[72px] left-1/2 -translate-x-1/2 w-[72px] h-3 rounded-b-lg bg-gray-400 transition-all duration-150 group-hover:bg-gray-500 group-hover:-translate-y-0.5"></div>

                      {/* 键帽顶部 */}
                      <div
                        className={`relative w-20 h-20 rounded-xl font-mono text-2xl font-bold flex items-center justify-center transition-all duration-150 ${
                          isListening
                            ? 'bg-amber-400 text-amber-900 animate-pulse'
                            : 'bg-gray-800 text-white group-hover:bg-gray-900 group-hover:-translate-y-0.5'
                        }`}
                        style={{
                          boxShadow: isListening
                            ? '0 4px 0 0 rgb(217 119 6)'
                            : '0 4px 0 0 rgb(55 65 81)'
                        }}
                      >
                        {isListening ? (
                          <span className="text-base">...</span>
                        ) : prefix ? (
                          // 有前缀（左/右修饰键）：前缀小字，主键名大字
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-sm font-medium opacity-70">{prefix}</span>
                            <span className="text-xl font-bold">{main}</span>
                          </div>
                        ) : (
                          // 普通键：直接显示
                          main
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
              <div className="text-sm font-medium text-gray-400 mb-1">{t('home.noEnabledScenes')}</div>
              <div className="text-xs text-gray-400">{t('home.addSceneHint')}</div>
            </div>
          )}
        </div>
      </section>

      {/* 统计卡片 - 底部区域 */}
      <section className="mt-8">
        <div className="flex justify-center items-stretch">
          {/* 总时长 */}
          <div className="text-center px-8 py-1">
            <div className="text-base font-semibold text-gray-800 tabular-nums">
              {formatDuration(stats.totalDuration)}
            </div>
            <div className="text-xs text-gray-400 mt-1.5">
              {t('memory.statsDuration')}{stats.activeDays > 0 && ` / ${t('memory.daysCount', { count: stats.activeDays })}`}
            </div>
          </div>

          {/* 分割线 */}
          <div className="w-px bg-gray-100 mx-1 self-stretch"></div>

          {/* 总字数 */}
          <div className="text-center px-8 py-1">
            <div className="text-base font-semibold text-gray-800 tabular-nums">
              {(stats.totalWords ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-1.5">
              {t('memory.statsWords')}{stats.activeDays > 0 && ` / ${t('memory.avgDaily', { count: avgStats.avgWordsPerDay.toLocaleString() })}`}
            </div>
          </div>

          {/* 分割线 */}
          <div className="w-px bg-gray-100 mx-1 self-stretch"></div>

          {/* 总记录 */}
          <div className="text-center px-8 py-1">
            <div className="text-base font-semibold text-gray-800 tabular-nums">
              {stats.totalCount}
            </div>
            <div className="text-xs text-gray-400 mt-1.5">
              {t('memory.statsRecords')}{stats.activeDays > 0 && ` / ${t('memory.avgDaily', { count: avgStats.avgRecordsPerDay })}`}
            </div>
          </div>

          {/* 分割线 */}
          <div className="w-px bg-gray-100 mx-1 self-stretch"></div>

          {/* 今日 */}
          <div className="text-center px-8 py-1">
            <div className="text-base font-semibold text-gray-800 tabular-nums">
              {stats.todayCount}
            </div>
            <div className="text-xs text-gray-400 mt-1.5">{t('memory.statsToday')}</div>
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

      {/* Tutorial */}
      {showTutorial && (
        <Tutorial
          onComplete={handleTutorialComplete}
        />
      )}
    </div>
  );
}