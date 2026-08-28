import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, GlobalModelConfig } from '../types';
import { getFullModelId } from '../types';
import type { DownloadProgress } from '../services/downloader';
import { formatShortcut } from '../utils/keyboard';
import { translateSceneName } from '../utils/i18n';
import { getAsrModelList, type AsrModelWithStatus, loadConfig, saveConfig } from '../services/config';
import { useToast } from './ui/Toast';
import AsrModelSelectModal from './AsrModelSelectModal';
import { createLogger } from '../services/log';

const log = createLogger('HomePanelV2');

// 图标组件
const AsrIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const LlmIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const SceneIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

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
}

// 获取提示词显示标签
const getPromptDisplayLabel = (
  promptType: string,
  t: (key: string) => string
): string => {
  // 内置类型
  const builtinLabels: Record<string, string> = {
    lightPolish: t('llmConfig.promptTypes.lightPolish'),
    translate: t('llmConfig.promptTypes.translate'),
    professionalPolish: t('llmConfig.promptTypes.professionalPolish'),
    meetingSecretary: t('llmConfig.promptTypes.meetingSecretary'),
  };

  if (builtinLabels[promptType]) {
    return builtinLabels[promptType];
  }

  // 自定义预设：直接返回预设名称
  return promptType;
};

export default function HomePanelV2({
  scenes = [],
  globalModelConfig,
  modelQuantPrefs = {},
  downloadStates = {},
  onDownload,
  onDownloadCancel,
  onGlobalModelConfigChange,
  onNavigateToSettings,
  onNavigateToLlmSettings,
}: HomePanelV2Props) {
  const { t, i18n } = useTranslation();
  const [asrModels, setAsrModels] = useState<AsrModelWithStatus[]>([]);
  const [showAsrSelect, setShowAsrSelect] = useState(false);
  const { showToast } = useToast();

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

  // 获取当前 ASR 模型信息
  const currentAsrModel = asrModels.find(
    m => m.preset.id === globalModelConfig?.asrModel?.modelId
  );

  // 获取当前 LLM 配置信息
  const currentLlmConfig = globalModelConfig?.llm;
  const hasLlmConfig = currentLlmConfig?.providerId && currentLlmConfig?.model;

  // 处理 ASR 模型选择
  const handleAsrSelect = useCallback(async (modelId: string) => {
    if (!modelId) {
      setShowAsrSelect(false);
      return;
    }

    // 解析模型 ID（可能包含量化后缀）
    const quantMatch = modelId.match(/-([Qq]\d+_[A-Za-z]+|Q?[\d]+_[A-Za-z]+)$/);
    const baseId = quantMatch ? modelId.replace(quantMatch[0], '') : modelId;
    const quant = quantMatch ? quantMatch[1] : undefined;

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

    setShowAsrSelect(false);
  }, [globalModelConfig, onGlobalModelConfigChange, showToast, t]);

  // 获取场景的提示词类型
  const getScenePromptType = (scene: Scene): string => {
    // 优先使用场景的 promptType
    if (scene.promptType) {
      return scene.promptType;
    }

    // 默认值
    return 'lightPolish';
  };

  // 检查场景是否启用了 LLM
  // 判断依据：全局 LLM 已配置 且 场景有提示词配置
  const isSceneLlmEnabled = (scene: Scene): boolean => {
    const hasGlobalLlm = globalModelConfig?.llm?.providerId && globalModelConfig?.llm?.model;
    const hasPrompt = scene.promptType || scene.customPrompt;
    return !!(hasGlobalLlm && hasPrompt);
  };

  return (
    <div className="min-h-[400px]">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('home.title')}</h1>
        <p className="text-sm text-gray-500">{t('home.subtitleV2')}</p>
      </div>

      {/* 模型配置卡片区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* ASR 模型卡片 */}
        <div
          className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-lg transition-all duration-200 cursor-pointer"
          onClick={() => setShowAsrSelect(true)}
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
              <AsrIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-500 mb-1">
                {t('home.asrModel')}
              </h3>
              {globalModelConfig?.asrModel?.modelId ? (
                <>
                  <p className="text-base font-semibold text-gray-900">
                    {currentAsrModel?.preset.name || globalModelConfig.asrModel.modelId}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {currentAsrModel?.preset.size || ''}
                    {globalModelConfig.asrModel.quantization && (
                      <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                        {globalModelConfig.asrModel.quantization}
                      </span>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-base text-gray-400">
                  {t('home.clickToSelectAsr')}
                </p>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* LLM 模型卡片 */}
        <div
          className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-lg transition-all duration-200 cursor-pointer"
          onClick={onNavigateToLlmSettings}
        >
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${hasLlmConfig ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
              <LlmIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-500 mb-1">
                {t('home.llmModel')}
              </h3>
              {hasLlmConfig ? (
                <>
                  <p className="text-base font-semibold text-gray-900">
                    {currentLlmConfig?.model}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {currentLlmConfig?.providerId}
                    <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                      {currentLlmConfig?.maxTokens} tokens
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-base text-gray-400">
                  {t('home.clickToConfigureLlm')}
                </p>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* 场景列表 */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('home.scenes')}</h2>
      </div>

      <div className="space-y-3">
        {scenes.map((scene) => {
          const llmEnabled = isSceneLlmEnabled(scene);
          const promptType = getScenePromptType(scene);

          return (
            <div
              key={scene.id}
              className={`bg-white rounded-xl border p-4 transition-all duration-200 ${
                scene.enabled
                  ? 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  : 'border-gray-100 bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                {/* 左侧：场景信息 */}
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    scene.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <SceneIcon />
                  </div>
                  <div>
                    <h3 className={`font-medium ${scene.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                      {translateSceneName(scene.name, t)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {/* 快捷键 */}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                        scene.enabled ? 'bg-gray-100 text-gray-600' : 'bg-gray-50 text-gray-400'
                      }`}>
                        {formatShortcut(scene.shortcut)}
                      </span>

                      {/* 提示词类型 */}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        scene.enabled
                          ? llmEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                          : 'bg-gray-50 text-gray-400'
                      }`}>
                        {getPromptDisplayLabel(promptType, t)}
                      </span>

                      {/* LLM 状态 */}
                      {llmEnabled && (
                        <span className="text-xs text-emerald-500">
                          {t('home.llmEnabled')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 右侧：操作 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      // TODO: 打开场景设置
                      if (onNavigateToSettings) {
                        onNavigateToSettings();
                      }
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      scene.enabled
                        ? 'hover:bg-gray-100 text-gray-500'
                        : 'text-gray-300 cursor-not-allowed'
                    }`}
                    disabled={!scene.enabled}
                    title={t('home.sceneSettings')}
                  >
                    <SettingsIcon />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* 空状态 */}
        {scenes.length === 0 && (
          <div className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
              <SceneIcon />
            </div>
            <h3 className="text-gray-900 font-medium mb-1">{t('home.noScenes')}</h3>
            <p className="text-sm text-gray-500">{t('home.goToSettingsToAdd')}</p>
          </div>
        )}
      </div>

      {/* ASR 模型选择弹窗 */}
      {showAsrSelect && (
        <AsrModelSelectModal
          models={asrModels}
          selectedModelId={globalModelConfig?.asrModel ? getFullModelId(globalModelConfig.asrModel) : ''}
          onSelect={handleAsrSelect}
          onClose={() => setShowAsrSelect(false)}
          downloadStates={downloadStates}
          onDownload={onDownload}
          onDownloadCancel={onDownloadCancel}
          currentLanguage={i18n.language}
          modelQuantPrefs={modelQuantPrefs}
          onQuantPrefChange={() => {}}
        />
      )}
    </div>
  );
}