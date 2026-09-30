import { useTranslation } from 'react-i18next';
import { restartApp } from '../services/updater';

interface PermissionRestartDialogProps {
  visible: boolean;
  onClose: () => void;
}

export default function PermissionRestartDialog({
  visible,
  onClose,
}: PermissionRestartDialogProps) {
  const { t } = useTranslation();

  if (!visible) return null;

  const handleRestart = async () => {
    await restartApp();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-[400px]">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h3 className="text-base font-semibold text-gray-900 text-center mb-2">
          {t('accessibility.permissionGranted', '授权成功')}
        </h3>
        <div className="text-sm text-gray-600 text-center mb-6">
          <p>{t('accessibility.restartRequired', '授权成功，请重启应用以生效')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {t('common.later', '稍后重启')}
          </button>
          <button
            onClick={handleRestart}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            {t('common.restartNow', '立即重启')}
          </button>
        </div>
      </div>
    </div>
  );
}