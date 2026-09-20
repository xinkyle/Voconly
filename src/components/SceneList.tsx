import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene } from '../types';
import SceneForm from './SceneForm';
import ShortcutErrorModal from './ShortcutErrorModal';
import ConfirmModal from './ui/ConfirmModal';
import { extractShortcutFromEvent, parseShortcutForDisplay } from '../utils/keyboard';
import { getSceneNameFromPromptType } from '../utils/i18n';
import { getLlmPromptPresets } from '../services/llm';
import { createLogger } from '../services/log';

// 创建日志记录器
const log = createLogger('SceneList');

interface SceneListProps {
  scenes?: Scene[];
  onEdit?: (scene: Scene) => void;
  onAdd?: () => void;
  onSave?: (scenes: Scene[]) => void;
  checkConflict?: (shortcut: string, excludeSceneId?: string) => string | null;
  tryRegisterShortcut?: (shortcut: string, sceneId: string) => Promise<{ success: boolean; errorType?: string; error?: string }>;
  setPaused?: (paused: boolean) => void;
  /** 是否正在录音（用于禁止切换快捷键） */
  isRecording?: boolean;
}


export default function SceneList({
  scenes = [],
  onEdit,
  onAdd,
  onSave,
  checkConflict,
  tryRegisterShortcut,
  setPaused,
  isRecording,
}: SceneListProps) {
  const { t } = useTranslation();
  const [localScenes, setLocalScenes] = useState<Scene[]>(scenes);
  const [showForm, setShowForm] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);

  // For inline editing
  const [listeningShortcut, setListeningShortcut] = useState<string | null>(null); // scene id
  const [customPresets, setCustomPresets] = useState<Record<string, string>>({});

  // 组合键录制状态
  const [pressedModifiers, setPressedModifiers] = useState<string[]>([]);
  const pressedModifiersRef = useRef<string[]>([]);

  // For shortcut error modal
  const [shortcutError, setShortcutError] = useState<{
    shortcut: string;
    errorType: 'unsupported' | 'occupied' | 'unknown';
    errorMessage: string;
  } | null>(null);

  // For delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    sceneId: string;
    sceneName: string;
  } | null>(null);

  // Move scene handlers (替代拖拽)
  const handleMoveUp = (index: number) => {
    if (index === 0) return; // 已经是第一个

    const newScenes = [...localScenes];
    const temp = newScenes[index - 1];
    newScenes[index - 1] = newScenes[index];
    newScenes[index] = temp;

    setLocalScenes(newScenes);
    if (onSave) {
      onSave(newScenes);
    }
  };

  // Ref for the listening timeout
  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref for setPaused (to avoid stale closure)
  const setPausedRef = useRef(setPaused);

  // Update setPaused ref
  useEffect(() => {
    setPausedRef.current = setPaused;
  }, [setPaused]);

  // Load custom presets
  useEffect(() => {
    const loadPresets = async () => {
      try {
        const presets = await getLlmPromptPresets();
        if (presets?.customPresets) {
          setCustomPresets(presets.customPresets);
        }
      } catch (err) {
        log.error(`Failed to load custom presets: ${err}`);
      }
    };
    loadPresets();
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
    const scene = localScenes.find(s => s.id === sceneId);
    if (!scene) return;

    const sceneName = getSceneNameFromPromptType(scene.promptType, scene.customPrompt, t, customPresets) || t('sceneList.defaultSceneName');

    setDeleteConfirm({ sceneId, sceneName });
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;

    const newScenes = localScenes.filter((s) => s.id !== deleteConfirm.sceneId);
    setLocalScenes(newScenes);

    if (onSave) {
      onSave(newScenes);
    }

    setDeleteConfirm(null);
  };

  // Handle shortcut key capture
  const handleShortcutClick = useCallback((scene: Scene) => {
    // 如果正在录音，禁止切换快捷键
    if (isRecording) {
      log.warn('Cannot change shortcut while recording');
      return;
    }

    log.debug(`[handleShortcutClick] 开始录制快捷键，sceneId=${scene.id}`);

    // 立即暂停全局快捷键监听（同步操作，避免 keyhook 在 useEffect 执行前捕获按键）
    // 注意：必须在设置 listeningShortcut 之前暂停
    if (setPaused) {
      log.debug(`[handleShortcutClick] 调用 setPaused(true)`);
      setPaused(true);
    }
    setPausedRef.current?.(true);

    // Cancel any existing listening
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }

    // 重置修饰键状态
    setPressedModifiers([]);
    pressedModifiersRef.current = [];

    // Start listening for this scene
    setListeningShortcut(scene.id);

    // Auto-cancel after 10 seconds（给用户更多时间来录制组合键）
    listeningTimeoutRef.current = setTimeout(() => {
      log.debug(`[handleShortcutClick] 录制超时，自动取消`);
      setListeningShortcut(null);
      setPressedModifiers([]);
      pressedModifiersRef.current = [];
      if (setPaused) {
        setPaused(false);
      }
      setPausedRef.current?.(false);
    }, 10000);
  }, [isRecording, setPaused]);

  // 修饰键列表
  const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];

  // 判断是否为修饰键
  const isModifierKey = (key: string): boolean => {
    return MODIFIER_KEYS.some(mod => key === mod || key.startsWith(mod));
  };

  // 规范化修饰键名称
  const normalizeModifierName = (e: KeyboardEvent): string => {
    // 根据 e.code 和 e.location 区分左右修饰键
    if (e.key === 'Control') {
      return e.location === 2 ? 'RightCtrl' : 'LeftCtrl';
    }
    if (e.key === 'Shift') {
      return e.location === 2 ? 'RightShift' : 'LeftShift';
    }
    if (e.key === 'Alt') {
      return e.location === 2 ? 'RightAlt' : 'LeftAlt';
    }
    if (e.key === 'Meta') {
      return e.location === 2 ? 'RightWindows' : 'LeftWindows';
    }
    return e.key;
  };

  // Keydown handler for shortcut capture
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    if (!listeningShortcut) return;

    log.debug(`[SceneList handleKeyDown] 按键事件: key=${e.key}, code=${e.code}, location=${e.location}`);

    e.preventDefault();
    e.stopPropagation();

    // Escape 取消录制
    if (e.key === 'Escape') {
      log.debug(`[SceneList handleKeyDown] Escape 按下，取消录制`);
      setListeningShortcut(null);
      setPressedModifiers([]);
      pressedModifiersRef.current = [];
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
      // 恢复全局快捷键监听
      if (setPaused) {
        setPaused(false);
      }
      setPausedRef.current?.(false);
      return;
    }

    // 检测修饰键按下 - 只记录，不触发完成
    log.debug(`[SceneList handleKeyDown] 检查是否为修饰键: isModifierKey(${e.key}) = ${isModifierKey(e.key)}`);
    if (isModifierKey(e.key)) {
      const modKey = normalizeModifierName(e);
      if (!pressedModifiersRef.current.includes(modKey)) {
        pressedModifiersRef.current = [...pressedModifiersRef.current, modKey];
        setPressedModifiers([...pressedModifiersRef.current]);
        log.debug(`修饰键按下: ${modKey}, 当前修饰键列表: ${pressedModifiersRef.current.join('+')}`);
      }
      log.debug(`[SceneList handleKeyDown] 修饰键，继续监听`);
      return; // 继续监听，等待非修饰键
    }

    // 非修饰键按下 - 生成快捷键
    const mainKey = extractShortcutFromEvent(e);
    log.debug(`[SceneList handleKeyDown] 非修饰键: mainKey=${mainKey}, 当前修饰键列表: ${pressedModifiersRef.current.join('+')}`);
    if (!mainKey) {
      log.debug(`无法识别的按键: ${e.key}`);
      return;
    }

    // 组合快捷键：修饰键 + 主键
    let newShortcut = mainKey;
    if (pressedModifiersRef.current.length > 0) {
      newShortcut = [...pressedModifiersRef.current, mainKey].join('+');
      log.info(`组合键录制完成: ${newShortcut}`);
    } else {
      log.info(`单键录制完成: ${newShortcut}`);
    }

    // Find the scene being edited
    const scene = localScenes.find(s => s.id === listeningShortcut);
    if (!scene) return;

    // Check conflict
    if (checkConflict) {
      const conflict = checkConflict(newShortcut, scene.id);
      if (conflict) {
        setListeningShortcut(null);
        setPressedModifiers([]);
        pressedModifiersRef.current = [];
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        // 恢复全局快捷键监听
        if (setPaused) {
          setPaused(false);
        }
        setPausedRef.current?.(false);
        alert(conflict);
        return;
      }
    }

    // Try register before saving
    if (tryRegisterShortcut) {
      const result = await tryRegisterShortcut(newShortcut, scene.id);
      if (!result.success) {
        setShortcutError({
          shortcut: newShortcut,
          errorType: (result.errorType as 'unsupported' | 'occupied' | 'unknown') || 'unknown',
          errorMessage: result.error || '',
        });
        setListeningShortcut(null);
        setPressedModifiers([]);
        pressedModifiersRef.current = [];
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }
        // 恢复全局快捷键监听
        if (setPaused) {
          setPaused(false);
        }
        setPausedRef.current?.(false);
        return;
      }
    }

    // Update the scene with new shortcut
    const updatedScene = { ...scene, shortcut: newShortcut };

    // Calculate new scenes first
    const newScenes = localScenes.map((s) => (s.id === updatedScene.id ? updatedScene : s));

    setLocalScenes(newScenes);

    if (onSave) {
      onSave(newScenes);
    }

    setListeningShortcut(null);
    setPressedModifiers([]);
    pressedModifiersRef.current = [];
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }
    // 恢复全局快捷键监听
    if (setPaused) {
      setPaused(false);
    }
    setPausedRef.current?.(false);
  }, [listeningShortcut, localScenes, checkConflict, onSave, tryRegisterShortcut, setPaused]);

  // Keyup handler - 清除修饰键状态
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!listeningShortcut) return;

    // 修饰键释放时，从列表中移除
    if (isModifierKey(e.key)) {
      const modKey = normalizeModifierName(e);
      pressedModifiersRef.current = pressedModifiersRef.current.filter(k => k !== modKey);
      setPressedModifiers([...pressedModifiersRef.current]);
    }
  }, [listeningShortcut]);

  // Attach global keydown/keyup listener when in listening mode
  useEffect(() => {
    if (listeningShortcut) {
      window.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('keyup', handleKeyUp, true);
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
        window.removeEventListener('keyup', handleKeyUp, true);
      };
    }
  }, [listeningShortcut, handleKeyDown, handleKeyUp]);

  // Render scene list
  const renderSceneList = () => (
    <div className="scene-list">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-gray-900">{t('sceneList.title')}</h2>
        <button
          onClick={handleAdd}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 rounded-lg transition-all duration-200 active:scale-95"
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
          {localScenes.map((scene, index) => {
            const isListening = listeningShortcut === scene.id;
            // 录音时禁止切换快捷键
            const isShortcutDisabled = isRecording && !isListening;
            const { prefix, main } = parseShortcutForDisplay(scene.shortcut, t);

            // 格式化当前按下的修饰键用于显示
            const formatPressedModifiers = () => {
              if (pressedModifiers.length === 0) return '';
              return pressedModifiers.map(mod => {
                // 简化显示：LeftCtrl -> Ctrl, RightShift -> Shift
                if (mod.startsWith('Left') || mod.startsWith('Right')) {
                  const base = mod.slice(4); // 去掉 Left/Right 前缀
                  if (base === 'Windows') return 'Win';
                  if (base === 'Alt') return 'Alt';
                  return base;
                }
                return mod;
              }).join(' + ') + ' + ';
            };

            return (
              <div
                key={scene.id}
                className={`relative flex items-center justify-between p-3 rounded-xl border transition-all duration-200 bg-white border-gray-100 ${isListening ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
              >
                {/* Scene Info */}
                <div className="flex-1 flex items-center gap-4">
                  {/* Shortcut - Click to capture or show listening state */}
                  <button
                    onClick={() => !isListening && !isShortcutDisabled && handleShortcutClick(scene)}
                    className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-mono transition-all duration-200 min-w-[72px] justify-center ${
                      isListening
                        ? 'bg-amber-100 text-amber-700 animate-pulse'
                        : isShortcutDisabled
                        ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    title={isListening ? t('home.pressAnyKey') : isShortcutDisabled ? t('sceneList.cannotChangeWhileRecording') : t('sceneList.clickToChangeShortcut')}
                  >
                    {isListening ? (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                        </svg>
                        <span className="text-xs">
                          {pressedModifiers.length > 0 ? formatPressedModifiers() : t('sceneList.pressKey')}
                        </span>
                      </>
                    ) : prefix ? (
                      // 有前缀（左/右修饰键）：前缀小字，主键名大字
                      <div className="flex flex-col items-center leading-tight">
                        <span className="text-[10px] font-medium opacity-70">{prefix}</span>
                        <span className="text-sm font-bold">{main}</span>
                      </div>
                    ) : (
                      // 普通键：直接显示
                      main
                    )}
                  </button>

                  {/* Scene Name + Description */}
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">
                      {getSceneNameFromPromptType(scene.promptType, scene.customPrompt, t, customPresets) || t('sceneList.selectPrompt')}
                    </div>
                    {/* 提示词描述 */}
                    {scene.promptType && ['lightPolish', 'translate', 'professionalPolish', 'meetingSecretary'].includes(scene.promptType) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t(`llmConfig.promptTypeDescs.${scene.promptType}`)}
                      </p>
                    )}
                  </div>

                  {/* Move Up Button */}
                  {index > 0 && (
                    <button
                      onClick={() => handleMoveUp(index)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                      title={t('sceneList.moveUp')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}

                  {/* Edit Button */}
                  <button
                    onClick={() => handleEditName(scene)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
                    title={t('sceneList.clickToEdit')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                </div>

                {/* Right side: Delete Button */}
                <div className="flex items-center">
                  <button
                    onClick={() => handleDelete(scene.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                    title={t('sceneList.deleteScene')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hint text */}
      <div className="mt-6 p-4 bg-gray-100 border border-gray-200 rounded-xl">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-gray-700">
              {t('sceneList.hint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {renderSceneList()}

      {/* Add/Edit Scene Modal */}
      {showForm && (
        <SceneForm
          scene={editingScene}
          onSave={handleSave}
          onCancel={handleCancel}
          checkConflict={checkConflict}
          setPaused={setPaused}
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

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={t('sceneList.deleteConfirmTitle')}
        message={t('sceneList.deleteConfirmMessage', { name: deleteConfirm?.sceneName || '' })}
        confirmText={t('sceneList.delete')}
        cancelText={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  );
}
