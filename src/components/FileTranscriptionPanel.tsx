import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import FileUploadArea from './FileUploadArea';
import type { FileTranscriptionRecord } from '../types';
import { loadFileTranscriptionHistory } from '../services/fileTranscription';

type TabType = 'pending' | 'history';

export default function FileTranscriptionPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [records, setRecords] = useState<FileTranscriptionRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);

  // 加载历史记录
  useEffect(() => {
    loadFileTranscriptionHistory()
      .then(setRecords)
      .catch(err => console.error('Failed to load history:', err));
  }, []);

  const handleFileSelected = (filePath: string, fileName: string) => {
    setSelectedFile({ path: filePath, name: fileName });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('file.title')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-gray-100/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              activeTab === 'pending'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('file.tabs.pending')}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              activeTab === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('file.tabs.history')}
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'pending' ? (
        <div className="max-w-2xl mx-auto">
          {selectedFile ? (
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-4">{t('file.selected.title')}</p>
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">{selectedFile.path}</p>
                </div>
              </div>
              <button
                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                onClick={() => {/* TODO: 开始转录 */}}
              >
                {t('file.selected.start')}
              </button>
            </div>
          ) : (
            <FileUploadArea onFileSelected={handleFileSelected} />
          )}

          {/* Hint */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>{t('file.dropzone.hint')}</p>
            <p className="mt-1">{t('file.dropzone.sizeLimit')}</p>
          </div>
        </div>
      ) : (
        <div>
          {records.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl">
              <p className="text-gray-600">{t('file.history.noRecords')}</p>
              <p className="text-sm text-gray-500 mt-1">{t('file.history.noRecordsHint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map(record => (
                <div key={record.id} className="bg-white rounded-xl p-3 border border-gray-200">
                  <p className="font-medium text-gray-900">{record.filename}</p>
                  <p className="text-sm text-gray-500 mt-1">{record.transcriptText.substring(0, 100)}...</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}