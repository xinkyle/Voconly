import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { FileTranscriptionRecord } from '../types';
import { exportFileRecord, getExportContent } from '../services/fileExport';
import type { ExportFormat } from '../services/fileExport';
import { useToast } from './ui/Toast';

export default function FileExportButton({ record, disabled = false }: { record: FileTranscriptionRecord; disabled?: boolean }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const content = getExportContent(record);
  const close = () => { if (!inFlight.current) { setOpen(false); trigger.current?.focus(); } };
  const handleExport = async (format: ExportFormat) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const path = await exportFileRecord(record, format);
      if (path) {
        setOpen(false);
        trigger.current?.focus();
        showToast({ type: 'success', title: t('file.export.saved') });
      }
    } catch (error) {
      showToast({ type: 'error', title: t('file.export.failed'), description: error instanceof Error ? error.message : String(error) });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return <>
    <button ref={trigger} type="button" disabled={disabled || saving || !content.text.trim()} onClick={() => setOpen(true)}
      className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">{t('file.export.action')}</button>
    {open && createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={event => { event.stopPropagation(); close(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') close();
        if (event.key === 'Tab') {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm" onClick={event => event.stopPropagation()}>
        <h2 id={titleId} className="font-semibold text-gray-900">{t('file.export.title')}</h2>
        <p className="text-sm text-gray-500 mt-2 break-words">{record.filename}</p>
        <p className="text-xs text-gray-600 mt-2">{t(`file.export.source.${content.source}`)}</p>
        <div className="flex gap-3 mt-5">
          <button autoFocus disabled={saving} onClick={() => handleExport('txt')} className="flex-1 px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40">TXT</button>
          <button disabled={saving} onClick={() => handleExport('docx')} className="flex-1 px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">Word (.docx)</button>
        </div>
        {saving && <p role="status" className="text-xs text-gray-500 mt-3">{t('file.export.saving')}</p>}
        <button disabled={saving} onClick={close} className="w-full mt-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40">{t('memory.cancel')}</button>
      </section>
    </div>, document.body)}
  </>;
}
