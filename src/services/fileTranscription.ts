import type { FileTranscriptionRecord } from '../types';
import { invoke } from '../utils/tauri';
import { createLogger } from './log';

const log = createLogger('FileTranscription');

// 内存缓存
let historyCache: FileTranscriptionRecord[] | null = null;

/**
 * 加载文件转录历史记录
 */
export async function loadFileTranscriptionHistory(): Promise<FileTranscriptionRecord[]> {
  if (historyCache !== null) {
    return historyCache;
  }

  try {
    const history = await invoke<FileTranscriptionRecord[]>('load_file_transcription_history');
    historyCache = history;
    return history;
  } catch (error) {
    log.error(`Failed to load file transcription history: ${error}`);
    historyCache = [];
    return [];
  }
}

/**
 * 保存文件转录记录
 */
export async function saveFileTranscription(record: FileTranscriptionRecord): Promise<void> {
  try {
    await invoke('save_file_transcription', { record });

    // 更新缓存
    if (historyCache !== null) {
      historyCache = [record, ...historyCache].slice(0, 100);
    }
  } catch (error) {
    log.error(`Failed to save file transcription: ${error}`);
    throw error;
  }
}

/**
 * 删除文件转录记录
 */
export async function deleteFileTranscription(id: string): Promise<void> {
  try {
    await invoke('delete_file_transcription', { id });

    // 更新缓存
    if (historyCache !== null) {
      historyCache = historyCache.filter(r => r.id !== id);
    }
  } catch (error) {
    log.error(`Failed to delete file transcription: ${error}`);
    throw error;
  }
}

/**
 * 清空文件转录历史
 */
export async function clearFileTranscriptionHistory(): Promise<void> {
  historyCache = [];

  try {
    await invoke('clear_file_transcription_history');
  } catch (error) {
    log.error(`Failed to clear file transcription history: ${error}`);
  }
}

/**
 * 清除缓存
 */
export function clearFileTranscriptionCache(): void {
  historyCache = null;
}