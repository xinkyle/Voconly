// src/components/UpdateDialog.tsx
// 使用 tauri-plugin-updater 的更新对话框组件

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { flushSync } from 'react-dom';
import {
  checkForUpdates,
  downloadAndInstallUpdate,
} from '../services/updater';
import type { DownloadProgress } from '../services/updater';
import type { RemoteVersionInfo } from '../types/updater';

type DialogState = 'idle' | 'checking' | 'available' | 'downloading' | 'error';

interface UpdateDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Optional: pre-checked version info (skip re-check if provided) */
  versionInfo?: RemoteVersionInfo;
}

/**
 * Parse bilingual release notes
 * Format: "中文内容\n---\nEnglish content"
 */
function parseBilingualNotes(notes: string, language: string): string {
  const parts = notes.split('\n---\n');
  if (parts.length === 2) {
    // Return Chinese for zh-CN or zh, otherwise return English
    return language.startsWith('zh') ? parts[0].trim() : parts[1].trim();
  }
  // Fallback: return as-is if no separator found
  return notes;
}

/**
 * Format file size in MB
 */
function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function UpdateDialog({
  isOpen,
  onClose,
  versionInfo: externalVersionInfo,
}: UpdateDialogProps) {
  const { t, i18n } = useTranslation();

  // Use ref to store externalVersionInfo - changes won't trigger effect re-run
  const externalVersionInfoRef = useRef(externalVersionInfo);
  externalVersionInfoRef.current = externalVersionInfo;

  // State
  const [dialogState, setDialogState] = useState<DialogState>('idle');
  const [progress, setProgress] = useState<DownloadProgress>({
    downloaded: 0,
    totalSize: 0,
    progress: 0,
  });
  const [versionInfo, setVersionInfo] = useState<RemoteVersionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for updates when dialog opens
  // NOTE: externalVersionInfo is NOT in dependencies - we use ref to avoid triggering effect
  useEffect(() => {
    if (!isOpen) {
      // Reset state when dialog closes
      if (dialogState === 'downloading') {
        return; // Don't reset while downloading
      }
      setDialogState('idle');
      setProgress({ downloaded: 0, totalSize: 0, progress: 0 });
      setVersionInfo(null);
      setError(null);
      return;
    }

    // Don't interfere with download state - this is the key protection
    if (dialogState === 'downloading') {
      return; // Let download progress continue, ignore all external changes
    }

    // If external versionInfo provided (via ref), use it directly
    if (externalVersionInfoRef.current) {
      setVersionInfo(externalVersionInfoRef.current);
      setDialogState('available');
      return;
    }

    // Otherwise, check for updates
    const doCheck = async () => {
      setDialogState('checking');
      setError(null);

      try {
        // 传入当前语言，用于选择下载源（中文用 Gitee，其他用 GitHub）
        const result = await checkForUpdates(i18n.language);

        if (result.hasUpdate && result.versionInfo) {
          setVersionInfo(result.versionInfo);
          setDialogState('available');
        } else {
          // No update available, close dialog
          onClose();
        }
      } catch (err) {
        setError(String(err));
        setDialogState('error');
      }
    };

    doCheck();
  }, [isOpen, dialogState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialogState !== 'downloading') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, dialogState]);

  // Handle download and install
  const handleInstall = useCallback(async () => {
    // Force sync update to show progress UI immediately
    flushSync(() => {
      setDialogState('downloading');
      setError(null);
      setProgress({ downloaded: 0, totalSize: 0, progress: 0 });
    });

    // IMPORTANT: Wait for React to complete rendering before starting download
    // This ensures the progress UI is visible when download starts
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // 传入当前语言，用于选择下载源（中文用 Gitee，其他用 GitHub）
      await downloadAndInstallUpdate((p) => {
        // Use flushSync to ensure progress updates are rendered immediately
        flushSync(() => {
          setProgress(p);
        });
      }, i18n.language);
      // After successful install, the app will relaunch automatically
    } catch (err) {
      flushSync(() => {
        setError(String(err));
        setDialogState('error');
      });
    }
  }, []);

  // Handle cancel download - restore to available state
  const handleCancelDownload = useCallback(() => {
    flushSync(() => {
      setDialogState('available');
      setProgress({ downloaded: 0, totalSize: 0, progress: 0 });
    });
  }, []);

  // Handle retry
  const handleRetry = useCallback(() => {
    setDialogState('idle');
    setError(null);
    setProgress({ downloaded: 0, totalSize: 0, progress: 0 });
    // Trigger re-check
    const doCheck = async () => {
      setDialogState('checking');
      try {
        // 传入当前语言，用于选择下载源
        const result = await checkForUpdates(i18n.language);
        if (result.hasUpdate && result.versionInfo) {
          setVersionInfo(result.versionInfo);
          setDialogState('available');
        } else {
          onClose();
        }
      } catch (err) {
        setError(String(err));
        setDialogState('error');
      }
    };
    doCheck();
  }, [onClose, i18n.language]);

  // Don't render if closed
  if (!isOpen) return null;

  // Render checking state
  if (dialogState === 'checking') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in">
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center animate-spin">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">{t('update.checking')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={dialogState === 'downloading' ? undefined : onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {t('update.newVersionAvailable')}
            </h2>
          </div>
          {dialogState !== 'downloading' && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Version comparison */}
          {versionInfo && (
            <div className="text-center">
              <p className="text-sm text-gray-600">
                {t('update.versionCompare', {
                  current: versionInfo.currentVersion,
                  new: versionInfo.version,
                })}
              </p>
            </div>
          )}

          {/* Changelog */}
          {versionInfo?.body && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                {t('update.changelog')}
              </h3>
              <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto pr-2">
                {parseBilingualNotes(versionInfo.body, i18n.language)}
              </div>
            </div>
          )}

          {/* Download progress */}
          {dialogState === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t('update.downloading')}</span>
                <span className="text-gray-900 font-medium">
                  {progress.totalSize > 0 ? `${progress.progress}%` : `${formatFileSize(progress.downloaded)}`}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-150"
                  style={{ width: `${Math.max(progress.progress, 2)}%`, minWidth: progress.downloaded > 0 ? '2%' : '0%' }}
                />
              </div>
              {progress.totalSize > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  {formatFileSize(progress.downloaded)} / {formatFileSize(progress.totalSize)}
                </p>
              )}
              {progress.totalSize === 0 && progress.downloaded > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  {t('update.downloaded')} {formatFileSize(progress.downloaded)}
                </p>
              )}
            </div>
          )}

          {/* Error message */}
          {dialogState === 'error' && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-center">
          {/* Available state: Install Now only (user can close via X) */}
          {dialogState === 'available' && (
            <button
              onClick={handleInstall}
              className="px-8 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium rounded-lg hover:from-green-600 hover:to-green-700 transition-colors"
            >
              {t('update.installNow')}
            </button>
          )}

          {/* Downloading state: Cancel only - restores to available state */}
          {dialogState === 'downloading' && (
            <button
              onClick={handleCancelDownload}
              className="px-8 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('update.cancel')}
            </button>
          )}

          {/* Error state: Try Again */}
          {dialogState === 'error' && (
            <button
              onClick={handleRetry}
              className="px-8 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium rounded-lg hover:from-green-600 hover:to-green-700 transition-colors"
            >
              {t('update.tryAgain')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}