import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AboutModal from './AboutModal';

export default function AboutMenu() {
  const { t } = useTranslation();
  const [showAboutModal, setShowAboutModal] = useState(false);

  return (
    <>
      {/* About button */}
      <button
        onClick={() => setShowAboutModal(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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

      {/* About Modal */}
      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />
    </>
  );
}