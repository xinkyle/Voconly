import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { FileTranscriptionRecord } from '../types';
import FileExportButton from './FileExportButton';

export default function FileResultDialog({ record, busy, canProcess, onProcess, onCopy, onClose }: {
  record: FileTranscriptionRecord;
  busy: boolean;
  canProcess: boolean;
  onProcess: () => void;
  onCopy: (text: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'original' | 'ai'>(record.processedText ? 'ai' : 'original');
  const [showProcessConfirm, setShowProcessConfirm] = useState(false);
  const text = tab === 'ai' ? record.processedText || '' : record.transcriptText;
  const error = record.aiError?.startsWith('CONTEXT_TOO_LONG:')
    ? t('file.ai.tooLong') : record.aiError === 'EMPTY_AI_RESPONSE' ? t('file.ai.emptyResponse') : record.aiError;

  const dialog = createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="file-result-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col p-6" onClick={event => event.stopPropagation()}
        onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="file-result-title" className="font-semibold truncate">{record.filename}</h2>
          <button autoFocus onClick={onClose} className="text-sm px-3 py-1 rounded hover:bg-gray-100">{t('common.close')}</button>
        </div>
        <div className="flex justify-center mb-4">
          <div className="inline-flex bg-gray-100/80 p-1 rounded-xl">
            <button
              onClick={() => setTab('original')}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                tab === 'original' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('file.ai.original')}
            </button>
            <button
              onClick={() => setTab('ai')}
              disabled={!record.processedText}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                tab === 'ai' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              } ${!record.processedText ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {t('file.ai.result')}
            </button>
          </div>
        </div>
        {record.aiStatus === 'error' && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg mb-3">{t('file.ai.failedPreserved')} {error}</p>}
        {tab === 'ai' && <p className="text-xs text-gray-500 mb-3">{record.aiPromptName} · {record.aiModelId}</p>}
        <div className="whitespace-pre-wrap break-words overflow-y-auto flex-1 min-h-[160px] text-sm leading-7 border rounded-xl p-4">{text}</div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button disabled={busy || !canProcess} onClick={() => setShowProcessConfirm(true)}
            className="px-2.5 py-2 text-xs rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? t('file.ai.processing') : record.processedText ? t('file.ai.reprocess') : t('file.ai.process')}
          </button>
          <FileExportButton record={record} disabled={busy} contentType={tab} />
          <button type="button" onClick={() => onCopy(text)} disabled={!text} title={t('common.copy')} aria-label={t('common.copy')}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">{t('file.ai.reprocessHint')}</p>
      </section>
    </div>, document.body,
  );

  return <>
    {dialog}
    {showProcessConfirm && createPortal(
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowProcessConfirm(false)}>
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl animate-scale-in" onClick={e => e.stopPropagation()}>
          <div className="text-center">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {record.processedText ? t('file.ai.confirmReprocess') : t('file.ai.confirmProcess')}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {record.processedText ? t('file.ai.confirmReprocessDesc') : t('file.ai.confirmProcessDesc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowProcessConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {t('memory.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowProcessConfirm(false);
                  onProcess();
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                {t('memory.confirm')}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>;
}
