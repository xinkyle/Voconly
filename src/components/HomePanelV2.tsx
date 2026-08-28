import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, GlobalModelConfig, ProviderWithConfig } from '../types';
import { getFullModelId } from '../types';
import type { DownloadProgress } from '../services/downloader';
import { extractShortcutFromEvent, formatShortcut } from '../utils/keyboard';
import { translateSceneName } from '../utils/i18n';
import { getAsrModelList, type AsrModelWithStatus, parseModelId, QUANT_LABELS, loadConfig, saveConfig } from '../services/config';
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

  // 提示词类型选择状态
  const [selectingPromptTypeSceneId, setSelectingPromptTypeSceneId] = useState<string | null>(null);
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

      if (onGlobalModelConfigChange) {
        onGlobalModelConfigChange(newConfig);
      }

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

  // 处理提示词类型点击
  const handlePromptTypeClick = useCallback((sceneId: string) => {
    setSelectingPromptTypeSceneId(sceneId);
  }, []);

  // 处理提示词类型选择
  const handlePromptTypeSelect = useCallback(async (sceneId: string, promptType: string) => {
    setSelectingPromptTypeSceneId(null);

    const scene = localScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const builtinTypes = ['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'];
    const isBuiltinType = builtinTypes.includes(promptType);

    // 如果没有变化，直接返回
    if (scene.promptType === promptType && isBuiltinType) {
      return;
    }

    try {
      // 更新场景的提示词类型
      const updatedScene = {
        ...scene,
        promptType: promptType,
        customPrompt: isBuiltinType ? undefined : (customPresets[promptType] || ''),
      };
      const newScenes = localScenes.map(s => (s.id === sceneId ? updatedScene : s));

      // 保存配置
      const config = await loadConfig();
      await saveConfig({
        ...config,
        scenes: newScenes,
      });

      setLocalScenes(newScenes);

      const builtinTypeI18nKey: Record<string, string> = {
        lightPolish: 'lightPolish',
        translate: 'translate',
        professionalPolish: 'professionalPolish',
        meetingSecretary: 'meetingSecretary',
      };
      const toastDesc = isBuiltinType ? t('llmConfig.promptTypes.' + builtinTypeI18nKey[promptType]) : promptType;

      showToast({
        type: 'success',
        title: t('home.promptTypeSwitched'),
        description: toastDesc,
      });
    } catch (error) {
      log.error(`Failed to save prompt type: ${error}`);
      showToast({
        type: 'error',
        title: t('common.error'),
        description: String(error),
      });
    }
  }, [localScenes, customPresets, showToast, t]);

  // 获取全局 ASR 模型信息
  const asrModelId = globalModelConfig?.asrModel ? getFullModelId(globalModelConfig.asrModel) : '';
  const asrModelName = asrModelId ? getModelName(asrModelId, asrModels) : t('home.noModelSelected');

  // 获取全局 LLM 配置信息
  const llmConfig = globalModelConfig?.llm;
  const currentProvider = providers.find(p => p.meta.id === llmConfig?.providerId);

  // 优先显示 model，其次显示 provider 名称，都没有则提示配置
  const llmModelName = llmConfig?.model
    || (currentProvider ? currentProvider.meta.label : null)
    || t('home.noModelSelected');

  // 有 providerId 就算配置了
  const hasLlmConfig = !!llmConfig?.providerId;

  const enabledScenes = localScenes.filter(s => s.enabled);

  return (
    <div className="min-h-[400px]">
      {/* 品牌 */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Voconly</h1>
        <p className="text-sm text-gray-400 mt-1">语音转文字，高效转录</p>
      </header>

      {/* 统计卡片 */}
      <section className="mb-8">
        <div className="grid grid-cols-4 gap-3">
          {/* 总时长 */}
          <div className="bg-gray-100 rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-2 text-gray-600 mb-3">
              <ClockIcon className="w-4 h-4" />
              <span className="text-xs font-medium">{t('memory.totalDuration')}</span>
            </div>
            <div className="text-xl font-bold text-gray-900 mb-1">
              {formatDuration(stats.totalDuration)}
            </div>
            <div className="text-xs text-gray-500">
              {stats.activeDays > 0 ? t('memory.activeDays', { count: stats.activeDays }) : t('memory.totalDurationDesc')}
            </div>
          </div>

          {/* 总字数 */}
          <div className="bg-gray-100 rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-2 text-gray-600 mb-3">
              <TextIcon className="w-4 h-4" />
              <span className="text-xs font-medium">{t('memory.totalWords')}</span>
            </div>
            <div className="text-xl font-bold text-gray-900 mb-1">
              {(stats.totalWords ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">
              {stats.activeDays > 0 ? t('memory.avgWordsPerDay', { count: avgStats.avgWordsPerDay.toLocaleString() }) : t('memory.totalWordsDesc')}
            </div>
          </div>

          {/* 总记录 */}
          <div className="bg-gray-100 rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-2 text-gray-600 mb-3">
              <MicIcon className="w-4 h-4" />
              <span className="text-xs font-medium">{t('memory.totalCount')}</span>
            </div>
            <div className="text-xl font-bold text-gray-900 mb-1">
              {stats.totalCount}
            </div>
            <div className="text-xs text-gray-500">
              {stats.activeDays > 0 ? t('memory.avgRecordsPerDay', { count: avgStats.avgRecordsPerDay }) : t('memory.totalCountDesc')}
            </div>
          </div>

          {/* 今日 */}
          <div className="bg-gray-100 rounded-xl p-5 border border-gray-200">
            <div className="flex items-center gap-2 text-gray-600 mb-3">
              <CalendarIcon className="w-4 h-4" />
              <span className="text-xs font-medium">{t('memory.todayCount')}</span>
            </div>
            <div className="text-xl font-bold text-gray-900 mb-1">
              {stats.todayCount}
            </div>
            <div className="text-xs text-gray-500">{t('memory.todayCountDesc')}</div>
          </div>
        </div>
      </section>

      {/* 模型配置 */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">模型配置</h2>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* ASR */}
          <button
            onClick={() => setSelectingSceneId('global')}
            className="group relative bg-gray-100 border border-gray-200 hover:border-gray-300 rounded-xl p-5 text-left transition-all duration-200 hover:shadow-sm"
          >
            {/* 状态指示器 */}
            {globalModelConfig?.asrModel?.modelId && (
              <div className="absolute top-3.5 right-3.5">
                <span className="block w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            )}

            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                globalModelConfig?.asrModel?.modelId
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
              }`}>
                <AsrIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">语音识别模型</div>
                <div className="text-[15px] font-semibold text-gray-900 truncate mb-1.5">{asrModelName}</div>
                {/* 模型大小和精度 */}
                {asrModelId && (
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const quant = getModelQuant(asrModelId, asrModels, t);
                      const size = getModelSize(asrModelId, asrModels);
                      if (quant && size) {
                        return (
                          <>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-xl bg-gray-50 text-gray-600 text-[11px] font-medium border border-gray-200">
                              {quant}
                            </span>
                            <span className="text-gray-300">·</span>
                            <span className="text-[11px] text-gray-500">{size}</span>
                          </>
                        );
                      }
                      if (quant) {
                        return (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-xl bg-gray-50 text-gray-600 text-[11px] font-medium border border-gray-200">
                            {quant}
                          </span>
                        );
                      }
                      if (size) {
                        return <span className="text-[11px] text-gray-500">{size}</span>;
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* 箭头 */}
            <svg className="absolute bottom-4 right-4 w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* LLM */}
          <button
            onClick={onNavigateToLlmSettings}
            className="group relative bg-gray-100 border border-gray-200 hover:border-gray-300 rounded-xl p-5 text-left transition-all duration-200 hover:shadow-sm"
          >
            {/* 状态指示器 */}
            {hasLlmConfig && (
              <div className="absolute top-3.5 right-3.5">
                <span className="block w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            )}

            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                hasLlmConfig
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
              }`}>
                <LlmIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">AI 文本处理</div>
                <div className="text-[15px] font-semibold text-gray-900 truncate mb-1.5">{llmModelName}</div>
                {/* 占位元素，保持与ASR卡片对齐 */}
                <div className="h-[22px]" />
              </div>
            </div>

            {/* 箭头 */}
            <svg className="absolute bottom-4 right-4 w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </section>

      {/* 场景快捷键 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">场景快捷键</h2>
        </div>

        {enabledScenes.length > 0 ? (
          <div className="space-y-3">
            {enabledScenes.map((scene) => {
              const promptType = scene.promptType || 'lightPolish';
              const hasLlm = hasLlmConfig && (scene.promptType || scene.customPrompt);
              const isListening = listeningSceneId === scene.id;

              return (
                <button
                  key={scene.id}
                  className="group w-full flex items-center gap-4 bg-gray-100 border border-gray-200 rounded-xl px-5 py-4 text-left transition-all duration-200 hover:border-gray-300 hover:shadow-sm"
                >
                  {/* 快捷键 */}
                  <div
                    className="flex-shrink-0 w-20 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShortcutClick(scene.id);
                    }}
                  >
                    <span className={`inline-flex items-center justify-center w-full px-2.5 py-2 rounded-lg font-mono text-xs font-semibold transition-colors ${
                      isListening
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-gray-50 text-gray-600 group-hover:bg-gray-100'
                    }`}>
                      {isListening ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                          <span>...</span>
                        </div>
                      ) : (
                        formatShortcut(scene.shortcut)
                      )}
                    </span>
                  </div>

                  {/* 场景名称 */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-medium text-gray-900">
                      {translateSceneName(scene.name, t)}
                    </span>
                  </div>

                  {/* 模式标签 */}
                  <div
                    className="flex-shrink-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasLlm) {
                        handlePromptTypeClick(scene.id);
                      }
                    }}
                  >
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border bg-gray-50 text-gray-600 border-gray-200`}>
                      {!hasLlm ? (
                        <>
                          <MicIcon className="w-3.5 h-3.5" />
                          纯 ASR
                        </>
                      ) : (
                        <>
                          <LlmIcon className="w-3.5 h-3.5" />
                          {getPromptTypeLabel(promptType, t)}
                        </>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center py-12">
            <div className="text-sm font-medium text-gray-500 mb-1">暂无启用的场景</div>
            <div className="text-xs text-gray-400">请前往设置添加场景</div>
          </div>
        )}
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
          onQuantPrefChange={() => {}}
        />
      )}

      {/* 提示词类型选择弹窗 */}
      {selectingPromptTypeSceneId && (() => {
        const scene = localScenes.find(s => s.id === selectingPromptTypeSceneId);
        const currentPromptType = scene?.promptType || 'lightPolish';
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setSelectingPromptTypeSceneId(null)}
          >
            <div
              className="bg-white rounded-xl p-4 w-[280px] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900 text-sm">{t('home.selectPromptType')}</h4>
                <button
                  onClick={() => setSelectingPromptTypeSceneId(null)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1">
                {/* 内置预设 */}
                {(['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => handlePromptTypeSelect(selectingPromptTypeSceneId, type)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 ${
                      currentPromptType === type
                        ? 'bg-gray-900 text-white'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span className="text-sm font-medium">{getPromptTypeLabel(type, t)}</span>
                    {currentPromptType === type && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}

                {/* 自定义预设 */}
                {customPresets && Object.keys(customPresets).length > 0 && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    {Object.entries(customPresets).map(([presetName]) => {
                      const isSelected = currentPromptType === presetName;
                      return (
                        <button
                          key={presetName}
                          onClick={() => handlePromptTypeSelect(selectingPromptTypeSceneId, presetName)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 ${
                            isSelected
                              ? 'bg-gray-900 text-white'
                              : 'hover:bg-blue-50 text-blue-700'
                          }`}
                        >
                          <span className="text-sm font-medium">{presetName}</span>
                          {isSelected && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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