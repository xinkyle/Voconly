import type { FileTranscriptionRecord } from '../types';
import { invoke } from '../utils/tauri';
import { createLogger } from './log';

const log = createLogger('FileTranscription');

// 内存缓存
let historyCache: FileTranscriptionRecord[] | null = null;

/**
 * 转换音频文件为 WAV 格式
 * 使用 ffmpeg 将 MP3、M4A、OGG、WEBM 等格式转换为 WAV
 */
export async function convertAudioToWav(filePath: string): Promise<string> {
  try {
    log.info(`Converting audio to WAV: ${filePath}`);

    const wavPath = await invoke<string>('convert_audio_to_wav', { audioPath: filePath });

    log.info(`Audio converted to: ${wavPath}`);
    return wavPath;
  } catch (error) {
    log.error(`Failed to convert audio: ${error}`);
    throw error;
  }
}

/**
 * 转录音频文件
 */
export async function transcribeAudioFile(
  filePath: string,
  sceneId: string,
  language?: string
): Promise<{ text: string; duration: number }> {
  console.log('[FileTranscriptionService] transcribeAudioFile called', { filePath, sceneId, language });

  try {
    log.info(`Transcribing file: ${filePath} with scene: ${sceneId}`);

    // 检查文件格式，如果不是 WAV 则先转换
    const ext = filePath.split('.').pop()?.toLowerCase();
    let wavPath = filePath;

    if (ext && ext !== 'wav') {
      console.log('[FileTranscriptionService] Non-WAV format, will convert:', ext);
      log.info(`Non-WAV format detected: ${ext}, converting to WAV...`);
      wavPath = await convertAudioToWav(filePath);
      console.log('[FileTranscriptionService] Conversion complete:', wavPath);
      log.info(`Converted to WAV: ${wavPath}`);
    }

    console.log('[FileTranscriptionService] Calling invoke transcribe_audio...');

    const result = await invoke<{ text: string; language?: string; segments: Array<{ text: string; start: number; end: number }> }>(
      'transcribe_audio',
      {
        request: {
          sceneId,
          audioPath: wavPath,
          language: language || null,
        }
      }
    );

    // 获取音频时长（从 segments 中计算）
    const duration = result.segments.length > 0
      ? Math.ceil(result.segments[result.segments.length - 1].end)
      : 0;

    log.info(`Transcription complete: ${result.text.length} chars, ${duration}s`);

    return {
      text: result.text,
      duration,
    };
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