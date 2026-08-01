import { invoke } from '../utils/tauri';

/**
 * Window management service
 * Provides functions to show, hide, and control the application window
 */

export async function showWindow(): Promise<void> {
  await invoke('show_window');
}

export async function hideWindow(): Promise<void> {
  await invoke('hide_window');
}

export async function setWindowVisible(visible: boolean): Promise<void> {
  await invoke('set_window_visible', { visible });
}