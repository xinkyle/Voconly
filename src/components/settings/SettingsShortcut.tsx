import SceneList from '../SceneList';
import type { Scene } from '../../types';

interface SettingsShortcutProps {
  scenes: Scene[];
  onSave: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
  setPaused?: (paused: boolean) => void;
  /** 是否正在录音（用于禁止切换快捷键） */
  isRecording?: boolean;
}

export default function SettingsShortcut({
  scenes,
  onSave,
  checkConflict,
  tryRegisterShortcut,
  setPaused,
  isRecording,
}: SettingsShortcutProps) {
  return (
    <SceneList
      scenes={scenes}
      onSave={onSave}
      checkConflict={checkConflict}
      tryRegisterShortcut={tryRegisterShortcut}
      setPaused={setPaused}
      isRecording={isRecording}
    />
  );
}