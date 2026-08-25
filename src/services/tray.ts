import { invoke } from '../utils/tauri';
import type { Scene } from '../types';
import { getFullModelId } from '../types';
import i18n from '../i18n';
import { translateSceneName } from '../utils/i18n';

/**
 * Tray menu service
 * Provides functions to update the system tray menu with scenes
 */

export interface TrayScene {
  id: string;
  name: string;
  shortcut: string;
  modelId: string;
  enabled: boolean;
}

/**
 * Update the tray menu with the provided scenes
 * This will add a submenu with all enabled scenes for quick access
 */
export async function updateTrayMenu(scenes: Scene[]): Promise<void> {
  const trayScenes: TrayScene[] = scenes.map(scene => ({
    id: scene.id,
    name: translateSceneName(scene.name, i18n.t.bind(i18n)),
    shortcut: scene.shortcut,
    modelId: scene.model?.modelId ? getFullModelId(scene.model) : '',
    enabled: scene.enabled,
  }));

  await invoke('update_tray_menu', { scenes: trayScenes });
}