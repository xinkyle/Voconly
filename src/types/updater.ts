// ============== 更新器类型 ==============

/**
 * 下载进度
 */
export interface DownloadProgress {
  downloaded: number;
  totalSize: number;
  progress: number;  // 0-100
}

/**
 * 远程版本信息
 */
export interface RemoteVersionInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

/**
 * 更新检查结果
 */
export interface UpdateCheckResult {
  hasUpdate: boolean;
  versionInfo?: RemoteVersionInfo;
  currentVersion: string;
}