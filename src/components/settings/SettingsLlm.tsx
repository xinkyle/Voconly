import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, LlmProviderInstance, ProviderWithConfig } from '../../types';
import { getProviderList, saveProviderConfig } from '../../services/llm';
import { createLogger } from '../../services/log';
import ProviderConfigModal from '../ProviderConfigModal';

// 创建日志记录器
const log = createLogger('SettingsLlm');

interface SettingsLlmProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function SettingsLlm({ config: _config, onSave: _onSave }: SettingsLlmProps) {
  const { t } = useTranslation();
  // Provider list state
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Modal state
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithConfig | null>(null);
  const [showModal, setShowModal] = useState(false);

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

  // Handle provider card click
  const handleProviderClick = (provider: ProviderWithConfig) => {
    setSelectedProvider(provider);
    setShowModal(true);
  };

  // Handle save provider config
  const handleSaveProvider = async (providerId: string, instance: LlmProviderInstance) => {
    try {
      await saveProviderConfig(providerId, instance);
      // Refresh provider list
      await loadProviders();
      setShowModal(false);
      setSelectedProvider(null);
    } catch (err) {
      log.error(`Failed to save provider config: ${err}`);
      throw err;
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
    return showAll ? [...popular, ...more] : popular;
  }, [providers, showAll]);

  const hasMoreProviders = useMemo(() =>
    providers.filter(p => !p.instance && !p.meta.popular).length > 0,
    [providers]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('settings.llm.loading')}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{t('settings.llm.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('settings.llm.subtitle')}</p>
      </div>

      {/* Provider list */}
      <div className="space-y-6">
        {/* Configured providers */}
        {configuredProviders.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('settings.llm.configuredProviders')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {configuredProviders.map((provider) => (
                <ProviderCard
                  key={provider.meta.id}
                  provider={provider}
                  configured={true}
                  onClick={() => handleProviderClick(provider)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Other providers */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {configuredProviders.length > 0 ? t('settings.llm.otherProviders') : t('settings.llm.selectProvider')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {unconfiguredProviders.map((provider) => (
              <ProviderCard
                key={provider.meta.id}
                provider={provider}
                configured={false}
                onClick={() => handleProviderClick(provider)}
              />
            ))}
          </div>

          {/* Show more button */}
          {!showAll && hasMoreProviders && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-3 text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              {t('settings.llm.showMore')}
            </button>
          )}
        </div>

        {/* Info card */}
        <div className="p-4 bg-gray-100 border border-gray-200 rounded-xl">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-700">
                {t('settings.llm.infoTip')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Provider config modal */}
      {showModal && selectedProvider && (
        <ProviderConfigModal
          provider={selectedProvider}
          onClose={() => {
            setShowModal(false);
            setSelectedProvider(null);
          }}
          onSave={handleSaveProvider}
        />
      )}
    </div>
  );
}

// Provider card component
interface ProviderCardProps {
  provider: ProviderWithConfig;
  configured: boolean;
  onClick: () => void;
}

function ProviderCard({ provider, configured, onClick }: ProviderCardProps) {
  return (
    <button
      onClick={onClick}
      className={`relative px-3 py-2 rounded-lg border transition-all duration-200 text-left ${
        configured
          ? 'bg-gray-50 border-gray-300 hover:border-gray-400 hover:shadow-sm'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Label */}
      <div className="font-semibold text-gray-900 text-sm">{provider.meta.label}</div>

      {/* Configured badge */}
      {configured && (
        <div className="absolute top-1.5 right-1.5">
          <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </button>
  );
}