import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ShortcutErrorModalProps {
  isOpen: boolean;
  shortcut: string;
  errorType: 'unsupported' | 'occupied' | 'unknown';
  errorMessage: string;
  onClose: () => void;
}

export default function ShortcutErrorModal({
  isOpen,
  shortcut,
  errorType,
  errorMessage,
  onClose,
}: ShortcutErrorModalProps) {
  const { t } = useTranslation();

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Get appropriate error message based on error type
  const getErrorMessage = () => {
    if (errorType === 'unsupported') {
      return t('sceneForm.shortcutErrorUnsupported', { shortcut });
    }
    if (errorType === 'occupied') {
      return t('sceneForm.shortcutErrorOccupied', { shortcut });
    }
    return t('sceneForm.shortcutErrorUnknown', { shortcut, error: errorMessage });
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-error-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 id="shortcut-error-title" className="text-base font-semibold text-gray-900">
              {t('sceneForm.shortcutErrorTitle')}
            </h3>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 leading-relaxed">
            {getErrorMessage()}
          </p>
          <p className="text-sm text-gray-500 mt-3">
            {t('sceneForm.shortcutErrorReverted')}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            autoFocus
            className="px-5 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 active:scale-95"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}