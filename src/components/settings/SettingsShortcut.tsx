import SceneList from '../SceneList';
import type { Scene, Model, LlmProfile } from '../../types';

interface SettingsShortcutProps {
  scenes: Scene[];
  models: Model[];
  llmProfiles?: LlmProfile[];
  onSave: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
}

export default function SettingsShortcut({
  scenes,
  models,
  llmProfiles = [],
  onSave,
  checkConflict,
  tryRegisterShortcut,
}: SettingsShortcutProps) {
  return (
    <SceneList
      scenes={scenes}
      models={models}
      llmProfiles={llmProfiles}
      onSave={onSave}
      checkConflict={checkConflict}
      tryRegisterShortcut={tryRegisterShortcut}
    />
  );
}