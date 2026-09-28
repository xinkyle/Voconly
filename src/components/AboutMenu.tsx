import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import AboutModal from './AboutModal';

export default function AboutMenu() {
  const { t } = useTranslation();
  const [showAboutModal, setShowAboutModal] = useState(false);

  const openGitHubStar = useCallback(() => {
    openUrl('https://github.com/xinkyle/Voconly');
  }, []);

  return (
    <>
      {/* About button with star */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowAboutModal(true)}
          className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{t('about.title')}</span>
        </button>

        {/* Star button */}
        <button
          onClick={openGitHubStar}
          title="在 GitHub 上给项目点个 Star ⭐"
          className="p-2 text-yellow-500 hover:scale-110 rounded-lg transition-transform duration-200"
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      </div>

      {/* About Modal */}
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />
    </>
  );
}