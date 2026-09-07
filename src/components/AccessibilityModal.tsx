import { useTranslation } from 'react-i18next';

interface AccessibilityModalProps {
  isOpen: boolean;
  onSkip: () => void;
  onAuthorize: () => void;
}

/**
 * macOS 辅助功能权限引导弹窗（首次引导 / onboarding 结束时展示，一次性、可跳过）
 */
export default function AccessibilityModal({ isOpen, onSkip, onAuthorize }: AccessibilityModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 3.75a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zM5.25 8.25h13.5m-6.75 0v6.75m0 0l-3.375 5.25M12 15l3.375 5.25"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
          {t('accessibility.modalTitle')}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-500 text-center mb-2">
          {t('accessibility.modalDescription')}
        </p>
        <p className="text-xs text-gray-400 text-center mb-4">
          {t('accessibility.modalHint')}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {t('accessibility.skip')}
          </button>
          <button
            onClick={onAuthorize}
            className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            {t('accessibility.authorize')}
          </button>
        </div>
      </div>
    </div>
  );
}
