import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderWithConfig, GlobalModelConfig, AppConfig } from '../types';
import { getProviderList, saveProviderConfig } from '../services/llm';
import { loadConfig, saveConfig } from '../services/config';
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
};

// Get provider logo path
const getProviderLogo = (providerId: string): string | null => {
  const logoFile = PROVIDER_LOGO_MAP[providerId];
  if (logoFile) {
    return `/icons/${logoFile}`;
  }
  return null;
};

// Cloud Provider Card Component
interface CloudProviderCardProps {
  provider: ProviderWithConfig;
  isSelected: boolean;
  onSelect: () => void;
  onConfigure: () => void;
  onEdit: () => void;
  t: (key: string) => string;
}

function CloudProviderCard({ provider, isSelected, onSelect, onConfigure, onEdit, t }: CloudProviderCardProps) {
  const isConfigured = provider.instance?.enabled ?? false;
  const logoPath = getProviderLogo(provider.meta.id);

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-xl border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-gray-700 bg-gray-100'
          : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
      }`}
    >
      <div className="px-3 py-1">
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
                {provider.meta.label}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{provider.meta.description}</p>
            </div>
          </div>

          <div className="flex-shrink-0">
            <div className="flex items-center gap-2">
              {/* 选中状态显示勾选图标 */}
              {isSelected && (
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {/* 已配置显示编辑按钮 */}
              {isConfigured && (
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
              )}
              {/* 未配置显示配置按钮 */}
              {!isConfigured && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfigure();
                  }}
                  className="px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  {t('models.setup')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProviderPanelProps {
  /** Callback when config changes (e.g., provider selection) */
  onConfigChange?: (config: AppConfig) => void;
}

export default function ProviderPanel({ onConfigChange }: ProviderPanelProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [globalModelConfig, setGlobalModelConfig] = useState<GlobalModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithConfig | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);

  // Load providers and global config
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [providerResult, configResult] = await Promise.all([
          getProviderList(),
          loadConfig(),
        ]);
        setProviders(providerResult);
        setGlobalModelConfig(configResult.globalModelConfig || null);
        log.info(`Loaded ${providerResult.length} providers, current provider: ${configResult.globalModelConfig?.llm?.providerId}`);
      } catch (err) {
        log.error(`Failed to load providers: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Handle provider selection - check if configured first
  const handleProviderSelect = async (providerId: string) => {
    const provider = providers.find(p => p.meta.id === providerId);

    // If provider is not configured, open config modal instead
    if (!provider?.instance?.enabled) {
      handleProviderConfigure(providerId);
      return;
    }

    // Provider is configured - set as active provider
    try {
      const config = await loadConfig();
      const model = provider?.instance?.defaultModel || '';

      const newConfig = {
        ...config,
        globalModelConfig: {
          ...config.globalModelConfig,
          llm: {
            ...config.globalModelConfig.llm,
            providerId,
            model,
          },
        },
      };
      await saveConfig(newConfig);
      setGlobalModelConfig(newConfig.globalModelConfig);
      // Notify parent component
      onConfigChange?.(newConfig);

      showToast({
        type: 'success',
        title: t('modelConfig.providerSelected'),
        description: provider?.meta.label || providerId,
      });
    } catch (err) {
      log.error(`Failed to select provider: ${err}`);
      showToast({
        type: 'error',
        title: t('common.error'),
      });
    }
  };

  // Open config modal
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Cloud providers (excluding siliconflow) */}
        {providers
          .filter((provider) => provider.meta.id !== 'siliconflow')
          .map((provider) => (
            <CloudProviderCard
              key={provider.meta.id}
              provider={provider}
              isSelected={globalModelConfig?.llm?.providerId === provider.meta.id}
              onSelect={() => handleProviderSelect(provider.meta.id)}
              onConfigure={() => handleProviderConfigure(provider.meta.id)}
              onEdit={() => handleProviderConfigure(provider.meta.id)}
              t={t}
            />
          ))}
      </div>

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
            // Update global config with the new provider and its default model
            const config = await loadConfig();
            const newConfig = {
              ...config,
              globalModelConfig: {
                ...config.globalModelConfig,
                llm: {
                  ...config.globalModelConfig.llm,
                  providerId,
                  model: instance.defaultModel || '',
                },
              },
            };
            await saveConfig(newConfig);
            setGlobalModelConfig(newConfig.globalModelConfig);
            // Notify parent component
            onConfigChange?.(newConfig);
            showToast({
              type: 'success',
              title: t('modelConfig.providerSaved'),
              description: selectedProvider.meta.label,
            });
          }}
        />
      )}
    </div>
  );
}