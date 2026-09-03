import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LlmProviderInstance, ProviderWithConfig, GpuInfo } from '../types';
import {
  checkProviderConnection,
  detectGpu,
  fetchProviderModels,
} from '../services/llm';
import { createLogger } from '../services/log';

const log = createLogger('ProviderConfigModal');

interface ProviderConfigModalProps {
  provider: ProviderWithConfig;
  onClose: () => void;
  onSave: (providerId: string, instance: LlmProviderInstance) => Promise<void>;
}

export default function ProviderConfigModal({
  provider,
  onClose,
  onSave,
}: ProviderConfigModalProps) {
  const { t } = useTranslation();
  const meta = provider.meta;
  const existingInstance = provider.instance;
  const isLlamaCpp = meta.id === 'llama_cpp';
  const isOllama = meta.id === 'ollama';

  // 是否已配置
  // - ollama: 只需要有 defaultModel（不需要 apiKey，因为是本地部署）
  // - 其他云端 provider: 需要有 apiKey 和 defaultModel
  // - llama.cpp: 有 nGpuLayers 配置即可（模型通过文件扫描）
  const isConfigured = isOllama
    ? !!existingInstance?.defaultModel
    : (existingInstance?.apiKey && existingInstance?.defaultModel);

  // Form state
  const [apiKey, setApiKey] = useState(existingInstance?.apiKey || '');
  const [selectedModel, setSelectedModel] = useState(existingInstance?.defaultModel || '');

  // GPU configuration state (for llama.cpp)
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  const [nGpuLayers, setNGpuLayers] = useState<number>(
    existingInstance?.nGpuLayers ?? -1
  );

  // Context limit state（仅 llama.cpp 使用）
  const [contextLimit, setContextLimit] = useState<number>(
    existingInstance?.contextLimit ?? 4096
  );

  // UI state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(isConfigured ? 'success' : null);
  const [testError, setTestError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>(
    existingInstance?.defaultModel ? [existingInstance.defaultModel] : []
  );
  const [saving, setSaving] = useState(false);

  // API key validation error
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // 是否正在自动连接（首次进入时）
  const [autoConnecting, setAutoConnecting] = useState(false);

  // 已配置时，自动加载模型列表
  useEffect(() => {
    if (isConfigured && !isLlamaCpp) {
      loadModelsFromProvider();
    }
  }, [isConfigured, isLlamaCpp, isOllama]);

  // 对于 Ollama，首次进入时自动尝试连接
  useEffect(() => {
    if (isOllama && !isConfigured && !testResult && !autoConnecting) {
      // 自动尝试连接
      setAutoConnecting(true);
      handleConnect().finally(() => {
        setAutoConnecting(false);
      });
    }
  }, [isOllama, isConfigured, testResult, autoConnecting]);

  // llama.cpp 时检测 GPU
  useEffect(() => {
    if (isLlamaCpp && isConfigured) {
      detectGpu().then(info => {
        setGpuInfo(info);
        log.debug(`GPU detected: available=${info.available}, type=${info.gpuType}`);
      }).catch(err => {
        log.error(`Failed to detect GPU: ${err}`);
      });
    }
  }, [isLlamaCpp, isConfigured]);

  // 从 Provider 加载模型列表
  const loadModelsFromProvider = async () => {
    // ollama 不需要 apiKey（本地部署），其他 provider 需要
    if (!isOllama && !existingInstance?.apiKey) return;

    setTesting(true);
    try {
      const models = await fetchProviderModels(
        meta.id,
        meta.baseUrl,
        isOllama ? undefined : existingInstance?.apiKey
      );
      if (models && models.length > 0) {
        setAvailableModels(models);
      }
    } catch (err) {
      log.error(`Failed to load models: ${err}`);
    } finally {
      setTesting(false);
    }
  };

  // Validate API key format (for HTTP-based providers)
  const validateApiKey = useCallback((key: string): string | null => {
    if (!key.trim()) return null;

    switch (meta.id) {
      case 'openai':
        if (!key.startsWith('sk-')) {
          return t('provider.openaiKeyFormat');
        }
        break;
      case 'deepseek':
        if (!key.startsWith('sk-')) {
          return t('provider.deepseekKeyFormat');
        }
        break;
      case 'gemini':
        if (!key.match(/^AIza[A-Za-z0-9_-]{35}$/)) {
          return t('provider.geminiKeyFormat');
        }
        break;
    }
    return null;
  }, [meta.id, t]);

  // Handle API key change
  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setTestResult(null);
    setTestError(null);
    setAvailableModels([]);
    setSelectedModel('');
    const error = validateApiKey(value);
    setApiKeyError(error);
  };

  // Test connection and fetch models
  const handleConnect = async () => {
    // Validate
    if (!isLlamaCpp && meta.requiresApiKey && !apiKey.trim()) {
      setApiKeyError(t('provider.apiKeyRequired'));
      return;
    }

    if (apiKeyError) {
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestError(null);
    setAvailableModels([]);

    try {
      const baseUrl = meta.baseUrl;
      const result = await checkProviderConnection(
        meta.id,
        baseUrl,
        (meta.requiresApiKey || meta.id === 'custom') ? apiKey : undefined
      );

      if (result.available) {
        setTestResult('success');
        // 保存获取到的模型列表
        if (result.models && result.models.length > 0) {
          setAvailableModels(result.models);
          // 默认选择第一个模型
          if (!selectedModel && result.models[0]) {
            setSelectedModel(result.models[0]);
          }
        }
      } else {
        setTestResult('error');
        setTestError(result.error || t('provider.connectionFailed'));
      }
    } catch (err) {
      setTestResult('error');
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  // Test connection for llama.cpp
  const handleConnectLlamaCpp = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    setAvailableModels([]);

    try {
      // 先检测 GPU
      const info = await detectGpu();
      setGpuInfo(info);
      log.debug(`GPU detected: available=${info.available}, type=${info.gpuType}`);

      const result = await checkProviderConnection(meta.id, '', undefined);

      if (result.available) {
        setTestResult('success');
        if (result.models && result.models.length > 0) {
          setAvailableModels(result.models);
          if (!selectedModel && result.models[0]) {
            setSelectedModel(result.models[0]);
          }
        }
      } else {
        setTestResult('error');
        setTestError(result.error || t('provider.connectionFailed'));
      }
    } catch (err) {
      setTestResult('error');
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  // Refresh model list (for already configured providers)
  const handleRefreshModels = async () => {
    if (!apiKey.trim()) return;
    await loadModelsFromProvider();
  };

  // Save config
  const handleSave = async () => {
    // llama.cpp 使用本地文件扫描，不需要选择模型
    // ollama 和其他云端 provider 必须选择模型
    if (!isLlamaCpp && !selectedModel) {
      return;
    }

    setSaving(true);
    try {
      const instance: LlmProviderInstance = {
        metaId: meta.id,
        enabled: true,
        baseUrl: isLlamaCpp ? '' : meta.baseUrl,
        apiKey: isLlamaCpp ? undefined : apiKey || undefined,
        // llama.cpp 使用本地文件扫描，不需要保存 defaultModel
        // ollama 和其他云端 provider 需要保存用户选择的模型
        defaultModel: isLlamaCpp ? undefined : selectedModel,
        nGpuLayers: isLlamaCpp ? nGpuLayers : undefined,
        // contextLimit 只适用于 llama.cpp，ollama 自己管理上下文
        contextLimit: isLlamaCpp ? contextLimit : undefined,
      };

      await onSave(meta.id, instance);
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
                {t('provider.configureApi', { name: meta.label })}
              </h3>
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
            {/* Llama.cpp specific: GPU configuration */}
            {isLlamaCpp && (
              <>
                {/* GPU Configuration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('provider.gpuLayers')}
                  </label>
                  <div className="flex items-center gap-3">
                    <select
                      value={nGpuLayers}
                      onChange={(e) => setNGpuLayers(parseInt(e.target.value))}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    >
                      <option value={0}>{t('provider.gpuModeCpu')}</option>
                      <option value={-1}>{t('provider.gpuModeGpu')}</option>
                    </select>
                    {gpuInfo && (
                      <span className={`text-xs ${gpuInfo.available ? 'text-green-600' : 'text-gray-400'}`}>
                        {gpuInfo.available
                          ? `GPU: ${gpuInfo.gpuType.toUpperCase()}`
                          : t('provider.noGpuDetected')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Context Limit Configuration */}
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

                {/* Connection status */}
                {testResult && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${testResult === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
                    {testResult === 'success' ? (
                      <>
                        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm text-green-700">{t('provider.connectionSuccess')}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm text-red-700">{testError || t('provider.connectionFailed')}</span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* HTTP-based providers */}
            {!isLlamaCpp && (
              <>
                {/* API Key */}
                {(meta.requiresApiKey || meta.id === 'custom') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('provider.apiKey')}
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder={t('provider.apiKeyPlaceholder')}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    />
                    {apiKeyError && (
                      <p className="mt-1 text-xs text-red-500">{apiKeyError}</p>
                    )}
                  </div>
                )}

                {/* Loading state for auto-connect */}
                {(testing || autoConnecting) && !testResult && (
                  <div className="flex flex-col items-center justify-center py-8 space-y-3">
                    <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-600">{t('provider.connectingToOllama')}</p>
                  </div>
                )}

                {/* Empty state / Connection error for Ollama */}
                {isOllama && testResult === 'error' && !testing && !autoConnecting && (
                  <div className="flex flex-col items-center justify-center py-6 space-y-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-sm font-medium text-gray-700">{t('provider.cannotConnectOllama')}</p>
                      <p className="text-xs text-gray-500">{t('provider.ensureOllamaRunning')}</p>
                      <p className="text-xs text-gray-400">{meta.baseUrl}</p>
                    </div>
                    <button
                      onClick={handleConnect}
                      className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      {t('provider.retryConnect')}
                    </button>
                  </div>
                )}

                {/* Model selection - show after successful connection OR if already configured */}
                {testResult === 'success' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {t('provider.selectModel')}
                      </label>
                      {/* 已配置时显示刷新按钮 */}
                      {isConfigured && (
                        <button
                          onClick={handleRefreshModels}
                          disabled={testing}
                          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                        >
                          <svg className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {t('llmConfig.refreshModels')}
                        </button>
                      )}
                    </div>
                    {availableModels.length > 0 ? (
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
                    ) : (
                      <div className="text-sm text-gray-500 py-2">
                        {testing ? t('common.loading') : t('provider.noModelsFound')}
                      </div>
                    )}
                  </div>
                )}

                {/* Connection error for non-Ollama providers */}
                {!isOllama && testResult === 'error' && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50">
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-red-700">{testError || t('provider.connectionFailed')}</span>
                  </div>
                )}
              </>
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

            {/* Llama.cpp: Connect or Save button */}
            {isLlamaCpp && (
              <>
                {testResult !== 'success' ? (
                  <button
                    onClick={handleConnectLlamaCpp}
                    disabled={testing || saving}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing ? t('provider.connecting') : t('provider.connect')}
                  </button>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                )}
              </>
            )}

            {/* HTTP providers */}
            {!isLlamaCpp && (
              <>
                {/* 未配置：显示连接按钮 */}
                {!isConfigured && testResult !== 'success' && (
                  <button
                    onClick={handleConnect}
                    disabled={testing || (meta.requiresApiKey && !apiKey.trim())}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing ? t('provider.connecting') : t('provider.connect')}
                  </button>
                )}
                {/* 首次配置成功：显示保存并选择 */}
                {!isConfigured && testResult === 'success' && (
                  <button
                    onClick={handleSave}
                    disabled={saving || (!isLlamaCpp && !selectedModel)}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? t('common.saving') : t('provider.saveAndSelect')}
                  </button>
                )}
                {/* 已配置：显示保存 */}
                {isConfigured && (
                  <button
                    onClick={handleSave}
                    disabled={saving || (!isLlamaCpp && !selectedModel)}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}