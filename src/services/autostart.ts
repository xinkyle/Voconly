import { invoke } from '../utils/tauri';

/**
 * Autostart service
 * Provides functions to enable, disable and check auto-start on system boot
 */

/**
 * Enable auto-start on system boot
 */
export async function enableAutostart(): Promise<void> {
  await invoke('enable_autostart');
}

/**
 * Disable auto-start on system boot
 */
export async function disableAutostart(): Promise<void> {
  await invoke('disable_autostart');
}

/**
 * Check if auto-start is currently enabled
 */
export async function isAutostartEnabled(): Promise<boolean> {
  return await invoke('is_autostart_enabled');
}