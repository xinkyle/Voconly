import type { FileTranscriptionRecord } from '../types';
import { invoke } from '../utils/tauri';
import { createLogger } from './log';
import { listen } from '@tauri-apps/api/event';

const log = createLogger('FileTranscription');

// 内存缓存
let historyCache: FileTranscriptionRecord[] | null = null;

/**
 * 获取音频时长
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const duration = await invoke<number>('get_audio_duration', { audioPath: filePath });
    return duration;
  } catch (error) {
    log.error(`Failed to get audio duration: ${error}`);
    return 0;
  }
}

/**
 * 转录音频文件（使用流式API）
 */
export async function transcribeAudioFile(
  filePath: string,
  sceneId: string,
  language?: string,
  options?: {
    fileSize?: number;
    audioDuration?: number;
    onProgress?: (current: number, total: number, percent: number) => void;
  }
): Promise<{ text: string; duration: number }> {
  console.log('[FileTranscriptionService] transcribeAudioFile called', { filePath, sceneId, language });

  try {
    log.info(`Transcribing file: ${filePath} with scene: ${sceneId}`);

    // 监听转录进度
    const unlisten = await listen<{ current: number; total: number; percent: number }>(
      'transcribe-streaming-progress',
      (event) => {
        if (options?.onProgress) {
          // 流式API返回的进度已经是完整进度，直接传递
          options.onProgress(event.payload.current, event.payload.total, event.payload.percent);
        }
      }
    );

    try {
      const result = await invoke<{ text: string; language?: string; segments: Array<{ text: string; start: number; end: number }> }>(
        'transcribe_audio_streaming',
        {
          request: {
            sceneId,
            audioPath: filePath,
            language: language || null,
          }
        }
      );

      // 优先使用传入的音频时长，否则从 segments 计算
      const duration = options?.audioDuration
        ? options.audioDuration
        : (result.segments.length > 0
          ? Math.ceil(result.segments[result.segments.length - 1].end)
          : 0);

      log.info(`Transcription complete: ${result.text.length} chars, ${duration}s`);

      return {
        text: result.text,
        duration,
      };
    } finally {
      unlisten();
    }
  } catch (error) {
    log.error(`Failed to transcribe file: ${error}`);
    throw error;
  }
}

/**
 * 创建文件转录记录
 */
export async function createFileTranscriptionRecord(
  filePath: string,
  fileName: string,
  fileSize: number,
  transcriptText: string,
  duration: number,
  asrModelId: string
): Promise<FileTranscriptionRecord> {
  const record: FileTranscriptionRecord = {
    id: `ft-${Date.now()}`,
    filename: fileName,
    filePath,
    fileSize,
    duration,
    transcriptText,
    wordCount: transcriptText.length,
    timestamp: Date.now(),
    asrModelId,
  };

  await saveFileTranscription(record);
  return record;
}

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