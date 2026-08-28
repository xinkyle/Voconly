import SceneList from '../SceneList';
import type { Scene, Model, GlobalModelConfig } from '../../types';
import type { DownloadProgress } from '../../services/downloader';

interface SettingsShortcutProps {
  scenes: Scene[];
  models: Model[];
  globalModelConfig?: GlobalModelConfig;
  onSave: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
  // Download related props
  downloadStates?: Record<string, { downloading: boolean; progress?: DownloadProgress }>;
  onDownload?: (model: Model) => void;
  onDownloadCancel?: (modelId: string) => void;
}

export default function SettingsShortcut({
  scenes,
  models,
  globalModelConfig,
  onSave,
  checkConflict,
  tryRegisterShortcut,
  downloadStates,
  onDownload,
  onDownloadCancel,
}: SettingsShortcutProps) {
  return (
    <SceneList
      scenes={scenes}
      models={models}
      globalModelConfig={globalModelConfig}
      onSave={onSave}
      checkConflict={checkConflict}
      tryRegisterShortcut={tryRegisterShortcut}
      downloadStates={downloadStates}
      onDownload={onDownload}
      onDownloadCancel={onDownloadCancel}
    />
  );
}