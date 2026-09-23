import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, GlobalModelConfig, ProviderWithConfig } from '../types';
import { getFullModelId } from '../types';
import type { DownloadProgress } from '../services/downloader';
import { extractShortcutFromEvent, parseShortcutForDisplay } from '../utils/keyboard';
import { getSceneNameFromPromptType } from '../utils/i18n';
import { getAsrModelList, type AsrModelWithStatus, parseModelId, QUANT_LABELS, loadConfig, saveConfig } from '../services/config';
import { switchAsrModel, isModelLoaded } from '../services/whisper';
import { subscribeToDownloadComplete, invalidateAsrModelsCache } from '../services/downloader';
import { getFullStats, type FullStats } from '../services/history';
import { getProviderList, getLlmPromptPresets } from '../services/llm';
import { listen } from '@tauri-apps/api/event';
import AsrModelSelectModal from './AsrModelSelectModal';
import ShortcutErrorModal from './ShortcutErrorModal';
import SceneForm from './SceneForm';
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

// 格式化时长（只显示分钟数）
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  return `${mins}`;
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
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
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
  checkConflict,
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
  const [asrLoadError, setAsrLoadError] = useState<string | null>(null); // ASR 模型加载失败原因
  const [stats, setStats] = useState<FullStats>({
    totalDuration: 0,
    totalWords: 0,
    totalCount: 0,
    todayCount: 0,
    activeDays: 0,
  });
  const [showTutorial, setShowTutorial] = useState(false);

  // 场景编辑对话框状态
  const [showForm, setShowForm] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);

  // 快捷键监听状态
  const [listeningSceneId, setListeningSceneId] = useState<string | null>(null);
  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningSceneIdRef = useRef(listeningSceneId);
  const localScenesRef = useRef(localScenes);
  const tryRegisterShortcutRef = useRef(tryRegisterShortcut);
  const onScenesSaveRef = useRef(onScenesSave);
  const setPausedRef = useRef(setPaused);

  // 组合键录制状态
  const [pressedModifiers, setPressedModifiers] = useState<string[]>([]);
  const pressedModifiersRef = useRef<string[]>([]);

  // 更新 refs
  useEffect(() => {
    setPausedRef.current = setPaused;
  }, [setPaused]);

  useEffect(() => {
    listeningSceneIdRef.current = listeningSceneId;
  }, [listeningSceneId]);

  // 监听 listeningSceneId 变化，暂停/恢复全局快捷键监听
  useEffect(() => {
    if (listeningSceneId) {
      // 开始编辑快捷键，暂停全局监听
      setPausedRef.current?.(true);
    } else {
      // 编辑结束，恢复全局监听并重置修饰键状态
      setPressedModifiers([]);
      pressedModifiersRef.current = [];
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

  // 监听历史记录更新事件，刷新统计数据
  useEffect(() => {
    const handleHistoryUpdate = () => {
      log.debug('Received history-updated event, refreshing stats');
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
        .catch(err => {
          log.error(`Failed to refresh stats: ${err}`);
        });
    };

    window.addEventListener('history-updated', handleHistoryUpdate);

    return () => {
      window.removeEventListener('history-updated', handleHistoryUpdate);
    };
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

      // 先检查模型状态，不要预设"加载中"
      // 这样可以保留之前已知的卸载状态（灰点）
      try {
        // 检查模型是否已加载
        const loaded = await isModelLoaded(modelId);
        if (mounted) {
          setAsrLoading(false); // 检查完成后，加载状态应该是 false（不是在加载中）
          setAsrModelLoaded(loaded);
          if (loaded) {
            log.debug(`ASR model ${modelId} is already loaded`);
          } else {
            log.debug(`ASR model ${modelId} is not loaded`);
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
        setAsrLoadError(null); // 清除错误信息
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
        setAsrLoadError(event.payload.error || '加载失败'); // 存储错误信息
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

        // 更新模型缓存
        await invalidateAsrModelsCache();

        // 检查是否是内存不足错误（如果是，不显示 Toast，由事件监听器弹出对话框）
        if (result.error?.includes('MEMORY_INSUFFICIENT')) {
          // 内存不足错误由 App.tsx 的 asr-model-load-failed 监听器处理
          log.info(`Memory insufficient error, dialog will be shown by event listener`);
        } else {
          // 其他错误显示 Toast 提示
          showToast({
            type: 'warning',
            title: t('modelConfig.modelFileNotFound'),
            description: t('modelConfig.modelFileNotFoundDesc'),
          });
        }
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

    // 重置修饰键状态
    setPressedModifiers([]);
    pressedModifiersRef.current = [];

    setListeningSceneId(sceneId);

    // 10秒后自动取消（给用户更多时间录制组合键）
    listeningTimeoutRef.current = setTimeout(() => {
      setListeningSceneId(null);
      setPressedModifiers([]);
      pressedModifiersRef.current = [];
      setPausedRef.current?.(false);
    }, 10000);
  }, []);

  // 打开场景编辑对话框
  const handleEditScene = useCallback((scene: Scene) => {
    setEditingScene(scene);
    setShowForm(true);
  }, []);

  // 保存场景编辑
  const handleSaveScene = useCallback((scene: Scene) => {
    const newScenes = localScenes.map(s => (s.id === scene.id ? scene : s));
    setLocalScenes(newScenes);
    localScenesRef.current = newScenes;
    setShowForm(false);
    setEditingScene(null);
    if (onScenesSave) {
      onScenesSave(newScenes);
    }
  }, [localScenes, onScenesSave]);

  // 取消场景编辑
  const handleCancelSceneForm = useCallback(() => {
    setShowForm(false);
    setEditingScene(null);
  }, []);

  // 修饰键列表
  const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];

  // 判断是否为修饰键
  const isModifierKey = (key: string): boolean => {
    return MODIFIER_KEYS.some(mod => key === mod || key.startsWith(mod));
  };

  // 规范化修饰键名称
  const normalizeModifierName = (e: KeyboardEvent): string => {
    // 根据 e.code 和 e.location 区分左右修饰键
    if (e.key === 'Control') {
      return e.location === 2 ? 'RightCtrl' : 'LeftCtrl';
    }
    if (e.key === 'Shift') {
      return e.location === 2 ? 'RightShift' : 'LeftShift';
    }
    if (e.key === 'Alt') {
      return e.location === 2 ? 'RightAlt' : 'LeftAlt';
    }
    if (e.key === 'Meta') {
      return e.location === 2 ? 'RightWindows' : 'LeftWindows';
    }
    return e.key;
  };

  // 键盘事件监听 - 用于捕获快捷键（支持组合键）
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const currentListeningId = listeningSceneIdRef.current;
      if (!currentListeningId) return;

      e.preventDefault();
      e.stopPropagation();

      // Escape 取消录制
      if (e.key === 'Escape') {
        setListeningSceneId(null);
        listeningSceneIdRef.current = null;
        setPressedModifiers([]);
        pressedModifiersRef.current = [];
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        setPausedRef.current?.(false);
        return;
      }

      // 检测修饰键按下 - 只记录，不触发完成
      if (isModifierKey(e.key)) {
        const modKey = normalizeModifierName(e);
        if (!pressedModifiersRef.current.includes(modKey)) {
          pressedModifiersRef.current = [...pressedModifiersRef.current, modKey];
          setPressedModifiers([...pressedModifiersRef.current]);
        }
        return; // 继续监听，等待非修饰键
      }

      // 非修饰键按下 - 生成快捷键
      const mainKey = extractShortcutFromEvent(e);
      if (!mainKey) return;

      // 组合快捷键：修饰键 + 主键
      let newShortcut = mainKey;
      if (pressedModifiersRef.current.length > 0) {
        newShortcut = [...pressedModifiersRef.current, mainKey].join('+');
      }

      const currentScenes = localScenesRef.current;
      const scene = currentScenes.find(s => s.id === currentListeningId);
      if (!scene || scene.shortcut === newShortcut) {
        setListeningSceneId(null);
        listeningSceneIdRef.current = null;
        setPressedModifiers([]);
        pressedModifiersRef.current = [];
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        setPausedRef.current?.(false);
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
          setPressedModifiers([]);
          pressedModifiersRef.current = [];
          if (listeningTimeoutRef.current) {
            clearTimeout(listeningTimeoutRef.current);
          }
          setPausedRef.current?.(false);
          return;
        }
      }

      const updatedScene = { ...scene, shortcut: newShortcut };
      const newScenes = currentScenes.map(s => (s.id === currentListeningId ? updatedScene : s));
      setLocalScenes(newScenes);
      localScenesRef.current = newScenes;
      setListeningSceneId(null);
      listeningSceneIdRef.current = null;
      setPressedModifiers([]);
      pressedModifiersRef.current = [];

      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }

      if (onScenesSaveRef.current) {
        onScenesSaveRef.current(newScenes);
      }

      setPausedRef.current?.(false);
    };

    const handleKeyUp = async (e: KeyboardEvent) => {
      const currentListeningId = listeningSceneIdRef.current;
      if (!currentListeningId) return;

      // 修饰键释放时，从列表中移除
      if (isModifierKey(e.key)) {
        const modKey = normalizeModifierName(e);

        // 保存松开前的修饰键列表（用于生成快捷键）
        const modifiersBeforeRelease = [...pressedModifiersRef.current];

        // 从列表中移除当前松开的键
        pressedModifiersRef.current = pressedModifiersRef.current.filter(k => k !== modKey);
        setPressedModifiers([...pressedModifiersRef.current]);

        // 如果所有修饰键都松开了，且之前有修饰键被按下，就设置快捷键
        // 例如：只按了右 Alt 松开 → 设置 "RightAlt"
        //       按了 Ctrl+Shift 松开 → 设置组合
        if (modifiersBeforeRelease.length > 0 && pressedModifiersRef.current.length === 0) {
          // 取消超时
          if (listeningTimeoutRef.current) {
            clearTimeout(listeningTimeoutRef.current);
          }

          // 生成快捷键：使用松开前的修饰键列表
          const shortcutToSet = modifiersBeforeRelease.length === 1
            ? modifiersBeforeRelease[0]
            : modifiersBeforeRelease.join('+');

          const currentScenes = localScenesRef.current;
          const scene = currentScenes.find(s => s.id === currentListeningId);

          if (scene && scene.shortcut !== shortcutToSet) {
            // 尝试注册
            const tryRegister = tryRegisterShortcutRef.current;
            if (tryRegister) {
              const result = await tryRegister(shortcutToSet, scene.id);
              if (!result.success) {
                setShortcutError({
                  shortcut: shortcutToSet,
                  errorType: (result.errorType as 'unsupported' | 'occupied' | 'unknown') || 'unknown',
                  errorMessage: result.error || '',
                });
                setListeningSceneId(null);
                listeningSceneIdRef.current = null;
                setPressedModifiers([]);
                pressedModifiersRef.current = [];
                setPausedRef.current?.(false);
                return;
              }
            }

            const updatedScene = { ...scene, shortcut: shortcutToSet };
            const newScenes = currentScenes.map(s => (s.id === currentListeningId ? updatedScene : s));
            setLocalScenes(newScenes);
            localScenesRef.current = newScenes;

            if (onScenesSaveRef.current) {
              onScenesSaveRef.current(newScenes);
            }
          }

          setListeningSceneId(null);
          listeningSceneIdRef.current = null;
          setPressedModifiers([]);
          pressedModifiersRef.current = [];
          setPausedRef.current?.(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
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
    // 使用 Provider 的 label
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
        <p className="text-sm text-gray-600 mt-1">{t('app.tagline')}</p>

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
                // 未加载或加载失败：灰点 + 错误提示
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  {asrLoadError?.includes('MEMORY_INSUFFICIENT') && (
                    <span className="text-red-500 text-xs ml-1">{t('models.memoryInsufficient')}</span>
                  )}
                </>
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
            <h2 className="text-base font-medium text-gray-700 mb-2">{t('home.shortcutTitle')}</h2>
            <p className="text-xs text-gray-500">{t('home.shortcutHint')}</p>
          </div>

          {enabledScenes.length > 0 ? (
            <div id="scene-cards-area" className="flex flex-wrap gap-14 justify-center">
              {enabledScenes.map((scene, index) => {
                const promptType = scene.promptType || 'lightPolish';
                const hasLlm = hasLlmConfig && (scene.promptType || scene.customPrompt);
                const isListening = listeningSceneId === scene.id;

                // 解析快捷键用于层次化显示
                // 返回：topKey（上方内容）、bottomKey（下方内容）
                // 单键修饰键：topKey=前缀(右)，bottomKey=键名(Alt)
                // 组合键：topKey=主键(A)，bottomKey=修饰键(右 Alt)
                const parseShortcutForKeypad = (shortcut: string): {
                  topKey: string;
                  middleKey: string;    // 第三行（三键组合的第二个修饰键）
                  bottomKey: string;
                  isCombo: boolean;      // 是否为组合键
                  isModifierOnly: boolean; // 是否为单修饰键
                  isThreeKey: boolean;   // 是否为三键组合
                } => {
                  if (!shortcut) return { topKey: '', middleKey: '', bottomKey: '', isCombo: false, isModifierOnly: false, isThreeKey: false };

                  // 格式化修饰键（右 Ctrl）
                  const formatModifierKey = (modifierKey: string): { prefix: string; keyName: string } => {
                    if (modifierKey === 'LeftCtrl') return { prefix: t('keyboard.left'), keyName: 'Ctrl' };
                    if (modifierKey === 'RightCtrl') return { prefix: t('keyboard.right'), keyName: 'Ctrl' };
                    if (modifierKey === 'LeftShift') return { prefix: t('keyboard.left'), keyName: 'Shift' };
                    if (modifierKey === 'RightShift') return { prefix: t('keyboard.right'), keyName: 'Shift' };
                    if (modifierKey === 'LeftAlt') return { prefix: t('keyboard.left'), keyName: 'Alt' };
                    if (modifierKey === 'RightAlt') return { prefix: t('keyboard.right'), keyName: 'Alt' };
                    if (modifierKey === 'LeftWindows') return { prefix: t('keyboard.left'), keyName: 'Win' };
                    if (modifierKey === 'RightWindows') return { prefix: t('keyboard.right'), keyName: 'Win' };
                    return { prefix: '', keyName: modifierKey };
                  };

                  // 格式化主键
                  const formatMainKey = (mainKey: string): string => {
                    if (mainKey.startsWith('Key')) return mainKey.slice(3);
                    if (mainKey.startsWith('Digit')) return mainKey.slice(5);
                    if (mainKey === 'Space') return '␣';
                    if (mainKey.startsWith('Arrow')) {
                      const arrowMap: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
                      return arrowMap[mainKey] || mainKey;
                    }
                    return mainKey;
                  };

                  // 组合键（如 RightCtrl+A 或 LeftShift+Alt+A）
                  if (shortcut.includes('+')) {
                    const keys = shortcut.split('+');

                    // 三键组合（如 LeftShift+Alt+A）
                    if (keys.length >= 3) {
                      const modifier1 = keys[0];
                      const modifier2 = keys[1];
                      const mainKey = keys[2];

                      const mod1 = formatModifierKey(modifier1);
                      const mod2 = formatModifierKey(modifier2);
                      const mainDisplay = formatMainKey(mainKey);

                      return {
                        topKey: mainDisplay,
                        middleKey: mod2.prefix + ' ' + mod2.keyName,
                        bottomKey: mod1.prefix + ' ' + mod1.keyName,
                        isCombo: true,
                        isModifierOnly: false,
                        isThreeKey: true
                      };
                    }

                    // 两键组合（如 RightCtrl+A）
                    const modifierKey = keys[0];
                    const mainKey = keys[1];

                    const mod = formatModifierKey(modifierKey);
                    const mainDisplay = formatMainKey(mainKey);

                    return { topKey: mainDisplay, middleKey: '', bottomKey: mod.prefix + ' ' + mod.keyName, isCombo: true, isModifierOnly: false, isThreeKey: false };
                  }

                  // 单键修饰键（如 RightCtrl）- 显示反过来
                  if (shortcut === 'LeftCtrl') return { topKey: t('keyboard.left'), middleKey: '', bottomKey: 'Ctrl', isCombo: false, isModifierOnly: true, isThreeKey: false };
                  if (shortcut === 'RightCtrl') return { topKey: t('keyboard.right'), middleKey: '', bottomKey: 'Ctrl', isCombo: false, isModifierOnly: true, isThreeKey: false };
                  if (shortcut === 'LeftShift') return { topKey: t('keyboard.left'), middleKey: '', bottomKey: 'Shift', isCombo: false, isModifierOnly: true, isThreeKey: false };
                  if (shortcut === 'RightShift') return { topKey: t('keyboard.right'), middleKey: '', bottomKey: 'Shift', isCombo: false, isModifierOnly: true, isThreeKey: false };
                  if (shortcut === 'LeftAlt') return { topKey: t('keyboard.left'), middleKey: '', bottomKey: 'Alt', isCombo: false, isModifierOnly: true, isThreeKey: false };
                  if (shortcut === 'RightAlt') return { topKey: t('keyboard.right'), middleKey: '', bottomKey: 'Alt', isCombo: false, isModifierOnly: true, isThreeKey: false };
                  if (shortcut === 'LeftWindows') return { topKey: t('keyboard.left'), middleKey: '', bottomKey: 'Win', isCombo: false, isModifierOnly: true, isThreeKey: false };
                  if (shortcut === 'RightWindows') return { topKey: t('keyboard.right'), middleKey: '', bottomKey: 'Win', isCombo: false, isModifierOnly: true, isThreeKey: false };

                  // 普通单键
                  const display = formatMainKey(shortcut);
                  return { topKey: display, middleKey: '', bottomKey: '', isCombo: false, isModifierOnly: false, isThreeKey: false };
                };

                const { topKey, middleKey, bottomKey, isCombo, isModifierOnly, isThreeKey } = parseShortcutForKeypad(scene.shortcut);

                return (
                  <div
                    key={scene.id}
                    id={index === 0 ? 'scene-card-first' : undefined}
                    className="group relative flex flex-col items-center bg-gray-100 border border-gray-200 rounded-2xl px-16 py-10 text-center transition-all duration-200 hover:border-gray-300 hover:shadow-lg min-w-[340px] w-[360px] cursor-pointer shadow-sm"
                    onClick={() => handleEditScene(scene)}
                  >
                    {/* 键帽样式快捷键 */}
                    <div
                      className="relative mb-5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShortcutClick(scene.id);
                      }}
                    >
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
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-base">
                              {pressedModifiers.length > 0 ? (
                                // 显示按下的修饰键 + ...
                                pressedModifiers.map(mod => {
                                  // 简化显示：LeftCtrl -> Ctrl, RightShift -> Shift
                                  if (mod.startsWith('Left') || mod.startsWith('Right')) {
                                    const base = mod.slice(4);
                                    if (base === 'Windows') return 'Win';
                                    if (base === 'Alt') return 'Alt';
                                    return base;
                                  }
                                  return mod;
                                }).join(' + ') + ' + '
                              ) : (
                                '...'
                              )}
                            </span>
                            {pressedModifiers.length > 0 && (
                              <span className="text-xs opacity-70 mt-0.5">等待按键...</span>
                            )}
                          </div>
                        ) : isThreeKey ? (
                          // 三键组合：第一行主键（小字），第二行第二个修饰键（中字），第三行第一个修饰键（中字）
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-xs font-medium opacity-70">{topKey}</span>
                            <div className="flex items-baseline gap-0.5 mt-0.5">
                              <span className="text-xs opacity-60">{middleKey.split(' ')[0]}</span>
                              <span className="text-base font-bold">{middleKey.split(' ')[1]}</span>
                            </div>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-xs opacity-60">{bottomKey.split(' ')[0]}</span>
                              <span className="text-base font-bold">{bottomKey.split(' ')[1]}</span>
                            </div>
                          </div>
                        ) : isCombo ? (
                          // 两键组合：上方主键（小字），下方修饰键（大字）
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-sm font-medium opacity-70">{topKey}</span>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-sm opacity-60">{bottomKey.split(' ')[0]}</span>
                              <span className="text-xl font-bold">{bottomKey.split(' ')[1]}</span>
                            </div>
                          </div>
                        ) : isModifierOnly ? (
                          // 单修饰键：上方前缀（小字），下方键名（大字）
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-sm font-medium opacity-70">{topKey}</span>
                            <span className="text-xl font-bold">{bottomKey}</span>
                          </div>
                        ) : (
                          // 普通单键：直接显示
                          <span className="text-xl font-bold">{topKey}</span>
                        )}
                      </div>
                    </div>

                    {/* 场景名称 */}
                    <div className="text-sm font-medium text-gray-900">
                      {getSceneNameFromPromptType(scene.promptType, scene.customPrompt, t, customPresets)}
                    </div>

                    {/* 场景描述 */}
                    {hasLlm && promptType && ['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'].includes(promptType) && (
                      <div className="text-xs text-gray-500 mt-1.5 line-clamp-1">
                        {t(`llmConfig.promptTypeDescs.${promptType}`)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white/60 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center py-12">
              <div className="text-sm font-medium text-gray-500 mb-1">{t('home.noEnabledScenes')}</div>
              <div className="text-xs text-gray-500">{t('home.addSceneHint')}</div>
            </div>
          )}
        </div>
      </section>

      {/* 统计卡片 - 底部区域 */}
      <section className="mt-4">
        <div className="flex justify-center items-stretch">
          {/* 总时长 */}
          <div className="text-center px-8 py-1">
            <div className="text-lg font-semibold text-gray-800 tabular-nums">
              {formatDuration(stats.totalDuration)}
            </div>
            <div className="text-xs text-gray-600 mt-1.5">
              {t('memory.statsDuration')}{stats.activeDays > 0 && ` / ${t('memory.daysCount', { count: stats.activeDays })}`}
            </div>
          </div>

          {/* 分割线 */}
          <div className="w-px bg-gray-100 mx-1 self-stretch"></div>

          {/* 总字数 */}
          <div className="text-center px-8 py-1">
            <div className="text-lg font-semibold text-gray-800 tabular-nums">
              {(stats.totalWords ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-600 mt-1.5">
              {t('memory.statsWords')}{stats.activeDays > 0 && ` / ${t('memory.avgDaily', { count: avgStats.avgWordsPerDay.toLocaleString() })}`}
            </div>
          </div>

          {/* 分割线 */}
          <div className="w-px bg-gray-100 mx-1 self-stretch"></div>

          {/* 总记录 */}
          <div className="text-center px-8 py-1">
            <div className="text-lg font-semibold text-gray-800 tabular-nums">
              {stats.totalCount}
            </div>
            <div className="text-xs text-gray-600 mt-1.5">
              {t('memory.statsRecords')}{stats.activeDays > 0 && ` / ${t('memory.avgDaily', { count: avgStats.avgRecordsPerDay })}`}
            </div>
          </div>

          {/* 分割线 */}
          <div className="w-px bg-gray-100 mx-1 self-stretch"></div>

          {/* 今日 */}
          <div className="text-center px-8 py-1">
            <div className="text-lg font-semibold text-gray-800 tabular-nums">
              {stats.todayCount}
            </div>
            <div className="text-xs text-gray-600 mt-1.5">{t('memory.statsToday')}</div>
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

      {/* Scene Edit Form */}
      {showForm && editingScene && (
        <SceneForm
          scene={editingScene}
          onSave={handleSaveScene}
          onCancel={handleCancelSceneForm}
          checkConflict={checkConflict}
          setPaused={setPaused}
        />
      )}
    </div>
  );
}