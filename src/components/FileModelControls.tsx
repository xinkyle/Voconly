import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { AppConfig, Model, ProviderWithConfig } from '../types';
import { getFullModelId } from '../types';
import { getAsrModelList, loadConfig, parseModelId, saveConfig, QUANT_LABELS, type AsrModelWithStatus } from '../services/config';
import { invalidateAsrModelsCache, subscribeToDownloadComplete, type DownloadProgress } from '../services/downloader';
import { switchAsrModel, isModelLoaded } from '../services/whisper';
import { getProviderList } from '../services/llm';
import { listen } from '@tauri-apps/api/event';
import AsrModelSelectModal from './AsrModelSelectModal';
import ProviderPanel from './ProviderPanel';
import { useToast } from './ui/Toast';

const AsrIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

const LlmIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

export interface FileModelControlsProps {
  config: AppConfig | null;
  onConfigChange: (config: AppConfig) => void;
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
  onDownloadCancel?: (modelId: string) => void;
  onQuantPrefChange?: (modelId: string, quant: string) => void | Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  children?: ReactNode;
  aiEnabled?: boolean;
}

/** The same model selector and provider settings used elsewhere, hosted in the file page. */
export default function FileModelControls({
  config, onConfigChange, downloadStates, onDownload, onDownloadCancel,
  onQuantPrefChange, disabled = false, onBusyChange, children, aiEnabled = true,
}: FileModelControlsProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [models, setModels] = useState<AsrModelWithStatus[]>([]);
  const [modal, setModal] = useState<'asr' | 'provider' | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<ProviderWithConfig[]>([]);
  const [asrLoaded, setAsrLoaded] = useState(false);
  const [asrLoading, setAsrLoading] = useState(false);
  const asrId = config?.globalModelConfig.asrModel ? getFullModelId(config.globalModelConfig.asrModel) : '';
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyCallbackRef = useRef(onBusyChange);
  busyCallbackRef.current = onBusyChange;

  useEffect(() => {
    let active = true;
    getAsrModelList().then(value => { if (active) setModels(value); }).catch(console.error);
    getProviderList().then(value => { if (active) setProviders(value); }).catch(console.error);
    return () => { active = false; };
  }, [config?.globalModelConfig.llm.providerId, config?.globalModelConfig.llm.model]);

  useEffect(() => {
    let active = true;
    setAsrLoaded(false);
    setAsrLoading(false);
    if (asrId) isModelLoaded(asrId).then(loaded => { if (active) setAsrLoaded(loaded); }).catch(console.error);
    const subscriptions = [
      ...(['asr-model-loading', 'asr-model-loaded', 'asr-model-load-failed'] as const).map(event =>
        listen<{ modelId: string }>(event, ({ payload }) => {
          if (!active || payload.modelId !== asrId) return;
          setAsrLoading(event === 'asr-model-loading');
          setAsrLoaded(event === 'asr-model-loaded');
        })),
      listen<string[]>('asr-models-unloaded', ({ payload }) => {
        if (active && payload.includes(asrId)) { setAsrLoaded(false); setAsrLoading(false); }
      }),
    ];
    return () => {
      active = false;
      subscriptions.forEach(subscription => subscription.then(unlisten => unlisten()).catch(console.error));
    };
  }, [asrId]);

  useEffect(() => {
    if (modal !== 'asr') return;
    let active = true;
    const unsubscribe = subscribeToDownloadComplete(() => {
      getAsrModelList().then(list => {
        if (active) setModels(list);
      }).catch(error => {
        if (active) showToast({ type: 'error', title: t('common.error'), description: String(error) });
      });
    });
    return () => {
      active = false;
      unsubscribe.then(unlisten => unlisten()).catch(console.error);
    };
  }, [modal, showToast, t]);

  useEffect(() => {
    if (modal !== 'provider') return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      // A provider's own configuration overlay remains in charge while it is open.
      if (event.key === 'Escape' && !dialog?.querySelector('.fixed')) {
        event.preventDefault();
        setModal(null);
      }
      if (event.key === 'Tab' && dialog) {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        )).filter(element => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [modal]);

  const setWorking = (working: boolean) => {
    busyRef.current = working;
    setBusy(working);
    busyCallbackRef.current?.(working);
  };

  const openAsr = async () => {
    if (disabled || busyRef.current) return;
    setWorking(true);
    try {
      setModels(await getAsrModelList());
      setModal('asr');
    } catch (error) {
      showToast({ type: 'error', title: t('common.error'), description: String(error) });
    } finally {
      setWorking(false);
    }
  };

  const selectAsr = async (modelId: string) => {
    if (disabled || busyRef.current || !modelId) return;
    setWorking(true);
    setModal(null);
    try {
      // Load at the point of saving so provider edits made in this page are retained.
      const latest = await loadConfig();
      const oldId = latest.globalModelConfig.asrModel
        ? getFullModelId(latest.globalModelConfig.asrModel) : null;
      const { baseId, quant } = parseModelId(modelId);
      const next: AppConfig = {
        ...latest,
        globalModelConfig: {
          ...latest.globalModelConfig,
          asrModel: { modelId: baseId, quantization: quant },
        },
      };
      await saveConfig(next);
      onConfigChange(next);
      const result = await switchAsrModel(oldId, modelId);
      if (result.success) {
        showToast({ type: 'success', title: t('common.saved'), description: t('home.asrModelUpdated') });
      } else {
        await invalidateAsrModelsCache();
        // The app already handles memory errors with its existing dialog.
        if (!result.error?.includes('MEMORY_INSUFFICIENT')) {
          showToast({
            type: 'warning', title: t('modelConfig.modelFileNotFound'),
            description: t('modelConfig.modelFileNotFoundDesc'),
          });
        }
      }
    } catch (error) {
      showToast({ type: 'error', title: t('common.error'), description: String(error) });
    } finally {
      setWorking(false);
    }
  };

  const llmModel = config?.globalModelConfig.llm?.model;
  const { baseId, quant } = parseModelId(asrId);
  const model = models.find(item => item.preset.id.toLowerCase() === baseId.toLowerCase());
  const precision = quant || model?.preset.quant;
  const precisionName = precision ? (QUANT_LABELS[precision] ? t(`models.quantLabels.${QUANT_LABELS[precision]}`) : precision) : '';
  const asrName = asrId ? `${model?.preset.name || baseId}${precisionName ? ` (${precisionName})` : ''}` : t('home.noAsrModelSelected');
  const provider = providers.find(item => item.meta.id === config?.globalModelConfig.llm.providerId);
  const llmName = provider ? `${provider.meta.label}${llmModel ? ` - ${llmModel}` : ''}` : llmModel || t('home.noModelSelected');
  const buttonClass = 'inline-flex items-center gap-1.5 max-w-full sm:max-w-[280px] px-2 py-0.5 text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${buttonClass} bg-gray-100 border border-gray-200 text-gray-600`} disabled={disabled || busy || !config} onClick={openAsr}
          aria-label={`${t('file.ai.asrModel')}：${asrName}`}
          title={`${t('file.ai.asrModel')}：${asrName}\n${t('file.ai.sharedModels')}`}>
          <AsrIcon className="w-3 h-3 shrink-0 text-gray-800" />
          <span className="truncate">{asrName}</span>
          {asrLoading ? <span role="status" aria-label={t('common.loading')} className="inline-flex items-center gap-0.5">
            {[0, 1, 2].map(index => <span key={index} className="w-1 h-1 rounded-full bg-gray-500 animate-loading-dot" style={{ animationDelay: `${index * 200}ms` }} />)}
          </span> : asrId && <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${asrLoaded ? 'bg-emerald-500' : 'bg-gray-400'}`} />}
        </button>
        <button type="button" className={`${buttonClass} transition-all duration-200 ${aiEnabled ? 'bg-gray-100 border border-gray-200 text-gray-600' : 'bg-gray-50 border border-gray-100 text-gray-400'}`} disabled={disabled || busy || !config} onClick={() => setModal('provider')}
          aria-label={`${t('file.ai.aiService')}：${llmName}`}
          title={`${t('file.ai.aiService')}：${llmName}\n${t('file.ai.sharedModels')}`}>
          <LlmIcon className={`w-3 h-3 shrink-0 ${aiEnabled ? 'text-gray-800' : 'text-gray-400'}`} />
          <span className="truncate">{llmName}</span>
          {config?.globalModelConfig.llm.providerId && <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${aiEnabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />}
        </button>
        {children}
      </div>
      {modal === 'asr' && createPortal(
        <AsrModelSelectModal
          models={models}
          selectedModelId={asrId}
          onSelect={selectAsr}
          onClose={() => setModal(null)}
          downloadStates={downloadStates}
          onDownload={onDownload}
          onDownloadCancel={onDownloadCancel}
          currentLanguage={i18n.language}
          modelQuantPrefs={config?.modelQuantPrefs}
          onQuantPrefChange={onQuantPrefChange}
        />,
        document.body,
      )}
      {modal === 'provider' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('file.ai.aiService')}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex justify-end mb-2">
              <button type="button" onClick={() => setModal(null)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100">
                {t('common.close')}
              </button>
            </div>
            <ProviderPanel onConfigChange={onConfigChange} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
