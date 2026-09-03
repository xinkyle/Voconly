// src/services/updater.ts
// 动态获取最新版本信息，支持 GitHub 和 Gitee

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
 * Release Asset
 */
interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/**
 * GitHub/Gitee Release API 返回格式
 */
interface ReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  assets: ReleaseAsset[];
}

/**
 * latest.json 文件格式
 */
interface LatestJson {
  version: string;
  date: string;
  notes: string;
  pub_date?: string;
  platforms?: Record<string, {
    signature: string;
    url: string;
  }>;
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
 * 比较版本号，返回 true 表示 remote 版本更高
 */
function isNewerVersion(current: string, remote: string): boolean {
  const currentParts = current.split('.').map(p => parseInt(p, 10) || 0);
  const remoteParts = remote.split('.').map(p => parseInt(p, 10) || 0);

  for (let i = 0; i < Math.max(currentParts.length, remoteParts.length); i++) {
    const currentVal = currentParts[i] || 0;
    const remoteVal = remoteParts[i] || 0;
    if (remoteVal > currentVal) return true;
    if (remoteVal < currentVal) return false;
  }
  return false;
}

/**
 * 从 GitHub/Gitee API 获取最新 release 信息
 * 根据当前语言选择 API 源：
 * - 中文用户 → Gitee（国内下载更快）
 * - 其他语言用户 → GitHub（国际用户）
 */
async function fetchLatestRelease(language?: string): Promise<ReleaseInfo> {
  // 根据语言选择 API 源
  const isChineseUser = language?.startsWith('zh') ?? false;

  const urls = isChineseUser
    ? [
        'https://gitee.com/api/v5/repos/xingkyle/Voconly/releases/latest',  // 首选 Gitee
        'https://api.github.com/repos/xinkyle/Voconly/releases/latest',      // 备用 GitHub
      ]
    : [
        'https://api.github.com/repos/xinkyle/Voconly/releases/latest',       // 首选 GitHub
        'https://gitee.com/api/v5/repos/xingkyle/Voconly/releases/latest',   // 备用 Gitee
      ];

  log.info(`[Updater] Language: ${language}, using ${isChineseUser ? 'Gitee' : 'GitHub'} as primary source`);

  const errors: string[] = [];

  for (const url of urls) {
    try {
      log.debug(`Fetching release info from: ${url}`);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      log.info(`Got release info from ${url}: ${data.tag_name}`);
      return data;
    } catch (err) {
      errors.push(`${url}: ${String(err)}`);
      log.warn(`Failed to fetch from ${url}: ${err}`);
    }
  }

  throw new Error(`Failed to fetch latest release from all sources: ${errors.join('; ')}`);
}

/**
 * 从 release assets 中找到 latest.json 的下载链接
 */
function findLatestJsonUrl(release: ReleaseInfo): string | null {
  const asset = release.assets.find(a => a.name === 'latest.json');
  return asset?.browser_download_url ?? null;
}

/**
 * 下载 latest.json 并解析
 */
async function fetchLatestJson(url: string): Promise<LatestJson> {
  log.debug(`Fetching latest.json from: ${url}`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch latest.json: HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * 检查更新（新逻辑：动态获取最新版本信息）
 */
/**
 * 检查更新
 * @param language 当前语言，用于选择下载源（中文用户用 Gitee，其他用 GitHub）
 */
export async function checkForUpdates(language?: string): Promise<UpdateCheckResult> {
  log.info('[Updater] Checking for updates (dynamic mode)...');

  try {
    // 获取当前版本
    const currentVersion = await getCurrentVersion();
    log.info(`[Updater] Current version: ${currentVersion}`);

    // 从 GitHub/Gitee API 获取最新 release 信息（根据语言选择源）
    const release = await fetchLatestRelease(language);

    // 从 release 中提取版本号（去掉 v 前缀）
    const remoteVersion = release.tag_name.replace(/^v/, '');
    log.info(`[Updater] Remote version: ${remoteVersion}`);

    // 比较版本
    if (!isNewerVersion(currentVersion, remoteVersion)) {
      log.info('[Updater] Already on latest version');
      return {
        hasUpdate: false,
        currentVersion,
      };
    }

    // 有新版本，获取 latest.json（用于签名和下载链接）
    const latestJsonUrl = findLatestJsonUrl(release);
    let downloadUrl: string | undefined;
    let signature: string | undefined;
    let date: string | undefined;

    if (latestJsonUrl) {
      try {
        const latestJson = await fetchLatestJson(latestJsonUrl);
        log.debug('[Updater] Got latest.json');

        // 提取 Windows 平台的下载信息
        const platformInfo = latestJson.platforms?.['windows-x86_64'];
        if (platformInfo) {
          downloadUrl = platformInfo.url;
          signature = platformInfo.signature;
        }
        date = latestJson.date || latestJson.pub_date;
      } catch (err) {
        log.warn(`[Updater] Failed to fetch latest.json: ${err}`);
      }
    }

    // 如果 latest.json 中没有下载链接，从 release assets 中找
    if (!downloadUrl) {
      const installerAsset = release.assets.find(a =>
        a.name.includes('x64-setup.exe') || a.name.endsWith('.exe')
      );
      downloadUrl = installerAsset?.browser_download_url;
    }

    // 返回更新信息
    return {
      hasUpdate: true,
      versionInfo: {
        version: remoteVersion,
        currentVersion,
        date: date || release.body?.match(/\d{4}-\d{2}-\d{2}/)?.[0],
        body: release.body,
        downloadUrl,
        signature,
      },
      currentVersion,
    };
  } catch (error) {
    log.error('[Updater] Failed to check for updates: ' + String(error));
    throw error;
  }
}

/**
 * 下载并安装更新
 * 使用 Rust 端的下载安装功能，支持自定义下载 URL
 * @param onProgress 进度回调
 * @param language 当前语言，用于选择下载源
 */
export async function downloadAndInstallUpdate(
  onProgress?: (progress: DownloadProgress) => void,
  language?: string
): Promise<void> {
  log.info('[Updater] Starting download and install...');

  try {
    // 先检查更新，获取下载信息（传入语言选择下载源）
    const checkResult = await checkForUpdates(language);

    if (!checkResult.hasUpdate || !checkResult.versionInfo?.downloadUrl) {
      log.warn('[Updater] No update available or no download URL');
      throw new Error('No update available');
    }

    const { downloadUrl, signature, version } = checkResult.versionInfo;

    if (!downloadUrl) {
      throw new Error('No download URL available');
    }

    log.info(`[Updater] Download URL: ${downloadUrl}`);

    // 提取文件名
    const fileName = downloadUrl.split('/').pop() || `Voconly_${version}_x64-setup.exe`;

    // 使用 Rust 端的下载功能
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

    // 调用 Rust 端的下载命令
    try {
      const filePath = await invoke<string>('download_update', {
        downloadUrl,
        fileName,
        expectedSize: 0, // 让后端自动获取
      });

      log.info(`[Updater] Download complete: ${filePath}`);

      // 安装更新
      await invoke('install_update', { filePath });

      // 更新状态
      log.info('[Updater] Update installed, relaunching...');

      // 重启应用
      await relaunch();
    } finally {
      unlisten?.();
    }
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