import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import FileUploadArea from './FileUploadArea';
import type { FileTranscriptionRecord, AppConfig } from '../types';
import { loadFileTranscriptionHistory, transcribeAudioFile, createFileTranscriptionRecord, deleteFileTranscription, clearFileTranscriptionHistory } from '../services/fileTranscription';
import { loadConfig } from '../services/config';
import FileModelControls from './FileModelControls';
import FileProcessingSelect from './FileProcessingSelect';
import FileResultDialog from './FileResultDialog';
import { processFileRecord } from '../services/fileAiWorkflow';
import { processFileText } from '../services/llm';
import { getPromptOptions, resolvePrompt } from '../utils/promptPresets';
import type { DownloadProgress } from '../services/downloader';
import type { Model } from '../types';
import { getFullModelId } from '../types';
import { saveFileTranscription } from '../services/fileTranscription';
import { useToast } from './ui/Toast';

type TabType = 'pending' | 'history';
type TranscriptionStatus = 'idle' | 'transcribing' | 'processing' | 'completed' | 'error';

interface Props {
  active: boolean;
  config: AppConfig | null;
  onConfigChange: (config: AppConfig) => void;
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
  onDownloadCancel?: (modelId: string) => void;
  onQuantPrefChange?: (modelId: string, quant: string) => void | Promise<void>;
}

