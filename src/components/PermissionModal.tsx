import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { requestMicrophonePermission, checkMicrophonePermission } from '../services/audio';
import { createLogger } from '../services/log';

const log = createLogger('PermissionModal');

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGranted: () => void;
  /** 是否初始就显示"打开系统设置"按钮（权限已被拒绝的情况） */
  initialDenied?: boolean;
}

export default function PermissionModal({ isOpen, onClose, onGranted, initialDenied = false }: PermissionModalProps) {
  const { t } = useTranslation();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDenied, setIsDenied] = useState(initialDenied);

  // 当 modal 打开且 initialDenied 为 false 时，检查权限状态
  useEffect(() => {
    if (isOpen && !initialDenied) {
      checkMicrophonePermission().then(state => {
        log.info(`Permission state: ${state}`);
        setIsDenied(state === 'denied');
      });
    }
  }, [isOpen, initialDenied]);

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
        // Permission still denied
        setIsDenied(true);
        setError(t('permission.deniedHint'));
      }
    } catch (err) {
      log.error(`Permission request failed: ${err}`);
      setError(t('permission.error'));
    } finally {
      setRequesting(false);
    }
  };

  const handleOpenSystemSettings = async () => {
    try {
      // macOS: Open System Preferences > Security & Privacy > Privacy > Microphone
      // Note: This URL scheme may not work in all macOS versions
      log.info('Attempting to open system settings for microphone permission');
      await openUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
      log.info('Successfully opened system settings');
      // Close the modal after opening settings
      onClose();
    } catch (err) {
      log.error(`Failed to open system settings: ${err}`);
      // Show a more helpful error message
      setError('无法打开系统设置，请手动打开：系统设置 > 隐私与安全性 > 麦克风');
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
        {isDenied ? (
          // Permission denied - show button to open system settings
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              {t('permission.skip')}
            </button>
            <button
              onClick={handleOpenSystemSettings}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {t('permission.openSettings')}
            </button>
          </div>
        ) : (
          // Permission not yet denied - show request button
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
        )}
      </div>
    </div>
  );
}