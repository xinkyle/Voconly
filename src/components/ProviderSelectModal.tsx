import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderWithConfig, LlmProviderInstance } from '../types';
import { getProviderList, saveProviderConfig } from '../services/llm';
import { createLogger } from '../services/log';
import ProviderConfigModal from './ProviderConfigModal';

const log = createLogger('ProviderSelectModal');

interface ProviderSelectModalProps {
  /** Current selected provider ID */
  selectedProviderId?: string;
  /** Callback when a provider is selected */
  onSelect: (providerId: string, instance: LlmProviderInstance) => void;
  /** Callback to close the modal */
  onClose: () => void;
}

export default function ProviderSelectModal({
  selectedProviderId,
  onSelect,
  onClose,
}: ProviderSelectModalProps) {
  const { t } = useTranslation();
  // Provider list state
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Config modal state
  const [configProvider, setConfigProvider] = useState<ProviderWithConfig | null>(null);

  // Load provider list
  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const list = await getProviderList();
      setProviders(list);
      log.debug(`Loaded ${list.length} providers`);
    } catch (err) {
      log.error(`Failed to load providers: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle save provider config
  const handleSaveProvider = async (providerId: string, instance: LlmProviderInstance) => {
    try {
      await saveProviderConfig(providerId, instance);
      // Refresh provider list
      await loadProviders();
      setConfigProvider(null);
      // Auto-select the newly configured provider
      onSelect(providerId, instance);
    } catch (err) {
      log.error(`Failed to save provider config: ${err}`);
      throw err;
    }
  };

  // Handle provider card click
  const handleProviderClick = (provider: ProviderWithConfig) => {
    if (provider.instance && provider.instance.enabled) {
      // Already configured - select it
      onSelect(provider.meta.id, provider.instance);
    } else {
      // Not configured - open config modal
      setConfigProvider(provider);
    }
  };

  // Separate providers into configured and not configured
  const configuredProviders = useMemo(() =>
    providers.filter(p => p.instance && p.instance.enabled),
    [providers]
  );

  const unconfiguredProviders = useMemo(() => {
    const popular = providers.filter(p => !p.instance && p.meta.popular);
    const more = providers.filter(p => !p.instance && !p.meta.popular);
    return [...popular, ...more];
  }, [providers]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl p-6">
          <div className="text-gray-500">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">{t('provider.selectProvider')}</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Configured providers */}
            {configuredProviders.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">{t('provider.configuredClickSelect')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {configuredProviders.map((provider) => {
                    const isSelected = provider.meta.id === selectedProviderId;
                    return (
                      <ProviderCard
                        key={provider.meta.id}
                        provider={provider}
                        selected={isSelected}
                        onClick={() => handleProviderClick(provider)}
                        onEdit={() => setConfigProvider(provider)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unconfigured providers */}
            {unconfiguredProviders.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  {configuredProviders.length > 0 ? t('provider.otherClickConfig') : t('provider.clickToConfig')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {unconfiguredProviders.map((provider) => (
                    <ProviderCard
                      key={provider.meta.id}
                      provider={provider}
                      selected={false}
                      onClick={() => handleProviderClick(provider)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {providers.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {t('provider.noProviderFound')}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>

      {/* Provider config modal */}
      {configProvider && (
        <ProviderConfigModal
          provider={configProvider}
          onClose={() => setConfigProvider(null)}
          onSave={handleSaveProvider}
        />
      )}
    </>
  );
}

// Provider card component
interface ProviderCardProps {
  provider: ProviderWithConfig;
  selected: boolean;
  onClick: () => void;
  onEdit?: () => void;
}

function ProviderCard({ provider, selected, onClick, onEdit }: ProviderCardProps) {
  const configured = provider.instance && provider.instance.enabled;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();  // 阻止触发 onClick
    onEdit?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`relative px-3 py-2 rounded-lg border transition-all duration-200 text-left w-full cursor-pointer ${
        selected
          ? 'border-emerald-400 bg-emerald-50 shadow-sm ring-1 ring-emerald-400'
          : configured
            ? 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:shadow-sm'
            : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Selected indicator - green checkmark */}
      {selected && (
        <div className="absolute top-1.5 right-1.5">
          <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* Edit button - only for configured providers */}
      {configured && onEdit && (
        <button
          onClick={handleEditClick}
          className={`absolute top-1.5 p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors ${
            selected ? 'right-6' : 'right-1.5'
          }`}
          title="编辑配置"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}

      {/* Label */}
      <div className={`font-medium text-gray-900 text-sm ${
        configured && onEdit
          ? (selected ? 'pr-12' : 'pr-8')
          : ''
      }`}>
        {provider.meta.id === 'llama_cpp' ? 'Llama.cpp (本地大语言模型专用)' : provider.meta.label}
      </div>

      {/* Description - only for unconfigured providers */}
      {!configured && provider.meta.description && (
        <p className="text-xs text-gray-400 mt-0.5 truncate">{provider.meta.description}</p>
      )}
    </div>
  );
}