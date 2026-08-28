import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LlmProviderInstance, ProviderWithConfig, GpuInfo } from '../types';
import { checkProviderConnection, detectGpu } from '../services/llm';
import { createLogger } from '../services/log';

const log = createLogger('LlamaCppConfigModal');

interface LlamaCppConfigModalProps {
  provider: ProviderWithConfig;
  onClose: () => void;
  onSave: (providerId: string, modelId: string, instance: LlmProviderInstance) => Promise<void>;
}

export default function LlamaCppConfigModal({
  provider,
  onClose,
  onSave,
}: LlamaCppConfigModalProps) {
  const { t } = useTranslation();
  const existingInstance = provider.instance;

  // 是否已配置
  const isConfigured = existingInstance?.enabled && existingInstance?.defaultModel;

  // Form state
  const [selectedModel, setSelectedModel] = useState(existingInstance?.defaultModel || '');
  const [nGpuLayers, setNGpuLayers] = useState<number>(
    existingInstance?.nGpuLayers ?? -1
  );
  const [contextLimit, setContextLimit] = useState<number>(
    existingInstance?.contextLimit ?? 4096
  );

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>(
    existingInstance?.defaultModel ? [existingInstance.defaultModel] : []
  );
  const [saving, setSaving] = useState(false);
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);

  // 加载时自动获取模型列表和 GPU 信息
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setLoadingError(null);

      try {
        // 并行获取 GPU 信息和模型列表
        const [gpuResult, connectionResult] = await Promise.all([
          detectGpu(),
          checkProviderConnection('llama_cpp', '', undefined),
        ]);

        setGpuInfo(gpuResult);
        log.debug(`GPU detected: available=${gpuResult.available}, type=${gpuResult.gpuType}`);

        if (connectionResult.available && connectionResult.models.length > 0) {
          setAvailableModels(connectionResult.models);
          // 如果还没有选择模型，默认选择第一个
          if (!selectedModel && connectionResult.models[0]) {
            setSelectedModel(connectionResult.models[0]);
          }
        } else if (!connectionResult.available) {
          setLoadingError(connectionResult.error || t('provider.connectionFailed'));
        }
      } catch (err) {
        log.error(`Failed to load initial data: ${err}`);
        setLoadingError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // 保存配置
  const handleSave = async () => {
    if (!selectedModel) {
      return;
    }

    setSaving(true);
    try {
      const instance: LlmProviderInstance = {
        metaId: 'llama_cpp',
        enabled: true,
        baseUrl: '',
        apiKey: undefined,
        defaultModel: selectedModel,
        nGpuLayers,
        contextLimit,
      };

      await onSave('llama_cpp', selectedModel, instance);
    } catch (err) {
      log.error(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {t('provider.llamaCppLabel')}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{provider.meta.description}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <div className="px-6 py-4 space-y-4">
            {/* 加载中状态 */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-gray-500">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm">{t('common.loading')}</span>
                </div>
              </div>
            )}

            {/* 加载错误 */}
            {!loading && loadingError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-red-700">{loadingError}</span>
              </div>
            )}

            {/* 模型选择 */}
            {!loading && !loadingError && availableModels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('provider.selectModel')}
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* GPU 模式选择 */}
            {!loading && !loadingError && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('provider.gpuLayers')}
                </label>
                <select
                  value={nGpuLayers}
                  onChange={(e) => setNGpuLayers(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                >
                  <option value={0}>{t('provider.gpuModeCpu')}</option>
                  <option value={-1}>
                    {gpuInfo?.available
                      ? `GPU (${gpuInfo.gpuType.toUpperCase()})`
                      : t('provider.gpuModeGpu')}
                  </option>
                </select>
              </div>
            )}

            {/* 上下文长度 */}
            {!loading && !loadingError && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('provider.contextLimit')}
                </label>
                <input
                  type="number"
                  value={contextLimit}
                  onChange={(e) => setContextLimit(parseInt(e.target.value) || 4096)}
                  min={512}
                  max={32768}
                  step={512}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                />
              </div>
            )}

                      </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !selectedModel || !!loadingError}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}