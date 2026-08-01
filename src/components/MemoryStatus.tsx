import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getMemoryStatus } from '../services/whisper';
import { createLogger } from '../services/log';

const log = createLogger('MemoryStatus');

// Memory icon (chip/memory style)
const MemoryIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
);

// Chevron down icon
const ChevronDownIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
  </svg>
);

interface MemoryStatusData {
  asrModels: Array<{
    modelId: string;
    backendType: string;
    memoryMb: number;
    sizeMb: number;
    loadedAtSecs: number;
    lastUsedSecs: number;
  }>;
  llmModel: {
    name: string;
    sizeMb: number;
  } | null;
  totalMemoryMb: number;
}

export default function MemoryStatus() {
  const { t } = useTranslation();
  const [memoryData, setMemoryData] = useState<MemoryStatusData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMemoryStatus = useCallback(async () => {
    try {
      const data = await getMemoryStatus();
      setMemoryData(data);
    } catch (e) {
      log.error(`Failed to fetch memory status: ${e}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemoryStatus();
    // Refresh every 5 seconds
    const interval = setInterval(fetchMemoryStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchMemoryStatus]);

  // Format bytes to human readable
  const formatMemory = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)}GB`;
    }
    return `${mb}MB`;
  };

  if (isLoading) {
    return (
      <div className="mb-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-32" />
      </div>
    );
  }

  if (!memoryData) {
    return null;
  }

  const { asrModels, llmModel } = memoryData;

  if (asrModels.length === 0 && !llmModel) {
    return null;
  }

  return (
    <div className="mb-4 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden transition-all duration-300">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100/50 transition-colors"
      >
        <div className="p-1.5 bg-gray-200 rounded-lg text-gray-600">
          <MemoryIcon />
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            {t('memoryStatus.title', 'Resident Models in Memory')}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {asrModels.length + (llmModel ? 1 : 0)} {t('memoryStatus.modelCount', '')}
          </span>
        </div>

        <ChevronDownIcon
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* ASR Models */}
          {asrModels.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                {t('memoryStatus.asrModels', '语音模型 (ASR)')}
                <span className="ml-1 text-gray-400 normal-case">
                  · {t('memoryStatus.multiResident', '可同时常驻')}
                </span>
              </h4>
              <div className="space-y-1.5">
                {asrModels.map((model) => (
                  <div
                    key={model.modelId}
                    className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {model.modelId}
                      </span>
                      <span className="text-xs text-gray-400">
                        {model.backendType}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {formatMemory(model.sizeMb || model.memoryMb)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LLM Model */}
          {llmModel ? (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                {t('memoryStatus.llmModel', '大语言模型 (LLM)')}
                <span className="ml-1 text-gray-400 normal-case">
                  · {t('memoryStatus.singleResident', '仅保留最近一个')}
                </span>
              </h4>
              <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-gray-100">
                <span className="text-sm font-medium text-gray-700">
                  {llmModel.name}
                </span>
                <span className="text-sm text-gray-500">
                  {formatMemory(llmModel.sizeMb)}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                {t('memoryStatus.llmModel', '大语言模型 (LLM)')}
              </h4>
              <div className="px-3 py-2 bg-gray-100 rounded-lg border border-gray-100">
                <span className="text-sm text-gray-400">
                  {t('memoryStatus.llmNotLoaded', '模型未加载（首次使用后显示）')}
                </span>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="mt-3 text-xs text-gray-400">
            {t('memoryStatus.sizeNote', '该大小为模型文件大小，与内存实际占用不完全匹配')}
          </div>
        </div>
      )}
    </div>
  );
}
