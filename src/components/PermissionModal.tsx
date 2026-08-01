import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requestMicrophonePermission } from '../services/audio';
import { createLogger } from '../services/log';

const log = createLogger('PermissionModal');

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGranted: () => void;
}

export default function PermissionModal({ isOpen, onClose, onGranted }: PermissionModalProps) {
  const { t } = useTranslation();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    setRequesting(true);
    setError(null);

    try {
      const granted = await requestMicrophonePermission();
      if (granted) {
        log.info('Microphone permission granted');
        onGranted();
        onClose();
      } else {
        setError(t('permission.deniedHint'));
      }
    } catch (err) {
      log.error(`Permission request failed: ${err}`);
      setError(t('permission.error'));
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
          {t('permission.title')}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-500 text-center mb-4">
          {t('permission.description')}
        </p>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-600 text-center">{error}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {t('permission.skip')}
          </button>
          <button
            onClick={handleRequestPermission}
            disabled={requesting}
            className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {requesting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('permission.requesting')}
              </>
            ) : (
              t('permission.grant')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}