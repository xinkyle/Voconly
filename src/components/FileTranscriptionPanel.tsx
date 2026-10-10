import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import FileUploadArea from './FileUploadArea';
import type { FileTranscriptionRecord, AppConfig } from '../types';
import { loadFileTranscriptionHistory, transcribeAudioFile, createFileTranscriptionRecord } from '../services/fileTranscription';
import { loadConfig } from '../services/config';
import { useToast } from './ui/Toast';

type TabType = 'pending' | 'history';
type TranscriptionStatus = 'idle' | 'transcribing' | 'completed' | 'error';

// 每页显示条数
const PAGE_SIZE = 10;

export default function FileTranscriptionPanel() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [records, setRecords] = useState<FileTranscriptionRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number; duration: number } | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

  // 分页逻辑
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return records.slice(start, end);
  }, [records, currentPage]);

  // 当总页数变化时，确保当前页码有效
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  const handleFileSelected = (filePath: string, fileName: string, fileSize: number, duration: number) => {
    setSelectedFile({ path: filePath, name: fileName, size: fileSize, duration });
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
          audioDuration: selectedFile.duration,
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

      // 显示成功提示
      showToast({
        type: 'success',
        title: '转录完成',
        description: `${selectedFile.name} (${formatDuration(result.duration)})`,
      });

      // 重置状态
      setStatus('completed');
      setSelectedFile(null);
      setProgress({ current: 0, total: 0, percent: 0 });
      setCurrentPage(1); // 重置到第一页显示最新记录

    } catch (err) {
      console.error('Transcription failed:', err);

      // 提供更友好的错误信息
      let errorMessage = '转录失败';
      if (err instanceof Error) {
        // 移除 ffmpeg 相关的错误提示
        // 现在使用 symphonia，不再需要 ffmpeg
        errorMessage = err.message;
      }

      setError(errorMessage);
      setStatus('error');
      setProgress({ current: 0, total: 0, percent: 0 });
    }
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
          {/* 文件上传区域 - 始终显示，保持大小不变 */}
          <div className="space-y-4">
            {/* 错误提示 */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* 进度显示 */}
            {status === 'transcribing' && progress.percent > 0 && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
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

            <FileUploadArea
              onFileSelected={handleFileSelected}
              selectedFile={selectedFile}
              onStartTranscription={handleStartTranscription}
              isTranscribing={status === 'transcribing'}
            />
          </div>

          {/* 最近一条转录记录 */}
          {records.length > 0 && (
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
                      <span className="text-xs text-gray-500">{formatDuration(records[0].duration)}</span>
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
            <>
              <div className="space-y-2">
                {paginatedRecords.map(record => (
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
                              {formatDuration(record.duration)}
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

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 pb-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title={t('memory.prevPage')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    title={t('memory.nextPage')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <span className="ml-4 text-sm text-gray-500">
                    {t('memory.totalRecords', { count: records.length })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}