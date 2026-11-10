import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { FileTranscriptionRecord } from '../types';

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
  const text = tab === 'ai' ? record.processedText || '' : record.transcriptText;
  const error = record.aiError?.startsWith('CONTEXT_TOO_LONG:')
    ? t('file.ai.tooLong') : record.aiError === 'EMPTY_AI_RESPONSE' ? t('file.ai.emptyResponse') : record.aiError;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="file-result-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col p-6" onClick={event => event.stopPropagation()}
        onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="file-result-title" className="font-semibold truncate">{record.filename}</h2>
          <button autoFocus onClick={onClose} className="text-sm px-3 py-1 rounded hover:bg-gray-100">{t('common.close')}</button>
        </div>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setTab('original')} aria-pressed={tab === 'original'} className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'original' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>{t('file.ai.original')}</button>
          <button onClick={() => setTab('ai')} disabled={!record.processedText} aria-pressed={tab === 'ai'} className={`px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 ${tab === 'ai' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>{t('file.ai.result')}</button>
        </div>
        {record.aiStatus === 'error' && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg mb-3">{t('file.ai.failedPreserved')} {error}</p>}
        {tab === 'ai' && <p className="text-xs text-gray-500 mb-3">{record.aiPromptName} · {record.aiModelId}</p>}
        <div className="whitespace-pre-wrap break-words overflow-y-auto flex-1 min-h-[160px] text-sm leading-7 border rounded-xl p-4">{text}</div>
        <div className="flex items-center justify-between gap-3 mt-4">
          <button disabled={busy || !canProcess} onClick={onProcess} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40">
            {busy ? t('file.ai.processing') : record.processedText ? t('file.ai.reprocess') : t('file.ai.process')}
          </button>
          <button onClick={() => onCopy(text)} disabled={!text} className="px-4 py-2 rounded-lg bg-gray-100 text-sm disabled:opacity-40">{t('common.copy')}</button>
        </div>
        <p className="text-xs text-gray-500 mt-3">{t('file.ai.reprocessHint')}</p>
      </section>
    </div>, document.body,
  );
}
