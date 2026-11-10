import type { FileTranscriptionRecord } from '../types';

export type ExportFormat = 'txt' | 'docx';
type ExportRecord = Pick<FileTranscriptionRecord, 'filename' | 'transcriptText' | 'processedText' | 'aiStatus'>;
interface ExportIO {
  save: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
}

export function getExportContent(record: ExportRecord, type?: 'original' | 'ai'): { text: string; source: 'ai' | 'previousAi' | 'original' } {
  // 如果指定了类型，直接返回对应内容
  if (type === 'original') {
    return { text: record.transcriptText, source: 'original' };
  }
  if (type === 'ai') {
    if (!record.processedText?.trim()) {
      return { text: '', source: 'original' };
    }
    return { text: record.processedText, source: record.aiStatus === 'error' ? 'previousAi' : 'ai' };
  }
  // 默认逻辑：优先 AI 结果，没有就用原文
  return record.processedText?.trim()
    ? { text: record.processedText, source: record.aiStatus === 'error' ? 'previousAi' : 'ai' }
    : { text: record.transcriptText, source: 'original' };
}

export function getExportFilename(filename: string, format: ExportFormat): string {
  let stem = (filename.split(/[/\\]/).pop() || '').replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*]/g, '_').split('').map(char => char.charCodeAt(0) < 32 ? '_' : char).join('')
    .replace(/[. ]+$/, '').trim() || 'transcript';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return `${stem}.${format}`;
}

export async function exportFileRecord(record: ExportRecord, format: ExportFormat, contentType?: 'original' | 'ai', io?: ExportIO): Promise<string | null> {
  const content = getExportContent(record, contentType);
  if (!content.text.trim()) throw new Error('EMPTY_EXPORT');
  const operations = io || {
    save: (options: Parameters<ExportIO['save']>[0]) => import('@tauri-apps/plugin-dialog').then(api => api.save(options)),
    write: (path: string, bytes: Uint8Array) => import('@tauri-apps/plugin-fs').then(api => api.writeFile(path, bytes)),
  };
  const path = await operations.save({
    defaultPath: getExportFilename(record.filename, format),
    filters: [{ name: format === 'docx' ? 'Word (.docx)' : 'Text (.txt)', extensions: [format] }],
  });
  if (!path) return null;
  const bytes = format === 'txt'
    ? new TextEncoder().encode(`\uFEFF${content.text}`)
    : await (await import('./fileWordExport.ts')).createWordBytes(content.text, content.source !== 'original', record.filename);
  // Use the exact path granted by the save dialog; do not append an extension afterward.
  await operations.write(path, bytes);
  return path;
}
