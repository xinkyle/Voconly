import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LlmProviderInstance, ProviderWithConfig, GpuInfo } from '../types';
import {
  checkProviderConnection,
  detectGpu,
} from '../services/llm';
import { createLogger } from '../services/log';

const log = createLogger('ProviderConfigModal');

interface ProviderConfigModalProps {
  provider: ProviderWithConfig;
  onClose: () => void;
  onSave: (providerId: string, instance: LlmProviderInstance) => Promise<void>;
  onDelete: (providerId: string) => Promise<void>;
}

export default function ProviderConfigModal({
  provider,
  onClose,
  onSave,
  onDelete,
}: ProviderConfigModalProps) {
  const { t } = useTranslation();
  const meta = provider.meta;
  const existingInstance = provider.instance;
  const isLlamaCpp = meta.id === 'llama_cpp';

  // Form state (for HTTP-based providers)
  const [baseUrl, setBaseUrl] = useState(existingInstance?.baseUrl || meta.baseUrl);
  const [apiKey, setApiKey] = useState(existingInstance?.apiKey || '');
  const [enabled, setEnabled] = useState(existingInstance?.enabled ?? true);

  // GPU configuration state
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  // 初始化：用户已配置则用用户值，否则先用临时值等待 GPU 检测
  const [nGpuLayers, setNGpuLayers] = useState<number>(
    existingInstance?.nGpuLayers ?? -999  // -999 表示"待检测"
  );

  // Context limit state（本地 Provider 配置）
  const isLocalProvider = isLlamaCpp || meta.id === 'ollama';
  const [contextLimit, setContextLimit] = useState<number>(
    existingInstance?.contextLimit ?? 4096
  );

  // UI state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // API key validation error
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // GPU layers 实际显示值（-999 表示检测中，显示 -1 作为临时值）
  const effectiveGpuLayers = nGpuLayers === -999 ? -1 : nGpuLayers;
  const isGpuDetecting = nGpuLayers === -999;

  // Load GPU info for llama.cpp
  useEffect(() => {
    if (isLlamaCpp) {
      loadGpuInfo();
    }
  }, [isLlamaCpp]);

  // For HTTP-based providers: auto-test connection if already configured
  useEffect(() => {
    if (!isLlamaCpp && existingInstance?.enabled && existingInstance.baseUrl) {
      const autoTestConnection = async () => {
        setTesting(true);
        try {
          const result = await checkProviderConnection(
            meta.id,
            existingInstance.baseUrl,
            meta.requiresApiKey ? existingInstance.apiKey : undefined
          );
          if (result.available) {
            setTestResult('success');
          } else {
            setTestResult(null);
          }
        } catch (err) {
          log.error(`Auto-test connection failed: ${err}`);
          setTestResult(null);
        } finally {
          setTesting(false);
        }
      };
      autoTestConnection();
    }
  }, [isLlamaCpp, existingInstance, meta.id, meta.requiresApiKey]);

  const loadGpuInfo = async () => {
    try {
      const info = await detectGpu();
      setGpuInfo(info);
      log.debug(`GPU detected: available=${info.available}, type=${info.gpuType}`);

      if (existingInstance?.nGpuLayers === undefined || existingInstance?.nGpuLayers === null) {
        setNGpuLayers(-1);
        log.debug(`Auto-set GPU layers to -1 (try GPU first)`);
      }
    } catch (err) {
      log.error(`Failed to detect GPU: ${err}`);
      if (existingInstance?.nGpuLayers === undefined || existingInstance?.nGpuLayers === null) {
        setNGpuLayers(-1);
        log.debug(`GPU detection failed, defaulting to -1 (try GPU)`);
      }
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
    const error = validateApiKey(value);
    setApiKeyError(error);
  };

  // Handle base URL change
  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    setTestResult(null);
    setTestError(null);
  };

  // Test connection (for HTTP-based providers)
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const result = await checkProviderConnection(
        meta.id,
        baseUrl,
        (meta.requiresApiKey || meta.id === 'custom') ? apiKey : undefined
      );

      if (result.available) {
        setTestResult('success');
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
  const handleTestLlamaCpp = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const result = await checkProviderConnection(meta.id, '', undefined);

      if (result.available) {
        setTestResult('success');
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

  // Save config
  const handleSave = async () => {
    // Validate
    if (!isLlamaCpp && meta.requiresApiKey && !apiKey.trim()) {
      setApiKeyError(t('provider.apiKeyRequired'));
      return;
    }

    if (apiKeyError) {
      return;
    }

    setSaving(true);
    try {
      const instance: LlmProviderInstance = {
        metaId: meta.id,
        enabled,
        baseUrl: isLlamaCpp ? '' : baseUrl,
        apiKey: isLlamaCpp ? undefined : apiKey || undefined,
        defaultModel: undefined,
        nGpuLayers: isLlamaCpp ? (nGpuLayers === -999 ? -1 : nGpuLayers) : undefined,
        contextLimit: isLocalProvider ? contextLimit : undefined,
      };

      await onSave(meta.id, instance);
    } catch (err) {
      log.error(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Delete config
  const handleDelete = async () => {
    if (!existingInstance) return;

    if (!confirm(t('provider.confirmDelete', { name: meta.label }))) {
      return;
    }

    setDeleting(true);
    try {
      await onDelete(meta.id);
    } catch (err) {
      log.error(`Failed to delete: ${err}`);
    } finally {
      setDeleting(false);
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
                {t('provider.configure', { name: meta.label })}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">{meta.description}</p>
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
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Llama.cpp specific: GPU configuration only */}
            {isLlamaCpp && (
              <>
                {/* GPU Configuration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('provider.gpuLayers')}
                  </label>
                  <div className="flex items-center gap-3">
                    <select
                      value={effectiveGpuLayers}
                      onChange={(e) => setNGpuLayers(parseInt(e.target.value))}
                      disabled={isGpuDetecting}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent disabled:opacity-50"
                    >
                      <option value={0}>{t('provider.gpuModeCpu')}</option>
                      <option value={-1}>{t('provider.gpuModeGpu')}</option>
                    </select>
                    {isGpuDetecting && (
                      <span className="text-xs text-gray-400">{t('provider.detectingGpu')}</span>
                    )}
                    {gpuInfo && (
                      <span className={`text-xs ${gpuInfo.available ? 'text-green-600' : 'text-gray-400'}`}>
                        {gpuInfo.available
                          ? `GPU: ${gpuInfo.gpuType.toUpperCase()}`
                          : t('provider.noGpuDetected')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {effectiveGpuLayers === 0
                      ? t('provider.gpuModeCpuDesc')
                      : t('provider.gpuModeAllDesc')}
                  </p>
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
                  <p className="mt-1 text-xs text-gray-500">
                    {t('provider.contextLimitDesc')}
                  </p>
                </div>

                {/* Test connection button for llama.cpp */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestLlamaCpp}
                    disabled={testing}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing ? t('provider.testing') : t('provider.checkModels')}
                  </button>

                  {testResult === 'success' && (
                    <span className="text-sm text-green-600 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {t('provider.connectionSuccess')}
                    </span>
                  )}
                  {testResult === 'error' && (
                    <span className="text-sm text-red-600 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {testError || t('provider.connectionFailed')}
                    </span>
                  )}
                </div>
              </>
            )}

            {/* HTTP-based providers: Base URL */}
            {!isLlamaCpp && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('provider.apiAddress')}
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    disabled={!meta.allowBaseUrlEdit}
                    placeholder={meta.baseUrl}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {!meta.allowBaseUrlEdit && (
                    <p className="mt-1 text-xs text-gray-400">{t('provider.apiAddressNotEditable')}</p>
                  )}
                </div>

                {/* API Key */}
                {(meta.requiresApiKey || meta.id === 'custom') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {meta.requiresApiKey ? t('provider.apiKey') : t('provider.apiKeyOptional')}
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
                    {!meta.requiresApiKey && (
                      <p className="mt-1 text-xs text-gray-400">{t('provider.apiKeyOptionalDesc')}</p>
                    )}
                  </div>
                )}

                {/* Context Limit for Ollama */}
                {meta.id === 'ollama' && (
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
                    <p className="mt-1 text-xs text-gray-500">
                      {t('provider.contextLimitDesc')}
                    </p>
                  </div>
                )}

                {/* Test connection */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing || !baseUrl || (meta.requiresApiKey && !apiKey)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing ? t('provider.testing') : t('provider.testConnection')}
                  </button>

                  {/* Test result */}
                  {testResult === 'success' && (
                    <span className="text-sm text-green-600 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {t('provider.connectionSuccess')}
                    </span>
                  )}
                  {testResult === 'error' && (
                    <span className="text-sm text-red-600 flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {testError || t('provider.connectionFailed')}
                    </span>
                  )}
                </div>
              </>
            )}

            {/* Enable toggle */}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-gray-700">{t('provider.enableProvider')}</span>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
            {/* Delete button */}
            {existingInstance && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
              >
                {deleting ? t('common.deleting') : t('provider.deleteConfig')}
              </button>
            )}

            {/* Right side buttons */}
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!isLlamaCpp && meta.requiresApiKey && !apiKey.trim())}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}