import SceneList from '../SceneList';
import type { Scene } from '../../types';

interface SettingsShortcutProps {
  scenes: Scene[];
  onSave: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
}

export default function SettingsShortcut({
  scenes,
  onSave,
  checkConflict,
  tryRegisterShortcut,
}: SettingsShortcutProps) {
  return (
    <SceneList
      scenes={scenes}
      onSave={onSave}
      checkConflict={checkConflict}
      tryRegisterShortcut={tryRegisterShortcut}
    />
  );
}