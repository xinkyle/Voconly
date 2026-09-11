// src/services/updater.ts
// 使用 Rust 端 V2 命令检查和安装更新

import { invoke } from '@tauri-apps/api/core';
import { createLogger } from './log';

const log = createLogger('updater');

/**
 * 更新状态（从 Rust 端获取）
 */
export interface UpdateState {
  lastCheckDate: string;
  lastVersionChecked: string;
  remindCountToday: number;
  downloadedFile?: string;
  downloadComplete: boolean;
}

/**
 * 更新检查结果
 */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  versionInfo?: {
    version: string;
    currentVersion: string;
    date?: string;
    body?: string;
    downloadUrl?: string;
    signature?: string;
  };
  currentVersion: string;
}

/**
 * 下载进度事件
 */
export interface DownloadProgress {
  downloaded: number;
  totalSize: number;
  progress: number;  // 0-100
}

/**
 * 获取当前应用版本
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    const version = await invoke<string>('get_app_version');
    log.debug('Current version: ' + version);
    return version;
  } catch (error) {
    log.error('Failed to get current version: ' + String(error));
    return 'unknown';
  }
}

/**
 * 获取更新状态
 */
export async function getUpdateState(): Promise<UpdateState> {
  try {
    const state = await invoke<UpdateState>('get_update_state');
    log.debug('Update state: ' + JSON.stringify(state));
    return state;
  } catch (error) {
    log.error('Failed to get update state: ' + String(error));
    return {
      lastCheckDate: '',
      lastVersionChecked: '',
      remindCountToday: 0,
      downloadComplete: false,
    };
  }
}

/**
 * 检查更新（调用 Rust 端 V2 命令）
 * @param language 当前语言，用于选择下载源（中文用户用 Gitee，其他用 GitHub）
 */
export async function checkForUpdates(language?: string): Promise<UpdateCheckResult> {
  log.info('[Updater] Checking for updates (V2)...');

  try {
    // 调用 Rust 端的 check_for_updates_v2 命令
    const updateInfo = await invoke<{
      version: string;
      current_version: string;
      date?: string;
      notes?: string;
      url: string;
      signature: string;
    } | null>('check_for_updates_v2', { language });

    if (!updateInfo) {
      // 没有新版本
      const currentVersion = await getCurrentVersion();
      log.info('[Updater] Already on latest version');
      return {
        hasUpdate: false,
        currentVersion,
      };
    }

    log.info(`[Updater] Update available: ${updateInfo.current_version} -> ${updateInfo.version}`);

    return {
      hasUpdate: true,
      versionInfo: {
        version: updateInfo.version,
        currentVersion: updateInfo.current_version,
        date: updateInfo.date,
        body: updateInfo.notes,
        downloadUrl: updateInfo.url,
        signature: updateInfo.signature,
      },
      currentVersion: updateInfo.current_version,
    };
  } catch (error) {
    log.error('[Updater] Failed to check for updates: ' + String(error));
    throw error;
  }
}

/**
 * 下载并安装更新
 * 使用 Rust 端 V2 命令进行下载安装
 * @param onProgress 进度回调
 * @param language 当前语言，用于选择下载源
 */
export async function downloadAndInstallUpdate(
  onProgress?: (progress: DownloadProgress) => void,
  language?: string
): Promise<void> {
  log.info('[Updater] Starting download and install (V2)...');

  try {
    // 先检查更新，获取下载信息
    const checkResult = await checkForUpdates(language);

    if (!checkResult.hasUpdate || !checkResult.versionInfo?.downloadUrl) {
      log.warn('[Updater] No update available or no download URL');
      throw new Error('No update available');
    }

    const { downloadUrl, signature, version } = checkResult.versionInfo;

    if (!downloadUrl || !signature) {
      throw new Error('Missing download URL or signature');
    }

    log.info(`[Updater] Download URL: ${downloadUrl}`);
    log.info(`[Updater] Version: ${version}`);

    // 监听下载进度事件
    let unlisten: (() => void) | null = null;

    try {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<DownloadProgress>('download-progress', (event) => {
        onProgress?.(event.payload);
      });
    } catch {
      log.warn('[Updater] Failed to listen to download progress events');
    }

    // 调用 Rust 端的下载安装命令
    try {
      await invoke('download_and_install_update_v2', {
        url: downloadUrl,
        signature,
      });

      log.info('[Updater] Download and install complete');

      // 注意：在 Windows 上，Rust 端会自动退出应用并启动安装程序
      // 在 macOS 上，Rust 端会自动重启应用
    } finally {
      unlisten?.();
    }
  } catch (error) {
    log.error('[Updater] Failed to download and install update: ' + String(error));
    throw error;
  }
}

/**
 * 取消下载
 */
export async function cancelDownload(): Promise<void> {
  try {
    await invoke('cancel_download_v2');
    log.info('[Updater] Download cancelled');
  } catch (error) {
    log.error('[Updater] Failed to cancel download: ' + String(error));
    throw error;
  }
}

/**
 * 重启应用
 */
export async function restartApp(): Promise<void> {
  log.debug('Restarting application...');
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}