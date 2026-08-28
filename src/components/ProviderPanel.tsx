import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderWithConfig } from '../types';
import { getProviderList, saveProviderConfig, deleteProviderConfig } from '../services/llm';
import { createLogger } from '../services/log';
import ProviderConfigModal from './ProviderConfigModal';
import { useToast } from './ui/Toast';

const log = createLogger('ProviderPanel');

// Provider logo mapping (meta.id -> icon file name)
const PROVIDER_LOGO_MAP: Record<string, string> = {
  ollama: 'ollama.png',
  openai: 'openai.png',
  deepseek: 'deepseek.png',
  gemini: 'gemini.png',
  glm: 'zhipu.png',
  minimax: 'minimax.png',
  kimi: 'kimi.png',
  qwen: 'qwen.png',
  claude: 'anthropic.png',
  groq: 'groq.png',
  openrouter: 'openrouter.png',
  cerebras: 'cerebras.png',
  siliconflow: 'siliconflow.png',
  yi: 'yi.png',
  custom: 'custom.png',
  llama_cpp: 'llamacpp.png',
};

// Get provider logo path
const getProviderLogo = (providerId: string): string | null => {
  const logoFile = PROVIDER_LOGO_MAP[providerId];
  if (logoFile) {
    return `/icons/${logoFile}`;
  }
  return null;
};

// Icons
const CheckIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

// Cloud Provider Card Component
interface CloudProviderCardProps {
  provider: ProviderWithConfig;
  onConfigure: () => void;
  onEdit: () => void;
  t: (key: string) => string;
}

function CloudProviderCard({ provider, onConfigure, onEdit, t }: CloudProviderCardProps) {
  const isConfigured = provider.instance?.enabled ?? false;
  const logoPath = getProviderLogo(provider.meta.id);

  return (
    <div
      onClick={onConfigure}
      className={`group relative rounded-xl border transition-all duration-200 cursor-pointer ${
        isConfigured
          ? 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-6">
            {logoPath && (
              <img
                src={logoPath}
                alt={provider.meta.label}
                className="w-5 h-5 object-contain flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-gray-800 truncate">
                {provider.meta.id === 'llama_cpp' ? t('provider.llamaCppLabel') : provider.meta.label}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{provider.meta.description}</p>
            </div>
          </div>

          <div className="flex-shrink-0">
            {isConfigured ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-600 rounded-lg border border-emerald-200 hover:bg-emerald-200 transition-colors"
                >
                  <CheckIcon className="w-3 h-3" />
                  <span className="text-xs font-medium">{t('models.configured')}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title={t('common.edit')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg group-hover:bg-amber-100 transition-colors">
                {t('models.setup')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProviderPanel() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithConfig | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);

  // Load providers
  useEffect(() => {
    const loadProviders = async () => {
      setLoading(true);
      try {
        const providerResult = await getProviderList();
        setProviders(providerResult);
        log.info(`Loaded ${providerResult.length} providers`);
      } catch (err) {
        log.error(`Failed to load providers: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    loadProviders();
  }, []);

  const handleProviderConfigure = (providerId: string) => {
    const provider = providers.find((p) => p.meta.id === providerId);
    if (provider) {
      setSelectedProvider(provider);
      setShowProviderModal(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-gray-500">{t('models.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] space-y-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('modelConfig.llmProvidersTitle')}</h1>
        <p className="text-sm text-gray-600">{t('modelConfig.llmProvidersSubtitle')}</p>
      </div>

      {/* Provider List */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Local LLM (llama_cpp) first */}
            {providers
              .filter((provider) => provider.meta.id === 'llama_cpp')
              .map((provider) => (
                <CloudProviderCard
                  key={provider.meta.id}
                  provider={provider}
                  onConfigure={() => handleProviderConfigure(provider.meta.id)}
                  onEdit={() => handleProviderConfigure(provider.meta.id)}
                  t={t}
                />
              ))}

            {/* Cloud providers */}
            {providers
              .filter((provider) => provider.meta.id !== 'llama_cpp')
              .map((provider) => (
                <CloudProviderCard
                  key={provider.meta.id}
                  provider={provider}
                  onConfigure={() => handleProviderConfigure(provider.meta.id)}
                  onEdit={() => handleProviderConfigure(provider.meta.id)}
                  t={t}
                />
              ))}
          </div>
        </div>
      </section>

      {/* Provider Config Modal */}
      {showProviderModal && selectedProvider && (
        <ProviderConfigModal
          provider={selectedProvider}
          onClose={() => {
            setShowProviderModal(false);
            setSelectedProvider(null);
          }}
          onSave={async (providerId, instance) => {
            await saveProviderConfig(providerId, instance);
            const list = await getProviderList();
            setProviders(list);
            setShowProviderModal(false);
            setSelectedProvider(null);
            showToast({
              type: 'success',
              title: t('modelConfig.providerSaved'),
              description: selectedProvider.meta.label,
            });
          }}
          onDelete={async (providerId) => {
            await deleteProviderConfig(providerId);
            const list = await getProviderList();
            setProviders(list);
            setShowProviderModal(false);
            setSelectedProvider(null);
            showToast({
              type: 'info',
              title: t('modelConfig.providerDeleted'),
              description: selectedProvider.meta.label,
            });
          }}
        />
      )}
    </div>
  );
}