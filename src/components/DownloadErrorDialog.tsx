import { useTranslation } from 'react-i18next';

interface DownloadErrorDialogProps {
  visible: boolean;
  modelName: string;
  onRetry: () => void;
  onSelectOther: () => void;
  onClose: () => void;
}

export default function DownloadErrorDialog({
  visible,
  modelName,
  onRetry,
  onSelectOther,
  onClose,
}: DownloadErrorDialogProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[360px]">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
        <h3 className="text-base font-semibold text-gray-900 text-center mb-2">
          {t('download.errorTitle')}
        </h3>
        <p className="text-sm text-gray-600 text-center mb-6">
          {t('download.errorDesc', { name: modelName })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              onRetry();
              onClose();
            }}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
          >
            {t('download.retry')}
          </button>
          <button
            onClick={() => {
              onSelectOther();
              onClose();
            }}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {t('download.selectOther')}
          </button>
        </div>
      </div>
    </div>
  );
}