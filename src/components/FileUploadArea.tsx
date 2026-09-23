import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UnlistenFn } from '@tauri-apps/api/event';

const FileIcon = () => (
  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

interface FileUploadAreaProps {
  onFileSelected: (filePath: string, fileName: string, fileSize: number) => void;
  disabled?: boolean;
}

export default function FileUploadArea({ onFileSelected, disabled }: FileUploadAreaProps) {
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
              // 获取文件大小
              getFileInfo(filePath).then(({ size }) => {
                onFileSelectedRef.current(filePath, fileName, size);
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
  const getFileInfo = async (filePath: string): Promise<{ size: number }> => {
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const stat = await fs.stat(filePath);
      return { size: stat.size };
    } catch (e) {
      console.warn('Failed to get file size:', e);
      return { size: 0 };
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
        const { size } = await getFileInfo(selected);
        onFileSelected(selected, fileName, size);
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }, [disabled, onFileSelected]);

  return (
    <div
      className={`relative border bg-gray-100 rounded-2xl p-12 text-center transition-all duration-200 shadow-sm ${
        isDragging
          ? 'border-gray-400 bg-gray-200 shadow-lg'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onClick={handleSelectFile}
    >
      <div className="flex flex-col items-center">
        <FileIcon />
        <p className="mt-4 text-base font-medium text-gray-700">
          {t('file.dropzone.title')}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          {t('file.dropzone.or')}
        </p>
        <button
          className="mt-3 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            handleSelectFile();
          }}
          disabled={disabled}
        >
          {t('file.dropzone.select')}
        </button>
      </div>
    </div>
  );
}