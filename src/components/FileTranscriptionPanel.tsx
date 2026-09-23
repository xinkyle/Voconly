import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import FileUploadArea from './FileUploadArea';
import type { FileTranscriptionRecord, AppConfig } from '../types';
import { loadFileTranscriptionHistory, transcribeAudioFile, createFileTranscriptionRecord } from '../services/fileTranscription';
import { loadConfig } from '../services/config';
import { useToast } from './ui/Toast';

type TabType = 'pending' | 'history';
type TranscriptionStatus = 'idle' | 'transcribing' | 'completed' | 'error';

export default function FileTranscriptionPanel() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [records, setRecords] = useState<FileTranscriptionRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number } | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);

  // 进度状态
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  }>({ current: 0, total: 0, percent: 0 });

  // 加载配置和历史记录
  useEffect(() => {
    loadConfig()
      .then(cfg => {
        setConfig(cfg);
      })
      .catch(err => console.error('Failed to load config:', err));

    loadFileTranscriptionHistory()
      .then(setRecords)
      .catch(err => console.error('Failed to load history:', err));
  }, []);

  // Copy text to clipboard
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({
        type: 'success',
        title: t('memory.copied'),
      });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleFileSelected = (filePath: string, fileName: string, fileSize: number) => {
    setSelectedFile({ path: filePath, name: fileName, size: fileSize });
    setStatus('idle');
    setError(null);
    setProgress({ current: 0, total: 0, percent: 0 });
  };

  const handleStartTranscription = async () => {
    if (!selectedFile || status === 'transcribing') return;

    console.log('[FileTranscription] Button clicked, starting transcription...');

    setStatus('transcribing');
    setError(null);
    setProgress({ current: 0, total: 0, percent: 0 });

    try {
      // 使用第一个启用的场景ID，或默认场景
      const sceneId = config?.scenes?.find(s => s.enabled)?.id || config?.scenes?.[0]?.id || 'default';

      console.log('[FileTranscription] Calling transcribeAudioFile...', { filePath: selectedFile.path, sceneId });

      // 调用转录（会自动转换非 WAV 格式，并判断是否需要分割）
      const result = await transcribeAudioFile(
        selectedFile.path,
        sceneId,
        undefined,
        {
          fileSize: selectedFile.size,
          onProgress: (current, total, percent) => {
            setProgress({ current, total, percent });
          },
        }
      );

      console.log('[FileTranscription] Transcription complete:', { textLength: result.text.length, duration: result.duration });

      // 获取ASR模型ID
      const asrModelId = config?.globalModelConfig?.asrModel?.modelId || 'unknown';

      // 创建并保存记录
      const record = await createFileTranscriptionRecord(
        selectedFile.path,
        selectedFile.name,
        selectedFile.size,
        result.text,
        result.duration,
        asrModelId
      );

      // 更新记录列表
      setRecords([record, ...records]);

      // 重置状态
      setStatus('completed');
      setSelectedFile(null);
      setProgress({ current: 0, total: 0, percent: 0 });

    } catch (err) {
      console.error('Transcription failed:', err);

      // 提供更友好的错误信息
      let errorMessage = '转录失败';
      if (err instanceof Error) {
        if (err.message.includes('ffmpeg not found')) {
          errorMessage = '未找到 ffmpeg，无法转换音频格式。请安装 ffmpeg 后重试。';
        } else if (err.message.includes('Failed to convert audio')) {
          errorMessage = `音频格式转换失败：${err.message}`;
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      setStatus('error');
      setProgress({ current: 0, total: 0, percent: 0 });
    }
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
        <div className="max-w-2xl mx-auto space-y-6">
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

              {/* 错误提示 */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* 进度显示 */}
              {status === 'transcribing' && progress.percent > 0 && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      正在转录...
                    </span>
                    <span className="text-sm text-gray-700">{Math.round(progress.percent)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gray-700 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleStartTranscription}
                disabled={status === 'transcribing'}
              >
                {status === 'transcribing' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    转录中...
                  </span>
                ) : (
                  t('file.selected.start')
                )}
              </button>
            </div>
          ) : (
            <FileUploadArea onFileSelected={handleFileSelected} />
          )}

          {/* 最近一条转录记录 */}
          {records.length > 0 && !selectedFile && (
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-xs text-gray-500 mb-2">最近转录</div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900 truncate">{records[0].filename}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-500">{Math.floor(records[0].duration / 60)}:{(records[0].duration % 60).toString().padStart(2, '0')}</span>
                      <button
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        onClick={() => handleCopy(records[0].transcriptText)}
                        title={t('common.copy') || '复制'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{records[0].transcriptText.substring(0, 100)}...</p>
                </div>
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="text-center text-sm text-gray-500">
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
                <div key={record.id} className="group bg-white rounded-xl p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-start gap-3">
                    {/* 文件名 */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{record.filename}</p>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{record.transcriptText.substring(0, 100)}...</p>

                      {/* Meta info */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {Math.floor(record.duration / 60)}:{(record.duration % 60).toString().padStart(2, '0')}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {record.wordCount} 字
                          </span>
                        </div>
                        <button
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(record.transcriptText);
                          }}
                          title={t('common.copy') || '复制'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}