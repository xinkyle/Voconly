/**
 * Permissions Service
 * macOS 辅助功能和输入监控权限的检查与授权引导（其他平台恒为已授权）
 */

import { invoke } from '../utils/tauri';
import { createLogger } from './log';

const log = createLogger('Permissions');

/**
 * 静默检查辅助功能权限（不弹任何系统弹窗）
 * @returns true 表示已授权（或非 macOS 平台 / 查询失败时按已授权处理，避免误打扰）
 */
export async function checkAccessibilityPermission(): Promise<boolean> {
  try {
    return await invoke<boolean>('check_accessibility_permission');
  } catch (error) {
    log.error(`checkAccessibilityPermission failed: ${error}`);
    return true;
  }
}

/**
 * 请求辅助功能权限：后端清理失效的授权条目并触发系统重新注册，
 * 用户在系统设置里拨动开关即可。返回调用时刻的授权状态。
 */
export async function requestAccessibilityPermission(): Promise<boolean> {
  try {
    return await invoke<boolean>('request_accessibility_permission');
  } catch (error) {
    log.error(`requestAccessibilityPermission failed: ${error}`);
    return false;
  }
}

/**
 * 重置输入监控权限条目。
 * 重置后需要调用 keyhook 的 startListen 来触发授权引导。
 * 注意：调用此函数前应先确认辅助功能权限已授权。
 */
export async function resetInputMonitoringPermission(): Promise<void> {
  try {
    await invoke('reset_input_monitoring_permission');
  } catch (error) {
    log.error(`resetInputMonitoringPermission failed: ${error}`);
  }
}