/**
 * Model Download Service
 * Handles downloading models from multiple sources (ModelScope, HuggingFace, etc.)
 */

import { invoke } from '../utils/tauri';
import { listen } from '@tauri-apps/api/event';
import type { DownloadSource } from '../types';
import { createLogger } from './log';

// 创建日志记录器
const log = createLogger('Downloader');

// Download source info (matches Rust DownloadSourceInfo - camelCase)
interface DownloadSourceInfo {
  name: string;
  url: string;
  isChinaAccessible: boolean;
  priority: number;
}

// Download progress from Rust backend (matches Rust DownloadProgress - camelCase)
interface DownloadProgressEvent {
  modelId: string;
  downloaded: number;
  total: number;
  percentage: number;
  speed: number;
  source: string | null;
}

/**
 * Download progress information (exported type)
 */
export interface DownloadProgress {
  modelId: string;
  downloaded: number; // bytes downloaded
  total: number; // total bytes
  percentage: number; // 0-100
  speed: number; // bytes per second
  source?: string; // download source name (e.g., "ModelScope", "HuggingFace")
}

/**
 * Download result (returned by download functions)
 */
export interface DownloadResult {
  success: boolean;
  modelId: string;
  path?: string;
  error?: string;
  source?: string;
}

/**
 * Download progress callback type
 */
export type DownloadProgressCallback = (progress: DownloadProgress) => void;

// ============== New Multi-Source Download Functions ==============

/**
 * Subscribe to download progress events
 * @param callback - Function to call with download progress
 * @returns Unsubscribe function
 */
export async function subscribeToDownloadProgress(
  callback: DownloadProgressCallback
): Promise<() => void> {
  const unlisten = await listen<DownloadProgressEvent>('download-progress', (event) => {
    callback({
      modelId: event.payload.modelId,
      downloaded: event.payload.downloaded,
      total: event.payload.total,
      percentage: event.payload.percentage,
      speed: event.payload.speed,
      source: event.payload.source || undefined,
    });
  });
  return unlisten;
}

/**
 * Download complete event payload
 */
export interface DownloadCompleteEvent {
  modelId: string;
  path: string;
}

/**
 * Download error event payload
 */
export interface DownloadErrorEvent {
  modelId: string;
  error: string;
}

/**
 * Subscribe to download complete events
 * @param callback - Function to call when download completes
 * @returns Unsubscribe function
 */
export async function subscribeToDownloadComplete(
  callback: (event: DownloadCompleteEvent) => void
): Promise<() => void> {
  const unlisten = await listen<{ modelId: string; path: string }>('download-complete', (event) => {
    callback({
      modelId: event.payload.modelId,
      path: event.payload.path,
    });
  });
  return unlisten;
}

/**
 * Subscribe to download error events
 * @param callback - Function to call when download fails
 * @returns Unsubscribe function
 */
export async function subscribeToDownloadError(
  callback: (event: DownloadErrorEvent) => void
): Promise<() => void> {
  const unlisten = await listen<{ modelId: string; error: string }>('download-error', (event) => {
    callback({
      modelId: event.payload.modelId,
      error: event.payload.error,
    });
  });
  return unlisten;
}

/**
 * Download a model with multiple source support
 * Automatically selects the best source based on priority and China accessibility
 * @param modelId - Model ID (e.g., "whisper-tiny", "sensevoice-small")
 * @param sources - Array of download sources
 * @param preferredSource - Preferred source name (optional, e.g., "ModelScope")
 * @param preferChina - Whether to prefer China-accessible sources
 */
