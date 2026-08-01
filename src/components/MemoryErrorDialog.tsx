import { useTranslation } from 'react-i18next';

interface MemoryErrorDialogProps {
  visible: boolean;
  modelName: string;
  requiredMemory: string;
  availableMemory: string;
  onClose: () => void;
}

export default function MemoryErrorDialog({
  visible,
  modelName,
  requiredMemory,
  availableMemory,
  onClose,
}: MemoryErrorDialogProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[400px]">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h3 className="text-base font-semibold text-gray-900 text-center mb-2">
          {t('memory.insufficientTitle', '内存空间不足')}
        </h3>
        <div className="text-sm text-gray-600 text-center mb-6 space-y-1">
          <p>
            {t('memory.modelRequires', { name: modelName, memory: requiredMemory })}
          </p>
          <p>
            {t('memory.systemAvailable', { memory: availableMemory })}
          </p>
          <p className="text-amber-600 text-xs mt-2">
            {t('memory.releaseMemoryHint', '请关闭其他应用释放内存后重试')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
        >
          {t('common.ok', '知道了')}
        </button>
      </div>
    </div>
  );
}
