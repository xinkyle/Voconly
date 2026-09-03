import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import UpdateDialog from '../UpdateDialog';
import { checkForUpdates, getCurrentVersion } from '../../services/updater';
import type { RemoteVersionInfo } from '../../types/updater';

const APP_NAME = 'Voconly';

// Logo Component - grayscale version for clean integration
const LogoIcon = ({ className = 'w-7 h-7' }: { className?: string }) => (
  <img
    src="/logo.png"
    alt="Voconly"
    className={`${className} grayscale opacity-80`}
    style={{ imageRendering: 'auto' }}
  />
);

interface SettingsAboutProps {
  /** Callback when update is available (to update title bar badge) */
  onUpdateAvailable?: (versionInfo: RemoteVersionInfo) => void;
}

export default function SettingsAbout({ onUpdateAvailable }: SettingsAboutProps) {
  const { t, i18n } = useTranslation();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateVersionInfo, setUpdateVersionInfo] = useState<RemoteVersionInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');

  // Fetch current version on mount
  useEffect(() => {
    getCurrentVersion()
      .then(setCurrentVersion)
      .catch((err) => {
        console.error('Failed to get current version:', err);
        setCurrentVersion('unknown');
      });
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);

    try {
      const version = await getCurrentVersion();
      setCurrentVersion(version);

      const result = await checkForUpdates(i18n.language);

      if (result.hasUpdate && result.versionInfo) {
        setUpdateVersionInfo(result.versionInfo);
        setShowUpdateDialog(true);
        // Notify parent to show title bar badge
        onUpdateAvailable?.(result.versionInfo);
      } else {
        setUpdateStatus(t('settings.about.latestVersion'));
      }
    } catch (error) {
      console.error('Check update failed:', error);
      setUpdateStatus(t('settings.about.checkFailed'));
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div>
      {/* App info */}
      <div className="flex items-center gap-4 mb-6">
        <LogoIcon className="w-12 h-12" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{APP_NAME}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('settings.about.subtitle')}</p>
        </div>
      </div>

      {/* Product description */}
      <div className="mb-8 p-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-100">
        <p className="text-sm text-gray-700 leading-relaxed">
          <strong className="text-gray-900">Voconly</strong> 是一款免费、开源、本地优先的 AI 语音输入助手，完全运行在你的设备上。
        </p>
        <p className="text-sm text-gray-600 leading-relaxed mt-3">
          它将语音在本地转换为文字，并通过 AI 进行润色、翻译、整理和结构化处理，让你在任何应用中用说话代替键盘输入。
        </p>
        <p className="text-xs text-gray-500 mt-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          无需上传音频，不依赖云端服务，保护你的隐私。
        </p>
      </div>

      {/* Update check */}
      <div className="mb-8">
        <h3 className="text-xs font-medium text-gray-400 mb-2">{t('settings.about.update')}</h3>
        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.about.currentVersion', { version: currentVersion || '...' })}</p>
              {updateStatus && (
                <p className="text-xs text-gray-500 mt-0.5">{updateStatus}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className={`px-3 py-1.5 bg-gray-900 text-white rounded-lg font-medium text-xs transition-colors
              ${checkingUpdate ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'}`}
          >
            {checkingUpdate ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('settings.about.checking')}
              </span>
            ) : (
              t('settings.about.checkUpdate')
            )}
          </button>
        </div>
      </div>

      {/* License */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} {APP_NAME}. MIT License.
        </p>
      </div>

      {/* Update Dialog */}
      {showUpdateDialog && updateVersionInfo && (
        <UpdateDialog
          isOpen={showUpdateDialog}
          onClose={() => setShowUpdateDialog(false)}
          versionInfo={updateVersionInfo}
        />
      )}
    </div>
  );
}