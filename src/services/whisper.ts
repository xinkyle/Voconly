/**
 * Whisper Service
 * Wraps the local transcribe-rs based commands for audio transcription
 */

import { invoke } from '../utils/tauri';
import { createLogger } from './log';

// 创建日志记录器
const log = createLogger('Whisper');

// Request/Response types for new local commands
interface TranscribeRequest {
  sceneId: string;
  audioPath: string;
  language?: string;
  translate?: boolean;
  initialPrompt?: string;
}

interface TranscribeResponse {
  text: string;
  language: string | null;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

interface LoadModelResult {
  success: boolean;
  modelId: string;
  error: string | null;
}

interface UnloadModelResult {
  success: boolean;
  modelId: string;
}

interface SwitchAsrModelResult {
  success: boolean;
  oldModelId: string | null;
  newModelId: string;
  error: string | null;
}


/**
 * Transcribe audio using local transcribe-rs backend
 * @param audioPath Path to audio file (WAV format recommended)
 * @param sceneId Scene ID to determine which model to use
 * @param language Optional language override (e.g., "zh", "en", "auto")
 * @returns Transcription result with text and metadata
 */
export async function transcribeAudio(
  audioPath: string,
  sceneId: string,
  language?: string
): Promise<TranscribeResponse> {
  const request: TranscribeRequest = {
    sceneId: sceneId,
    audioPath: audioPath,
    language,
  };

  return invoke<TranscribeResponse>('transcribe_audio', { request });
}

/**
 * Transcribe audio blob directly (saves to temp file, transcribes, then cleans up)
 * @param audioBlob Audio blob to transcribe
 * @param sceneId Scene ID to determine which model to use
 * @param language Optional language override
 * @returns Transcription text
 */
export async function transcribeAudioBlob(
  audioBlob: Blob,
  sceneId: string,
  language?: string
): Promise<string> {
  // Use backend API for file operations
  const relativePath = `tmp/recording_${Date.now()}.wav`;

  // Ensure tmp directory exists
  await invoke('create_dir', { relativePath: 'tmp' });

  // Convert blob to Uint8Array and write to temp file
  const arrayBuffer = await audioBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  await invoke('write_binary_file', {
    relativePath,
    data: Array.from(uint8Array)
  });

  // Get full path for transcription
  const tempAudioPath = await invoke<string>('get_full_path', { relativePath });

  try {
    // Transcribe audio
    const result = await transcribeAudio(tempAudioPath, sceneId, language);
    return result.text;
  } finally {
    // Clean up temp file
    try {
      await invoke('delete_file', { relativePath });
    } catch (e) {
      log.warn(`Failed to clean up temp audio file: ${e}`);
    }
  }
}

/**
 * Load model into memory
 * @param modelId Model ID to load
 * @returns Result indicating success or failure
 */
export async function loadModel(modelId: string, skipMemoryCheck?: boolean): Promise<LoadModelResult> {
  return invoke<LoadModelResult>('load_model_by_id', { modelId, skipMemoryCheck });
}

/**
 * Unload model from memory
 * @param modelId Model ID to unload
 * @returns Result indicating success or failure
 */
export async function unloadModel(modelId: string): Promise<UnloadModelResult> {
  return invoke<UnloadModelResult>('unload_model', { modelId });
}

/**
 * Switch ASR model (unload old model + load new model)
 * @param oldModelId Old model ID to unload (null if no old model)
 * @param newModelId New model ID to load
 * @returns Result indicating success or failure
 */
export async function switchAsrModel(
  oldModelId: string | null,
  newModelId: string
): Promise<SwitchAsrModelResult> {
  return invoke<SwitchAsrModelResult>('switch_asr_model', { oldModelId, newModelId });
}

/**
 * Check if a specific model is loaded
 * @param modelId Model ID to check
 * @returns true if model is loaded
 */
export async function isModelLoaded(modelId: string): Promise<boolean> {
  return invoke<boolean>('is_model_loaded', { modelId });
}

/**
 * Get model storage path
 * @param modelId Model ID
 * @returns Full path where model should be stored
 */
export async function getModelDownloadPath(modelId: string): Promise<string> {
  return invoke<string>('get_model_storage_path', { modelId });
}

/**
 * Check if model file exists locally
 * @param modelId Model ID
 * @returns true if model exists
 */
export async function checkModelExists(modelId: string): Promise<boolean> {
  return invoke<boolean>('check_model_exists_cmd', { modelId });
}

/**
 * Get available Whisper models
 */
export function getAvailableModels(): string[] {
  return ['whisper-tiny', 'whisper-base', 'whisper-small', 'whisper-medium', 'whisper-large', 'whisper-turbo'];
}

// Legacy compatibility - these are no-ops since we use local transcribe-rs
export async function startWhisperServer(_modelId: string): Promise<LoadModelResult> {
  log.debug('startWhisperServer is deprecated - using local transcribe-rs');
  return { success: true, modelId: _modelId, error: null };
}

export async function stopWhisperServer(): Promise<void> {
  log.debug('stopWhisperServer is deprecated - using local transcribe-rs');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function transcribe(_audioPath: string, _modelId: string): Promise<{ text: string; duration: number; language: string | null }> {
  log.error('transcribe is deprecated - use transcribeAudio instead');
  throw new Error('Use transcribeAudio instead');
}

export default {
  transcribeAudio,
  transcribeAudioBlob,
  loadModel,
  unloadModel,
  isModelLoaded,
  getModelDownloadPath,
  checkModelExists,
  getAvailableModels,
  startWhisperServer,
  stopWhisperServer,
  transcribe,
};