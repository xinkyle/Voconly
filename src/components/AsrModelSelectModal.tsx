import { useTranslation } from 'react-i18next';
import type { Model } from '../types';
import type { AsrModelWithStatus } from '../services/config';
import type { DownloadProgress } from '../services/downloader';
import AsrModelList from './AsrModelList';

// Recommended models for different languages
const ZH_RECOMMENDED_MODELS: Set<string> = new Set([
  'Qwen3-ASR-1.7B',
  'qwen3-asr-1.7b',
  'sensevoice-small',
  'SenseVoice-Small',
]);

const EN_RECOMMENDED_MODELS: Set<string> = new Set([
  'parakeet-unified-en-0.6b',
  'Parakeet-Unified-EN-0.6B',
  'cohere-transcribe-03-2026',
  'Cohere-Transcribe-03-2026',
]);

/**
 * Sort models by: 1) downloaded first, 2) recommended first, 3) name alphabetically
 * This ensures stable ordering across sessions.
 */
export function sortAsrModels(
  models: AsrModelWithStatus[],
  currentLanguage: string
): AsrModelWithStatus[] {
  const isZhLanguage = currentLanguage.startsWith('zh');
  const recommendedModels = isZhLanguage ? ZH_RECOMMENDED_MODELS : EN_RECOMMENDED_MODELS;

  return [...models].sort((a, b) => {
    // 1. Downloaded models first
    if (a.downloaded && !b.downloaded) return -1;
    if (!a.downloaded && b.downloaded) return 1;

    // 2. Recommended models first (within same download status)
    const aRecommended = recommendedModels.has(a.preset.id);
    const bRecommended = recommendedModels.has(b.preset.id);
    if (aRecommended && !bRecommended) return -1;
    if (!aRecommended && bRecommended) return 1;

    // 3. Sort by name alphabetically (stable)
    return a.preset.name.localeCompare(b.preset.name, undefined, { sensitivity: 'base' });
  });
}

export interface AsrModelSelectModalProps {
  /** ASR model list with status */
  models: AsrModelWithStatus[];
  /** Currently selected model ID (may include quantization suffix) */
  selectedModelId: string;
  /** Callback when a model is selected */
  onSelect: (modelId: string) => void;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Download states for models */
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  /** Callback to start downloading a model */
  onDownload?: (model: Model) => void;
  /** Callback to cancel a model download */
  onDownloadCancel?: (modelId: string) => void;
  /** Current language for recommendation (defaults to i18n.language) */
  currentLanguage?: string;
  /** User's quantization preferences for each model */
  modelQuantPrefs?: Record<string, string>;
  /** Callback when user selects a quantization version */
  onQuantPrefChange?: (modelId: string, quant: string) => void | Promise<void>;
}

/**
 * ASR Model Selection Modal
 *
 * A modal component for selecting ASR models with support for:
 * - Model download status display
 * - Quantization version selection
 * - Progress indicators for downloads
 * - Language-based model recommendations
 */
function AsrModelSelectModal({
  models,
  selectedModelId,
  onSelect,
  onClose,
  downloadStates,
  onDownload,
  onDownloadCancel,
  currentLanguage,
  modelQuantPrefs,
  onQuantPrefChange,
}: AsrModelSelectModalProps) {
  const { t, i18n } = useTranslation();

  // Use provided language or fall back to i18n language
  const activeLanguage = currentLanguage || i18n.language;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-[720px] h-[85vh] overflow-hidden shadow-2xl animate-fade-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h4 className="font-semibold text-gray-900 text-lg">{t('sceneList.selectModel')}</h4>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
          <AsrModelList
            models={models}
            downloadStates={downloadStates}
            onDownload={onDownload}
            onDownloadCancel={onDownloadCancel}
            currentLanguage={activeLanguage}
            modelQuantPrefs={modelQuantPrefs}
            onQuantPrefChange={onQuantPrefChange}
            selectedModelId={selectedModelId}
            onSelect={onSelect}
            onClose={onClose}
            layout="single"
          />
        </div>
      </div>
    </div>
  );
}

export default AsrModelSelectModal;