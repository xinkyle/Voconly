import SceneList from '../SceneList';
import type { Scene, Model } from '../../types';

interface SettingsShortcutProps {
  scenes: Scene[];
  models: Model[];
  onSave: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
}

export default function SettingsShortcut({
  scenes,
  models,
  onSave,
  checkConflict,
  tryRegisterShortcut,
}: SettingsShortcutProps) {
  return (
    <SceneList
      scenes={scenes}
      models={models}
      onSave={onSave}
      checkConflict={checkConflict}
      tryRegisterShortcut={tryRegisterShortcut}
    />
  );
}