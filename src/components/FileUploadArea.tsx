import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';

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

        // 获取文件大小
        let fileSize = 0;
        try {
          const stat = await import('@tauri-apps/plugin-fs').then(fs => fs.stat(selected));
          fileSize = stat.size;
        } catch (e) {
          console.warn('Failed to get file size:', e);
        }

        onFileSelected(selected, fileName, fileSize);
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }, [disabled, onFileSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Note: Tauri 拖拽返回的是文件路径
      const path = (file as any).path || file.name;
      const fileSize = file.size || 0;
      onFileSelected(path, file.name, fileSize);
    }
  }, [disabled, onFileSelected]);

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 ${
        isDragging
          ? 'border-gray-400 bg-gray-50'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
          className="mt-3 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
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