export async function downloadModelWithSource(
  modelId: string,
  sources: DownloadSource[],
  preferredSource?: string,
  preferChina?: boolean
): Promise<DownloadResult> {
  try {
    // Convert sources to Rust format (camelCase)
    const sourceInfos: DownloadSourceInfo[] = sources.map(s => ({
      name: s.name,
      url: s.url,
      isChinaAccessible: s.isChinaAccessible,
      priority: s.priority,
    }));

    const params = {
      modelId,
      sources: sourceInfos,
      preferredSource: preferredSource || null,
      preferChina: preferChina ?? null,
    };
    console.log('[Downloader] Calling download_model_with_source with params:', JSON.stringify(params, null, 2));

    const result = await invoke<{
      success: boolean;
      modelId: string;
      path: string | null;
      error: string | null;
      source: string | null;
    }>('download_model_with_source', params);

    console.log('[Downloader] Download result:', JSON.stringify(result));
    return {
      success: result.success,
      modelId: result.modelId,
      path: result.path || undefined,
      error: result.error || undefined,
      source: result.source || undefined,
    };
  } catch (error) {
    console.error('[Downloader] Download error:', error);
    return {
      success: false,
      modelId: modelId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Download a model from a direct URL
 * @param modelId - Model ID
 * @param url - Direct download URL
 * @param backend - Backend type ("whisper" or "onnx")
 */
export async function downloadModelFromUrl(
  modelId: string,
  url: string,
  backend?: 'whisper' | 'onnx'
): Promise<DownloadResult> {
  try {
    const result = await invoke<{
      success: boolean;
      modelId: string;
      path: string | null;
      error: string | null;
      source: string | null;
    }>('download_model_from_url', {
      modelId,
      url,
      backend: backend || null,
    });

    return {
      success: result.success,
      modelId: result.modelId,
      path: result.path || undefined,
      error: result.error || undefined,
      source: result.source || undefined,
    };
  } catch (error) {
    return {
      success: false,
      modelId: modelId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Cancel an ongoing model download
 * @param modelId - The model ID to cancel download for
 * @returns true if the download was found and cancelled, false if no download was found
 */
export async function cancelModelDownload(modelId: string): Promise<boolean> {
  try {
    const result = await invoke<boolean>('cancel_model_download', { modelId });
    log.info(`Cancel download for ${modelId}: ${result}`);
    return result;
  } catch (error) {
    log.error(`Failed to cancel download for ${modelId}: ${error}`);
    return false;
  }
}

/**
 * Get list of models currently being downloaded
 * @returns Array of model IDs that are currently downloading
 */
export async function getDownloadingModelIds(): Promise<string[]> {
  try {
    const result = await invoke<string[]>('get_downloading_model_ids');
    return result;
  } catch (error) {
    log.error(`Failed to get downloading models: ${error}`);
    return [];
  }
}

/**
 * Subscribe to download cancelled events
 * @param callback - Function to call when download is cancelled
 * @returns Unsubscribe function
 */
export async function subscribeToDownloadCancelled(
  callback: (event: DownloadCancelledEvent) => void
): Promise<() => void> {
  const unlisten = await listen<{ modelId: string; downloaded: number }>('download-cancelled', (event) => {
    callback({
      modelId: event.payload.modelId,
      downloaded: event.payload.downloaded,
    });
  });
  return unlisten;
}

/**
 * Download cancelled event payload
 */
export interface DownloadCancelledEvent {
  modelId: string;
  downloaded: number; // bytes downloaded before cancellation
}

/**
 * Detect if the current language is Chinese
 * Used to prefer China-accessible download sources for Chinese users
 * @returns true if the detected language is Chinese
 */
export function isChineseLanguage(): boolean {
  // Check localStorage first (set by i18next)
  const storedLang = localStorage.getItem('i18nextLng');
  if (storedLang) {
    return storedLang.startsWith('zh');
  }

  // Check navigator language
  const navLang = navigator.language || (navigator as any).userLanguage;
  if (navLang) {
    return navLang.startsWith('zh');
  }

  // Default to true for better China accessibility
  return true;
}

/**
 * Legacy download function - calls downloadModelWithSource with language-based source selection
 * Automatically prefers China-accessible sources for Chinese users
 * Kept for backward compatibility
 * @param modelId - Model ID (e.g., "whisper-tiny")
 * @deprecated Use downloadModelWithSource or downloadModelFromUrl instead
 */
export async function downloadModel(modelId: string): Promise<DownloadResult> {
  // Get model info from config (if available)
  const { loadConfig } = await import('./config');
  try {
    const config = await loadConfig();
    const model = config.models?.find(m => m.id === modelId);

    if (model && model.downloadUrls && model.downloadUrls.length > 0) {
      // Auto-detect if user is Chinese to prefer China-accessible sources
      const preferChina = isChineseLanguage();

      log.info(`Downloading model ${modelId}, preferChina: ${preferChina} (detected language: ${localStorage.getItem('i18nextLng') || navigator.language})`);

      // Use multi-source download
      return downloadModelWithSource(
        modelId,
        model.downloadUrls,
        undefined,
        preferChina
      );
    }
  } catch (e) {
    log.warn(`Failed to load config, falling back to direct URL: ${e}`);
  }

  // Fallback: try direct download (will likely fail without valid URL)
  return {
    success: false,
    modelId: modelId,
    error: 'No download URLs available for this model',
  };
}

// ============== Legacy Helper Functions (for backward compatibility) ==============

/**
 * Get model storage path from Rust backend
 */
export async function getModelStoragePath(): Promise<string> {
  return invoke<string>('get_model_storage_path_cmd');
}

/**
 * Check if model already exists
 */
export async function checkModelExists(modelId: string): Promise<boolean> {
  return invoke<boolean>('check_model_exists_cmd', { modelId });
}

/**
 * Get model download path from Rust backend
 * @deprecated Use getModelStoragePath instead
 */
export async function getModelDownloadPath(modelId: string): Promise<string> {
  return invoke<string>('get_model_storage_path_cmd', { modelId });
}

/**
 * Delete a downloaded model
 */
export async function deleteModel(modelId: string): Promise<boolean> {
  try {
    const storagePath = await invoke<string>('get_model_storage_path_cmd', { modelId });

    // Use Tauri fs plugin to remove file
    const { exists, remove } = await import('@tauri-apps/plugin-fs');
    const fileExists = await exists(storagePath);

    if (fileExists) {
      await remove(storagePath);
    }

    return true;
  } catch (error) {
    log.error(`Failed to delete model: ${error}`);
    return false;
  }
}

/**
 * Download LLM model by preset ID
 * Uses the LLM preset list to find download URLs
 * @param presetId - LLM preset ID (e.g., "Qwen3-4B-Instruct-2507-Q4_K_M")
 * @param preferredSource - Preferred source name (optional)
 * @param preferChina - Whether to prefer China-accessible sources
 */
export async function downloadLlmModel(
  presetId: string,
  preferredSource?: string,
  preferChina?: boolean
): Promise<DownloadResult> {
  try {
    const result = await invoke<{
      success: boolean;
      modelId: string;
      path: string | null;
      error: string | null;
      source: string | null;
    }>('download_llm_model', {
      request: {
        presetId: presetId,
        preferredSource: preferredSource || null,
        preferChina: preferChina ?? null,
      },
    });

    return {
      success: result.success,
      modelId: result.modelId,
      path: result.path || undefined,
      error: result.error || undefined,
      source: result.source || undefined,
    };
  } catch (error) {
    return {
      success: false,
      modelId: presetId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}