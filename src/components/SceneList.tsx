import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, Model, BackendType, LlmProfile } from '../types';
import SceneForm from './SceneForm';
import LlmConfigModal from './LlmConfigModal';
import ShortcutErrorModal from './ShortcutErrorModal';
import { extractShortcutFromEvent } from '../utils/keyboard';
import { translateSceneName } from '../utils/i18n';
import { scanAsrModels, type ModelPreset } from '../services/config';
import { useToast } from './ui/Toast';
import { createLogger } from '../services/log';
import { loadModel, unloadModel } from '../services/whisper';

// 创建日志记录器
const log = createLogger('SceneList');

// Backend labels (same as ModelList.tsx for consistency)
const BACKEND_LABELS: Record<BackendType, { label: string; color: string }> = {
  Whisper: { label: 'Whisper', color: 'bg-orange-50 text-orange-600 border-orange-200' },
  Onnx: { label: 'ONNX', color: 'bg-purple-50 text-purple-600 border-purple-200' },
};

// Default available models with description keys for i18n
const DEFAULT_AVAILABLE_MODELS: (Model & { descriptionKey: string })[] = [
  { id: 'whisper-tiny', name: 'Whisper Tiny', backend: 'Whisper', size: '75MB', downloaded: false, downloadUrls: [], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperTiny' },
  { id: 'whisper-base', name: 'Whisper Base', backend: 'Whisper', size: '142MB', downloaded: false, downloadUrls: [], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperBase' },
  { id: 'whisper-small', name: 'Whisper Small', backend: 'Whisper', size: '244MB', downloaded: false, downloadUrls: [], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperSmall' },
  { id: 'whisper-medium', name: 'Whisper Medium', backend: 'Whisper', size: '1.5GB', downloaded: false, downloadUrls: [], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperMedium' },
  { id: 'whisper-large', name: 'Whisper Large', backend: 'Whisper', size: '2.9GB', downloaded: false, downloadUrls: [], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperLarge' },
  { id: 'whisper-turbo', name: 'Whisper Turbo', backend: 'Whisper', size: '1.6GB', downloaded: false, downloadUrls: [], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.whisperTurbo' },
  { id: 'sensevoice-small', name: 'SenseVoice Small', backend: 'Onnx', size: '229MB', downloaded: false, downloadUrls: [], languages: ['zh', 'zh-yue', 'en', 'ja', 'ko'], descriptionKey: 'models.descriptions.sensevoiceSmall' },
  { id: 'parakeet-v3', name: 'Parakeet V3', backend: 'Onnx', size: '640MB', downloaded: false, downloadUrls: [], languages: ['zh', 'en'], descriptionKey: 'models.descriptions.parakeetV3' },
];

interface SceneListProps {
  scenes?: Scene[];
  models?: Model[];
  llmProfiles?: LlmProfile[];
  onEdit?: (scene: Scene) => void;
  onToggle?: (sceneId: string, enabled: boolean) => void;
  onAdd?: () => void;
  onSave?: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
}

// Get model name by ID
// First searches in scannedModels (scanned models from directory), then falls back to models (predefined list)
function getModelName(modelId: string, models: Model[], scannedModels?: ModelPreset[]): string {
  // First, try to find in scannedModels (scanned models from disk)
  if (scannedModels) {
    const scannedModel = scannedModels.find(m => m.id === modelId);
    if (scannedModel) {
      return scannedModel.name;
    }
  }

  // Fallback to predefined models list
  const model = models.find(m => m.id === modelId);
  if (!model) {
    // Don't log error for custom models, just return the ID as name
    return modelId;
  }
  return model.name;
}

// Validate model ID format
function validateModelId(modelId: string): boolean {
  // Model IDs should be alphanumeric with hyphens, underscores, and dots
  // Prevent path traversal, special characters, etc.
  const validPattern = /^[a-zA-Z0-9_.-]+$/;
  return validPattern.test(modelId);
}

// Toggle Switch Component
function ToggleSwitch({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
        disabled
          ? 'bg-gray-300 cursor-not-allowed opacity-60'
          : checked ? 'bg-gray-900' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Model Select Modal
function ModelSelectModal({
  scannedModels,
  selectedId,
  onSelect,
  onCancel,
  t,
}: {
  scannedModels: ModelPreset[];
  selectedId: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  // Build model list from scanned models (same logic as ModelList.tsx)
  const modelList = scannedModels.map(scanned => {
    const knownModel = DEFAULT_AVAILABLE_MODELS.find(m => m.id === scanned.id);
    const descriptionKey = knownModel?.descriptionKey;
    return {
      id: scanned.id,
      name: scanned.name,
      backend: scanned.backend || 'Whisper',
      size: scanned.size,
      downloaded: true,
      description: scanned.description,
      descriptionKey,
    };
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-10 w-[680px] max-h-[80vh] overflow-hidden shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h4 className="font-semibold text-gray-900 text-lg">{t('sceneList.selectModel')}</h4>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 max-h-[28rem] overflow-y-auto">
          {modelList.map((m) => (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                selectedId === m.id
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">{m.name}</span>
                  <span className="text-xs text-gray-400">({m.size})</span>
                  {/* Backend type label */}
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${BACKEND_LABELS[m.backend as BackendType].color}`}>
                    {BACKEND_LABELS[m.backend as BackendType].label}
                  </span>
                  {/* Ready badge */}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded-full border border-emerald-200">
                    {t('sceneList.ready')}
                  </span>
                </div>
                {/* Model description */}
                <div className="mt-1 text-sm text-gray-500">
                  {m.descriptionKey ? t(m.descriptionKey) : m.description || ''}
                </div>
              </div>
              {selectedId === m.id && (
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SceneList({
  scenes = [],
  models = [],
  llmProfiles = [],
  onEdit,
  onToggle,
  onAdd,
  onSave,
  checkConflict,
  tryRegisterShortcut,
}: SceneListProps) {
  const { t } = useTranslation();
  const [localScenes, setLocalScenes] = useState<Scene[]>(scenes);
  const [showForm, setShowForm] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [scannedModels, setScannedModels] = useState<ModelPreset[]>([]);
  const { showToast } = useToast();

  // For inline editing
  const [listeningShortcut, setListeningShortcut] = useState<string | null>(null); // scene id
  const [selectingModel, setSelectingModel] = useState<Scene | null>(null);
  const [llmConfigScene, setLlmConfigScene] = useState<Scene | null>(null);

  // For shortcut error modal
  const [shortcutError, setShortcutError] = useState<{
    shortcut: string;
    errorType: 'unsupported' | 'occupied' | 'unknown';
    errorMessage: string;
  } | null>(null);

  // Ref for the listening timeout
  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load scanned models on mount (same as ModelList.tsx)
  useEffect(() => {
    const loadScannedModels = async () => {
      try {
        const result = await scanAsrModels();
        setScannedModels(result);
        log.info(`Scanned ${result.length} ASR models`);
      } catch (err) {
        log.error(`Failed to scan ASR models: ${err}`);
      }
    };
    loadScannedModels();
  }, []);

  // Update local scenes when prop changes
  useEffect(() => {
    setLocalScenes(scenes);
  }, [scenes]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
    };
  }, []);

  const handleAdd = () => {
    setEditingScene(null);
    setShowForm(true);
    if (onAdd) {
      onAdd();
    }
  };

  const handleEditName = (scene: Scene) => {
    setEditingScene(scene);
    setShowForm(true);
    if (onEdit) {
      onEdit(scene);
    }
  };

  const handleToggle = async (sceneId: string, currentEnabled: boolean) => {
    const scene = localScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const newEnabled = !currentEnabled;

    // 更新场景状态
    const updatedScene = { ...scene, enabled: newEnabled };
    const newScenes = localScenes.map((s) => (s.id === sceneId ? updatedScene : s));
    setLocalScenes(newScenes);

    if (onToggle) {
      onToggle(sceneId, newEnabled);
    } else if (onSave) {
      onSave(newScenes);
    }

    // 获取模型信息
    const model = models.find(m => m.id === scene.modelId);
    const modelName = model?.name || scene.modelId;
    const modelSize = model?.size || '';
    const modelId = scene.modelId;

    if (newEnabled) {
      // 启用场景：加载模型到内存
      log.debug(`启用场景，加载模型 ${modelId}`);
      try {
        const result = await loadModel(modelId);
        if (result.success) {
          showToast({
            type: 'info',
            title: '场景已启用',
            description: `${modelName} 已加载到内存`,
          });
        } else {
          // 检查是否是内存不足错误
          if (result.error?.startsWith('MEMORY_INSUFFICIENT|')) {
            const parts = result.error.split('|');
            const errorMsg = parts[1] || '内存不足';
            // 解析内存信息
            const memoryMatch = errorMsg.match(/需要约 (\d+MB).*可用 (\d+MB)/);
            const requiredMemory = memoryMatch?.[1] || '未知';
            const availableMemory = memoryMatch?.[2] || '未知';

            // 显示内存不足提示（dialog 在 App.tsx 中统一处理，这里显示 toast）
            showToast({
              type: 'warning',
              title: '内存空间不足',
              description: `${modelName} 需要约 ${requiredMemory}，但系统仅可用 ${availableMemory}。请在录音时根据提示选择是否强制加载。`,
            });

            // 回滚场景状态（保持禁用）
            const rollbackScenes = localScenes.map((s) =>
              s.id === sceneId ? { ...s, enabled: false } : s
            );
            setLocalScenes(rollbackScenes);
            if (onSave) {
              onSave(rollbackScenes);
            }
          } else {
            showToast({
              type: 'warning',
              title: '模型加载失败',
              description: result.error || '未知错误',
            });
          }
        }
      } catch (e) {
        const errorMsg = String(e);
        log.error(`加载模型异常: ${errorMsg}`);
        showToast({
          type: 'warning',
          title: '模型加载异常',
          description: errorMsg,
        });
      }
    } else {
      // 禁用场景：检查是否需要卸载模型
      const otherScenesUsingModel = newScenes.filter(s =>
        s.id !== sceneId &&
        s.modelId === modelId &&
        s.enabled
      );

      if (otherScenesUsingModel.length > 0) {
        const otherSceneNames = otherScenesUsingModel.map(s => s.name).join('、');
        showToast({
          type: 'info',
          title: '场景已禁用',
          description: `${modelName} 仍被「${otherSceneNames}」使用，保持在内存中`,
        });
      } else {
        log.debug(`禁用场景，卸载模型 ${modelId}`);
        try {
          const result = await unloadModel(modelId);
          if (result.success) {
            showToast({
              type: 'info',
              title: '场景已禁用',
              description: `${modelName} 已从内存释放${modelSize ? `，腾出约 ${modelSize}` : ''}`,
            });
          }
        } catch (e) {
          const errorMsg = String(e);
          log.error(`卸载模型异常: ${errorMsg}`);
          showToast({
            type: 'warning',
            title: '模型卸载异常',
            description: errorMsg,
          });
        }
      }
    }
  };

  const handleSave = (scene: Scene) => {
    // Calculate new scenes first
    const existing = localScenes.find((s) => s.id === scene.id);
    let newScenes: Scene[];
    if (existing) {
      newScenes = localScenes.map((s) => (s.id === scene.id ? scene : s));
    } else {
      newScenes = [...localScenes, scene];
    }

    // Update local state
    setLocalScenes(newScenes);

    setShowForm(false);
    setEditingScene(null);

    if (onSave) {
      onSave(newScenes);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingScene(null);
  };

  const handleDelete = (sceneId: string) => {
    if (!confirm(t('sceneList.confirmDelete'))) {
      return;
    }

    const newScenes = localScenes.filter((s) => s.id !== sceneId);
    setLocalScenes(newScenes);

    if (onSave) {
      onSave(newScenes);
    }
  };

  // Handle shortcut key capture
  const handleShortcutClick = useCallback((scene: Scene) => {
    // Cancel any existing listening
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }

    // Start listening for this scene
    setListeningShortcut(scene.id);

    // Auto-cancel after 5 seconds
    listeningTimeoutRef.current = setTimeout(() => {
      setListeningShortcut(null);
    }, 5000);
  }, []);

  // Keydown handler for shortcut capture
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    if (!listeningShortcut) return;

    e.preventDefault();
    e.stopPropagation();

    const newShortcut = extractShortcutFromEvent(e);
    if (!newShortcut) return;

    // Find the scene being edited
    const scene = localScenes.find(s => s.id === listeningShortcut);
    if (!scene) return;

    // Check conflict
    if (checkConflict) {
      const conflict = checkConflict(newShortcut, scene.id);
      if (conflict) {
        // Conflict detected, cancel listening
        setListeningShortcut(null);
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        alert(conflict);
        return;
      }
    }

    // Try register before saving
    if (tryRegisterShortcut) {
      const result = await tryRegisterShortcut(newShortcut, scene.id);
      if (!result.success) {
        // Show error modal
        setShortcutError({
          shortcut: newShortcut,
          errorType: (result.errorType as 'unsupported' | 'occupied' | 'unknown') || 'unknown',
          errorMessage: result.error || '',
        });
        setListeningShortcut(null);
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        return; // Don't save the new shortcut
      }
    }

    // Update the scene with new shortcut
    const updatedScene = { ...scene, shortcut: newShortcut };

    // Calculate new scenes first (before state update to ensure correct value)
    const newScenes = localScenes.map((s) => (s.id === updatedScene.id ? updatedScene : s));

    // Update local state
    setLocalScenes(newScenes);

    // Notify parent with the correct newScenes
    if (onSave) {
      onSave(newScenes);
    }

    // Clear listening state
    setListeningShortcut(null);
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }
  }, [listeningShortcut, localScenes, checkConflict, onSave, tryRegisterShortcut]);

  // Attach global keydown listener when in listening mode
  useEffect(() => {
    if (listeningShortcut) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [listeningShortcut, handleKeyDown]);

  // Handle model select
  const handleModelClick = (scene: Scene) => {
    setSelectingModel(scene);
  };

  const handleModelSelect = (modelId: string) => {
    if (!selectingModel) return;
    log.debug(`handleModelSelect: sceneId=${selectingModel.id}, newModelId=${modelId}`);

    // Validate model ID format
    if (!validateModelId(modelId)) {
      log.error(`Invalid model ID format: ${modelId}`);
      showToast({
        type: 'error',
        title: t('sceneList.invalidModelId'),
        description: t('sceneList.invalidModelIdDesc'),
      });
      return;
    }

    const updatedScene = { ...selectingModel, modelId };
    log.debug(`Updated scene: ${JSON.stringify(updatedScene)}`);

    // Calculate new scenes first
    const newScenes = localScenes.map((s) => (s.id === updatedScene.id ? updatedScene : s));
    log.debug(`New scenes: ${JSON.stringify(newScenes)}`);

    // Update local state
    setLocalScenes(newScenes);

    // Notify parent
    if (onSave) {
      log.debug('Calling onSave');
      onSave(newScenes);
    } else {
      log.debug('No onSave callback!');
    }

    setSelectingModel(null);
  };

  // Render scene list
  const renderSceneList = () => (
    <div className="scene-list">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-gray-900">{t('sceneList.title')}</h2>
        <button
          onClick={handleAdd}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-all duration-200 active:scale-95"
        >
          {t('sceneList.addScene')}
        </button>
      </div>

      {localScenes.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
          <div className="text-4xl mb-3">🎤</div>
          <p>{t('sceneList.noScenes')}</p>
          <p className="text-sm mt-1">{t('sceneList.noScenesHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {localScenes.map((scene) => {
            const isListening = listeningShortcut === scene.id;
            // 检查该场景是否启用了 LLM
            const sceneLlmProfile = llmProfiles.find(p => p.sceneId === scene.id);
            const llmEnabled = sceneLlmProfile?.enabled ?? false;

            return (
              <div
                key={scene.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                  scene.enabled
                    ? 'bg-white border-gray-100'
                    : 'bg-gray-50/50 border-gray-100'
                } ${isListening ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
              >
                {/* Scene Info */}
                <div className="flex-1 flex items-center gap-6">
                  {/* Scene Name - Click to edit */}
                  <button
                    onClick={() => handleEditName(scene)}
                    className={`font-medium text-left hover:underline transition-colors ${
                      scene.enabled ? 'text-gray-900' : 'text-gray-500'
                    }`}
                    title={t('sceneList.clickToEdit')}
                  >
                    {translateSceneName(scene.name, t)}
                  </button>

                  {/* Shortcut - Click to capture or show listening state */}
                  {scene.enabled ? (
                    <button
                      onClick={() => !isListening && handleShortcutClick(scene)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono transition-all duration-200 min-w-[80px] justify-center ${
                        isListening
                          ? 'bg-amber-100 text-amber-700 animate-pulse'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      title={isListening ? t('home.pressAnyKey') : t('sceneList.clickToChangeShortcut')}
                    >
                      {isListening ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                          </svg>
                          {t('sceneList.pressKey')}
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                          </svg>
                          {scene.shortcut}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono bg-gray-100/50 text-gray-400 min-w-[80px] justify-center cursor-not-allowed">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                      </svg>
                      {scene.shortcut}
                    </div>
                  )}

                  {/* Model - Click to select */}
                  {scene.enabled ? (
                    <button
                      onClick={() => handleModelClick(scene)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 bg-gray-100 text-gray-700 hover:bg-gray-200"
                      title={!scene.modelId ? t('home.selectModelFirst') : t('sceneList.clickToSwitchModel')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {scene.modelId ? getModelName(scene.modelId, models, scannedModels) : t('home.clickToSelect')}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-100/50 text-gray-400 cursor-not-allowed">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {scene.modelId ? getModelName(scene.modelId, models, scannedModels) : t('home.noModelSelected')}
                    </div>
                  )}
                </div>

                {/* Right side: Delete and Toggles */}
                <div className="flex items-center gap-4">
                  {/* LLM Config Button */}
                  <button
                    onClick={() => setLlmConfigScene(scene)}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      llmEnabled
                        ? 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                    }`}
                    title={llmEnabled ? t('home.llmEnabled') : t('sceneList.llmConfig')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(scene.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                    title={t('sceneList.deleteScene')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  {/* Enable/Disable Toggle */}
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${scene.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                      {scene.enabled ? t('sceneList.on') : t('sceneList.off')}
                    </span>
                    <ToggleSwitch
                      checked={scene.enabled}
                      onChange={() => handleToggle(scene.id, scene.enabled)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      {renderSceneList()}

      {/* Add/Edit Scene Modal */}
      {showForm && (
        <SceneForm
          scene={editingScene}
          models={models}
          onSave={handleSave}
          onCancel={handleCancel}
          checkConflict={checkConflict}
        />
      )}

      {/* Model Select Modal */}
      {selectingModel && (
        <ModelSelectModal
          scannedModels={scannedModels}
          selectedId={selectingModel.modelId}
          onSelect={handleModelSelect}
          onCancel={() => setSelectingModel(null)}
          t={t}
        />
      )}

      {/* LLM Config Modal */}
      {llmConfigScene && (
        <LlmConfigModal
          isOpen={!!llmConfigScene}
          scene={llmConfigScene}
          onClose={() => setLlmConfigScene(null)}
        />
      )}

      {/* Shortcut Error Modal */}
      {shortcutError && (
        <ShortcutErrorModal
          isOpen={!!shortcutError}
          shortcut={shortcutError.shortcut}
          errorType={shortcutError.errorType}
          errorMessage={shortcutError.errorMessage}
          onClose={() => setShortcutError(null)}
        />
      )}
    </>
  );
}
