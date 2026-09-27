import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { getAudioDuration } from '../services/fileTranscription';

const FileIcon = () => (
  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

interface FileUploadAreaProps {
  onFileSelected: (filePath: string, fileName: string, fileSize: number, duration: number) => void;
  disabled?: boolean;
  selectedFile?: { path: string; name: string; size: number; duration?: number } | null;
  onStartTranscription?: () => void;
  isTranscribing?: boolean;
}

export default function FileUploadArea({
  onFileSelected,
  disabled,
  selectedFile,
  onStartTranscription,
  isTranscribing
}: FileUploadAreaProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // 使用 ref 存储回调，避免作为 useEffect 依赖项导致频繁重建
  const onFileSelectedRef = useRef(onFileSelected);
  useEffect(() => {
    onFileSelectedRef.current = onFileSelected;
  }, [onFileSelected]);

  // 使用 Tauri 的拖拽 API 监听文件拖拽事件
  useEffect(() => {
    const setupDragDrop = async () => {
      const webview = getCurrentWebviewWindow();

      unlistenRef.current = await webview.onDragDropEvent((event) => {
        if (disabled) return;

        switch (event.payload.type) {
          case 'enter':
          case 'over':
            setIsDragging(true);
            break;
          case 'leave':
            setIsDragging(false);
            break;
          case 'drop':
            setIsDragging(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const filePath = paths[0];
              const fileName = filePath.split(/[/\\]/).pop() || filePath;
              // 获取文件大小和时长
              getFileInfo(filePath).then(({ size, duration }) => {
                onFileSelectedRef.current(filePath, fileName, size, duration);
              });
            }
            break;
        }
      });
    };

    setupDragDrop();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [disabled]);

  // 获取文件信息
  const getFileInfo = async (filePath: string): Promise<{ size: number; duration: number }> => {
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const stat = await fs.stat(filePath);
      // 获取音频时长
      const duration = await getAudioDuration(filePath);
      return { size: stat.size, duration };
    } catch (e) {
      console.warn('Failed to get file info:', e);
      return { size: 0, duration: 0 };
    }
  };

  const handleSelectFile = useCallback(async () => {
    if (disabled) return;

    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Audio',
          extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm']
        }]
      });

      if (selected && typeof selected === 'string') {
        const fileName = selected.split(/[/\\]/).pop() || selected;
        const { size, duration } = await getFileInfo(selected);
        onFileSelected(selected, fileName, size, duration);
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }, [disabled, onFileSelected]);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 格式化时长显示
  const formatDuration = (seconds: number): string => {
    const rounded = Math.round(seconds);
    if (rounded < 60) {
      return `${rounded}秒`;
    }
    const minutes = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`;
  };

  return (
    <div
      className={`relative border bg-gray-100 rounded-2xl p-12 text-center transition-all duration-200 shadow-sm min-h-[280px] flex items-center justify-center ${
        isDragging
          ? 'border-gray-400 bg-gray-200 shadow-lg'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onClick={selectedFile ? undefined : handleSelectFile}
    >
      <div className="flex flex-col items-center w-full">
        {/* Icon - 固定高度区域 */}
        <div className="h-12 flex items-center justify-center">
          {selectedFile ? (
            <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ) : (
            <FileIcon />
          )}
        </div>

        {/* 标题/文件名 - 固定高度区域 */}
        <div className="mt-4 h-6 flex items-center justify-center">
          <p className="text-base font-medium text-gray-900">
            {selectedFile ? selectedFile.name : t('file.dropzone.title')}
          </p>
        </div>

        {/* 副标题/文件信息 - 固定高度区域 */}
        <div className="mt-2 h-5 flex items-center justify-center gap-2">
          {selectedFile ? (
            <>
              <span className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</span>
              {selectedFile.duration !== undefined && selectedFile.duration > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-gray-500">{formatDuration(selectedFile.duration)}</span>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">{t('file.dropzone.or')}</p>
          )}
        </div>

        {/* 路径/空占位 - 固定高度区域，始终保持高度 */}
        <div className="mt-1 h-4 flex items-center justify-center max-w-full">
          <p className="text-xs text-gray-400 truncate">
            {selectedFile ? selectedFile.path : ' '}
          </p>
        </div>

        {/* 按钮 */}
        <button
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={(e) => {
            e.stopPropagation();
            if (selectedFile && onStartTranscription) {
              onStartTranscription();
            } else {
              handleSelectFile();
            }
          }}
          disabled={disabled || isTranscribing}
        >
          {isTranscribing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t('file.selected.transcribing')}
            </span>
          ) : selectedFile ? (
            t('file.selected.start')
          ) : (
            t('file.dropzone.select')
          )}
        </button>
      </div>
    </div>
  );
}