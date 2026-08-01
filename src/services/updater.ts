// src/services/updater.ts
// 使用 tauri-plugin-updater 实现自动更新功能

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
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
 * 更新检查结果
 */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  versionInfo?: {
    version: string;
    currentVersion: string;
    date?: string;
    body?: string;
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
 * 检查更新
 * 使用 tauri-plugin-updater 的 check 函数
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  log.debug('Checking for updates using tauri-plugin-updater...');

  try {
    const update = await check();

    if (update) {
      log.info('Update available: ' + update.version);
      return {
        hasUpdate: true,
        versionInfo: {
          version: update.version,
          currentVersion: update.currentVersion,
          date: update.date,
          body: update.body,
        },
        currentVersion: update.currentVersion,
      };
    } else {
      log.info('No update available');
      return {
        hasUpdate: false,
        currentVersion: '',
      };
    }
  } catch (error) {
    log.error('Failed to check for updates: ' + String(error));
    throw error;
  }
}

/**
 * 下载并安装更新
 * @param onProgress 进度回调
 */
export async function downloadAndInstallUpdate(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  log.info('[Updater] Starting download and install...');

  try {
    const update = await check();

    if (!update) {
      log.warn('[Updater] No update available to download');
      return;
    }

    let downloadedBytes = 0;
    let contentLength = 0;

    await update.download((event) => {
      switch (event.event) {
        case 'Started':
          downloadedBytes = 0;
          contentLength = event.data.contentLength ?? 0;
          log.info('[Updater] Download started, content length: ' + contentLength);
          onProgress?.({
            downloaded: 0,
            totalSize: contentLength,
            progress: 0,
          });
          break;
        case 'Progress':
          downloadedBytes += event.data.chunkLength;
          const progress = contentLength > 0
            ? Math.round((downloadedBytes / contentLength) * 100)
            : 0;
          onProgress?.({
            downloaded: downloadedBytes,
            totalSize: contentLength,
            progress: Math.min(progress, 100),
          });
          break;
        case 'Finished':
          log.info('[Updater] Download finished');
          onProgress?.({
            downloaded: contentLength,
            totalSize: contentLength,
            progress: 100,
          });
          break;
      }
    });

    // Download complete, now install and relaunch
    log.info('[Updater] Installing update...');
    await update.install();
    log.info('[Updater] Update installed, relaunching...');
    await relaunch();
  } catch (error) {
    log.error('[Updater] Failed to download and install update: ' + String(error));
    throw error;
  }
}

/**
 * 重启应用
 */
export async function restartApp(): Promise<void> {
  log.debug('Restarting application...');
  await relaunch();
}