function readPreference(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

// 每页显示条数
const PAGE_SIZE = 10;

export default function FileTranscriptionPanel({ active, config, onConfigChange, ...modelProps }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [records, setRecords] = useState<FileTranscriptionRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; size: number; duration: number } | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [autoProcess, setAutoProcess] = useState(() => readPreference('file-ai-enabled', 'false') === 'true');
  const [promptId, setPromptId] = useState(() => readPreference('file-ai-prompt', 'lightPolish'));
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const running = useRef(false);
  const busy = status === 'transcribing' || status === 'processing' || modelBusy;
  const promptOptions = getPromptOptions(config?.llmPromptPresets, t);
  const promptExists = promptOptions.some(option => option.id === promptId);
  const hasLlm = !!(config?.globalModelConfig.llm.providerId && config.globalModelConfig.llm.model);
  const canProcess = hasLlm && promptExists;
  const viewingRecord = records.find(record => record.id === viewingId);

  useEffect(() => {
    try {
      localStorage.setItem('file-ai-enabled', String(autoProcess));
      localStorage.setItem('file-ai-prompt', promptId);
    } catch { /* Keep session preferences if storage is unavailable. */ }
  }, [autoProcess, promptId]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<FileTranscriptionRecord | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 进度状态
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  }>({ current: 0, total: 0, percent: 0 });

  // 加载配置和历史记录
  useEffect(() => {
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

  const applyAi = async (record: FileTranscriptionRecord, latest: AppConfig) => {
    const prompt = resolvePrompt(promptId, latest.llmPromptPresets, t);
    if (!prompt) throw new Error(t('file.ai.missingPrompt'));
    if (!latest.globalModelConfig.llm.providerId || !latest.globalModelConfig.llm.model) {
      throw new Error(t('file.ai.notConfigured'));
    }
    setStatus('processing');
    const updated = await processFileRecord(record, {
      prompt, name: getPromptOptions(latest.llmPromptPresets, t).find(option => option.id === promptId)?.name || promptId,
      model: latest.globalModelConfig.llm.model,
    }, { process: processFileText, save: saveFileTranscription });
    setRecords(previous => previous.map(item => item.id === updated.id ? updated : item));
    if (updated.aiStatus === 'error') {
      showToast({ type: 'warning', title: t('file.ai.failedPreserved'), description: updated.aiError?.startsWith('CONTEXT_TOO_LONG:') ? t('file.ai.tooLong') : updated.aiError });
    } else {
      showToast({ type: 'success', title: t('file.ai.completed') });
    }
  };

  const handleProcessRecord = async (record: FileTranscriptionRecord) => {
    if (running.current || modelBusy) return;
    running.current = true;
    setError(null);
    setStatus('processing');
    try {
      await applyAi(record, await loadConfig());
      setStatus('completed');
    } catch (err) {
      setError(String(err));
      setStatus('error');
      showToast({ type: 'error', title: t('common.error'), description: String(err) });
    } finally { running.current = false; }
  };

  const handleStartTranscription = async () => {
    if (!selectedFile || running.current || modelBusy) return;
    running.current = true;
    setStatus('transcribing');
    setError(null);
    setProgress({ current: 0, total: 0, percent: 0 });
    let originalSaved = false;
    try {
      const latest = await loadConfig();
      if (autoProcess && (!resolvePrompt(promptId, latest.llmPromptPresets, t) || !latest.globalModelConfig.llm.model || !latest.globalModelConfig.llm.providerId)) {
        throw new Error(t('file.ai.checkSettings'));
      }
      const result = await transcribeAudioFile(selectedFile.path, '__file_transcription__', undefined, {
        fileSize: selectedFile.size, audioDuration: selectedFile.duration,
        onProgress: (current, total, percent) => setProgress({ current, total, percent }),
      });
      const record = await createFileTranscriptionRecord(selectedFile.path, selectedFile.name, selectedFile.size,
        result.text, result.duration, getFullModelId(latest.globalModelConfig.asrModel));
      originalSaved = true;
      setRecords(previous => [record, ...previous].slice(0, 100));
      setViewingId(record.id);
      setSelectedFile(null);
      setCurrentPage(1);
      if (autoProcess && result.text.trim()) {
        await applyAi(record, await loadConfig());
      } else {
        showToast({ type: 'success', title: t('file.ai.transcribed') });
      }
      setStatus('completed');
    } catch (err) {
      const message = `${originalSaved ? t('file.ai.failedPreserved') + ' ' : ''}${err instanceof Error ? err.message : String(err)}`;
      setError(message);
      setStatus('error');
      showToast({ type: 'error', title: t('common.error'), description: message });
    } finally {
      running.current = false;
      setProgress({ current: 0, total: 0, percent: 0 });
    }
  };

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

      <FileModelControls config={config} onConfigChange={onConfigChange} disabled={busy} aiEnabled={autoProcess} onBusyChange={setModelBusy} {...modelProps}>
        <FileProcessingSelect value={autoProcess ? promptId : ''} disabled={busy || !config}
          label={t('file.ai.prompt')} title={t('file.ai.sharedPrompts')}
          options={[
            { id: '', name: t('file.ai.transcribeOnly') },
            ...(autoProcess && !promptExists ? [{ id: promptId, name: t('file.ai.missingPrompt') }] : []),
            ...promptOptions.map(option => ({ id: option.id, name: t('file.ai.processingOption', { name: option.name }) })),
          ]}
          onChange={selected => {
              setAutoProcess(!!selected);
              // Turning automatic processing off preserves the last preset for manual processing.
              if (selected) setPromptId(selected);
          }} />
      </FileModelControls>
      {autoProcess && (!hasLlm || !promptExists) && <p role="alert" className="text-xs text-amber-700">
        {!hasLlm ? t('file.ai.notConfigured') : t('file.ai.missingPrompt')}
      </p>}
      {status === 'processing' && <p role="status" className="text-sm text-center text-gray-600">{t('file.ai.processing')}</p>}
      {/* 进度显示 - 移到 tabs 外部 */}
      {status === 'transcribing' && (
        <div className="max-w-2xl mx-auto mb-4">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                {progress.percent === 0 ? '正在初始化...' : '正在转录...'}
              </span>
              <span className="text-sm text-gray-700">
                {progress.percent > 0 ? `${Math.round(progress.percent)}%` : ''}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gray-700 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        </div>
      )}

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

            <FileUploadArea
              onFileSelected={handleFileSelected}
              selectedFile={selectedFile}
              onStartTranscription={handleStartTranscription}
              isTranscribing={busy}
              disabled={!active || busy || !config}
              startLabel={autoProcess ? t('file.ai.startWithAi') : undefined}
              busyLabel={status === 'processing' ? t('file.ai.processing') : undefined}
            />
          </div>

          {/* 最近一条转录记录 */}
          {records.length > 0 && (
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex justify-between text-xs text-gray-500 mb-2"><span>{t('file.ai.recent')}</span><button className="underline" onClick={() => setViewingId(records[0].id)}>{t('file.ai.view')}</button></div>
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
                        onClick={() => handleCopy(records[0].processedText || records[0].transcriptText)}
                        title={t('common.copy') || '复制'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{(records[0].processedText || records[0].transcriptText).substring(0, 100)}...</p>
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
          {/* Header with clear button */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">{t('memory.totalRecords', { count: records.length })}</span>
            <button
              onClick={() => records.length > 0 && setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={records.length === 0 || busy}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {t('memory.clear')}
            </button>
          </div>

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
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{(record.processedText || record.transcriptText).substring(0, 100)}...</p>

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
                          <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 mr-2">{record.aiStatus === 'error' ? t('file.ai.failed') : record.processedText ? t('file.ai.completed') : t('file.ai.original')}</span>
                          <button className="px-2 py-1 text-xs rounded hover:bg-gray-100" onClick={() => setViewingId(record.id)}>{t('file.ai.view')}</button>
                          <button
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(record.processedText || record.transcriptText);
                            }}
                            title={t('common.copy') || '复制'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!busy) setDeleteTarget(record);
                            }}
                            disabled={busy}
                            title={t('memory.delete') || '删除'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
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

      {active && viewingRecord && <FileResultDialog key={viewingRecord.id} record={viewingRecord} busy={busy} canProcess={canProcess && !!viewingRecord.transcriptText.trim()}
        onClose={() => setViewingId(null)} onCopy={handleCopy} onProcess={() => handleProcessRecord(viewingRecord)} />}
      {/* Delete Confirmation Modal */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl animate-scale-in">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">{t('memory.confirmDelete')}</h3>
              <p className="text-sm text-gray-600 mb-6">
                {t('memory.confirmDeleteDesc')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('memory.cancel')}
                </button>
                <button
                  onClick={async () => {
                    if (deleteTarget) {
                      await deleteFileTranscription(deleteTarget.id);
                      setRecords(prev => prev.filter(r => r.id !== deleteTarget.id));
                      setDeleteTarget(null);
                    }
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  {t('memory.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl animate-scale-in">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">{t('memory.confirmClear')}</h3>
              <p className="text-sm text-gray-600 mb-6">
                {t('memory.confirmClearDesc')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('memory.cancel')}
                </button>
                <button
                  onClick={async () => {
                    await clearFileTranscriptionHistory();
                    setRecords([]);
                    setShowClearConfirm(false);
                    setCurrentPage(1);
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  {t('memory.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
