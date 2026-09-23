import type { FileTranscriptionRecord } from '../types';
import { invoke } from '../utils/tauri';
import { createLogger } from './log';
import { listen } from '@tauri-apps/api/event';

const log = createLogger('FileTranscription');

// 内存缓存
let historyCache: FileTranscriptionRecord[] | null = null;

// 大文件阈值（字节）- 10MB
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

// 分片时长（秒）
const CHUNK_DURATION = 30;

// 片段重叠时长（秒）
const CHUNK_OVERLAP = 2;

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
 * 分割音频文件
 */
export async function splitAudioFile(
  audioPath: string,
  chunkDuration: number = CHUNK_DURATION,
  overlap: number = CHUNK_OVERLAP,
  onProgress?: (current: number, total: number, percent: number) => void
): Promise<string[]> {
  log.info(`Splitting audio file: ${audioPath}`);

  // 监听分割进度
  const unlisten = await listen<{ current: number; total: number; percent: number }>(
    'audio-split-progress',
    (event) => {
      if (onProgress) {
        onProgress(event.payload.current, event.payload.total, event.payload.percent);
      }
    }
  );

  try {
    const chunkPaths = await invoke<string[]>('split_audio_file', {
      audioPath,
      chunkDuration,
      overlap,
    });

    log.info(`Audio split into ${chunkPaths.length} chunks`);
    return chunkPaths;
  } finally {
    unlisten();
  }
}

/**
 * 分片转录音频
 */
export async function transcribeAudioChunks(
  chunkPaths: string[],
  sceneId: string,
  language?: string,
  onProgress?: (current: number, total: number, percent: number) => void
): Promise<{ text: string; duration: number }> {
  log.info(`Transcribing ${chunkPaths.length} chunks`);

  // 监听转录进度
  const unlisten = await listen<{ current: number; total: number; percent: number }>(
    'transcribe-chunk-progress',
    (event) => {
      if (onProgress) {
        onProgress(event.payload.current, event.payload.total, event.payload.percent);
      }
    }
  );

  try {
    const result = await invoke<{ text: string; language?: string; segments: Array<{ text: string; start: number; end: number }> }>(
      'transcribe_audio_chunks',
      {
        chunkPaths,
        sceneId,
        language: language || null,
      }
    );

    const duration = result.segments.length > 0
      ? Math.ceil(result.segments[result.segments.length - 1].end)
      : 0;

    log.info(`Chunk transcription complete: ${result.text.length} chars, ${duration}s`);

    return {
      text: result.text,
      duration,
    };
  } finally {
    unlisten();
  }
}

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
 * 自动判断是否需要分割大文件
 */
export async function transcribeAudioFile(
  filePath: string,
  sceneId: string,
  language?: string,
  options?: {
    fileSize?: number;
    audioDuration?: number;  // 音频时长（秒），优先使用
    onProgress?: (current: number, total: number, percent: number) => void;
  }
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

    // 判断是否需要分割
    const fileSize = options?.fileSize || 0;
    const needSplit = fileSize > LARGE_FILE_THRESHOLD;

    if (needSplit) {
      log.info(`Large file detected (${(fileSize / 1024 / 1024).toFixed(2)}MB), will split`);
      console.log('[FileTranscriptionService] Large file, splitting...');

      // 分割音频（占前 20% 进度）
      const chunkPaths = await splitAudioFile(
        wavPath,
        CHUNK_DURATION,
        CHUNK_OVERLAP,
        (current, total, percent) => {
          if (options?.onProgress) {
            // 分割进度映射到 0% - 20%
            options.onProgress(current, total, percent * 0.2);
          }
        }
      );

      // 分片转录（占后 80% 进度）
      return await transcribeAudioChunks(
        chunkPaths,
        sceneId,
        language,
        (current, total, percent) => {
          if (options?.onProgress) {
            // 转录进度映射到 20% - 100%
            options.onProgress(current, total, 20 + percent * 0.8);
          }
        }
      );
    } else {
      // 小文件，直接转录
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