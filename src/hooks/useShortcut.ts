import { useEffect, useCallback, useState, useRef } from 'react';
import type { Scene } from '../types';
import { createLogger } from '../services/log';
import { mapRawCodeToKeyName } from '../utils/keyboard';

// 创建日志记录器
const log = createLogger('Shortcut');

// 双击检测时间窗口 (ms)
const DOUBLE_TAP_WINDOW_MS = 300;

interface UseShortcutOptions {
  onShortcutTriggered?: (sceneId: string, skipLlm: boolean) => void;
  /** 当前是否正在录音（用于双击检测逻辑） */
  isRecording?: boolean;
}

// Registration result for fallback handling
interface RegistrationResult {
  success: boolean;
  error?: string;
  errorType?: 'unsupported' | 'occupied' | 'unknown';
}

interface UseShortcutReturn {
  registerShortcut: (shortcut: string, sceneId: string) => Promise<void>;
  registerShortcutWithResult: (shortcut: string, sceneId: string) => Promise<RegistrationResult>;
  unregisterShortcut: (shortcut: string) => Promise<void>;
  unregisterAllShortcuts: () => Promise<void>;
  registeredShortcuts: string[];
  isLoading: boolean;
  error: string | null;
  checkConflict: (shortcut: string) => string | null;
  setPaused: (paused: boolean) => void;
}

// keyhook 事件 payload 类型
interface KeyEventPayload {
  keycode: string;
  rawCode: number;
  eventType: string;
}

// 解析快捷键字符串为键名数组
// 例如: "F1" -> ["F1"], "Ctrl+Shift+A" -> ["Ctrl", "Shift", "A"]
function parseShortcutKeys(shortcut: string): string[] {
  if (!shortcut || shortcut.trim() === '') {
    return [];
  }

  // 处理 "+" 分隔的组合键
  const keys = shortcut.split('+').map(k => k.trim()).filter(k => k);

  // 规范化键名
  return keys.map(key => normalizeKeyName(key));
}

// 规范化键名（统一格式）
// 将用户输入的快捷键转换为 keyhook 返回的标准格式
function normalizeKeyName(key: string): string {
  // 处理修饰键的不同写法 -> keyhook 标准格式
  const modifierMap: Record<string, string> = {
    'ctrl': 'Ctrl',
    'leftctrl': 'LeftCtrl',
    'rightctrl': 'RightCtrl',
    'alt': 'Alt',
    'leftalt': 'LeftAlt',
    'rightalt': 'RightAlt',
    'shift': 'Shift',
    'leftshift': 'LeftShift',
    'rightshift': 'RightShift',
    'win': 'Windows',
    'leftwin': 'LeftWindows',
    'rightwin': 'RightWindows',
    'cmd': 'Cmd',
    'leftcmd': 'LeftCmd',
    'rightcmd': 'RightCmd',
    'option': 'Option',
    'leftoption': 'LeftOption',
    'rightoption': 'RightOption',
  };

  const lowerKey = key.toLowerCase();
  if (modifierMap[lowerKey]) {
    return modifierMap[lowerKey];
  }

  // 功能键保持原样 (F1-F24)
  if (/^F\d+$/i.test(key)) {
    return key.toUpperCase();
  }

  // 单个字母 -> KeyA 格式（与 keyhook 返回的格式匹配）
  if (/^[a-zA-Z]$/.test(key)) {
    return 'Key' + key.toUpperCase();
  }

  // 单个数字 -> Digit0 格式
  if (/^\d$/.test(key)) {
    return 'Digit' + key;
  }

  // 标点符号 -> keyhook 标准格式
  const symbolMap: Record<string, string> = {
    ';': 'Semicolon',
    '=': 'Equal',
    ',': 'Comma',
    '-': 'Minus',
    '.': 'Period',
    '/': 'Slash',
    '`': 'Backquote',
    '[': 'BracketLeft',
    '\\': 'Backslash',
    ']': 'BracketRight',
    "'": 'Quote',
  };
  if (symbolMap[key]) {
    return symbolMap[key];
  }

  // 特殊键保持原样
  return key;
}

/**
 * Hook for managing global shortcuts using keyhook plugin
 *
 * 工作原理：
 * 1. 使用 keyhook 插件监听全局键盘事件
 * 2. 前端维护 pressedKeys 状态，检测快捷键组合
 * 3. 支持双击检测：300ms 内按两次跳过 LLM
 */
export function useShortcut(options: UseShortcutOptions = {}): UseShortcutReturn {
  const { onShortcutTriggered, isRecording: externalIsRecording } = options;
  const [registeredShortcuts, setRegisteredShortcuts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 存储同步访问的状态
  const registeredShortcutsRef = useRef<string[]>([]);
  const shortcutToSceneRef = useRef<Map<string, string>>(new Map());
  const sceneToShortcutRef = useRef<Map<string, string>>(new Map());

  // 按键状态机
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // 暂停状态（编辑快捷键时暂停全局快捷键监听）
  const isPausedRef = useRef<boolean>(false);

  // 暂停恢复定时器
  const pauseResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 双击检测状态
  const pendingTriggerRef = useRef<Map<string, { timestamp: number; timerId: number | null }>>(new Map());

  // 最近触发的场景（防止双击后定时器再次触发）
  const recentlyTriggeredRef = useRef<Map<string, number>>(new Map());

  // 平台检测
  const isMacRef = useRef<boolean>(false);

  // keyhook 监听器取消函数
  const unlistenKeyhookRef = useRef<(() => void) | null>(null);

  // 外部录音状态的 ref（用于实时访问）
  const externalIsRecordingRef = useRef(externalIsRecording);
  externalIsRecordingRef.current = externalIsRecording;

  // 回调 ref
  const onShortcutTriggeredRef = useRef(onShortcutTriggered);
  onShortcutTriggeredRef.current = onShortcutTriggered;

  // 检查快捷键冲突
  const checkConflict = useCallback((shortcut: string): string | null => {
    if (registeredShortcutsRef.current.includes(shortcut)) {
      const conflictingScene = shortcutToSceneRef.current.get(shortcut);
      return conflictingScene
        ? `快捷键 "${shortcut}" 已绑定到场景 "${conflictingScene}"`
        : `快捷键 "${shortcut}" 已被使用`;
    }
    return null;
  }, []);

  // 触发快捷键回调
  const triggerShortcut = useCallback((sceneId: string, skipLlm: boolean) => {
    log.debug(`触发快捷键回调: sceneId=${sceneId}, skipLlm=${skipLlm}`);
    if (onShortcutTriggeredRef.current) {
      onShortcutTriggeredRef.current(sceneId, skipLlm);
    }
  }, []);

  // 处理快捷键匹配
  const handleShortcutMatch = useCallback((sceneId: string) => {
    const now = Date.now();

    // 检查最近是否触发过（防止按键按住时重复触发）
    const recentlyTriggered = recentlyTriggeredRef.current.get(sceneId);
    if (recentlyTriggered && now - recentlyTriggered < 500) {
      log.debug(`快捷键最近触发过，忽略: sceneId=${sceneId}`);
      return;
    }

    // 检查是否正在录音（使用外部状态）
    const isCurrentlyRecording = externalIsRecordingRef.current;
    log.info(`[Shortcut] 🎹 handleShortcutMatch: sceneId=${sceneId}, isCurrentlyRecording=${isCurrentlyRecording}`);
    console.log(`[Shortcut] handleShortcutMatch at ${now}: isRecording=${isCurrentlyRecording}`);

    if (!isCurrentlyRecording) {
      // 不在录音：立即触发开始录音（skipLlm=false）
      log.info(`[Shortcut] 空闲时按下快捷键，立即开始录音: sceneId=${sceneId}`);
      recentlyTriggeredRef.current.set(sceneId, now);
      triggerShortcut(sceneId, false);
      return;
    }

    // 正在录音：检查是否是双击
    const pending = pendingTriggerRef.current.get(sceneId);

    if (pending) {
      // 已有待处理的触发
      const elapsed = now - pending.timestamp;

      if (elapsed < DOUBLE_TAP_WINDOW_MS) {
        // 双击检测：取消待处理的单击，立即触发跳过 LLM
        if (pending.timerId !== null) {
          clearTimeout(pending.timerId);
          pending.timerId = null;
        }
        pendingTriggerRef.current.delete(sceneId);
        // 记录触发时间，防止按键按住时重复触发
        recentlyTriggeredRef.current.set(sceneId, now);
        log.debug(`检测到双击，跳过 LLM: sceneId=${sceneId}`);
        triggerShortcut(sceneId, true);
        return;
      }
    }

    // 记录这次触发，延迟 300ms 后执行（如果没有双击）
    const timerId = window.setTimeout(() => {
      const entry = pendingTriggerRef.current.get(sceneId);
      // 检查是否已被双击处理过
      if (entry?.timerId === timerId) {
        pendingTriggerRef.current.delete(sceneId);
        // 检查最近是否触发过（防止在定时器等待期间已经处理过）
        const triggered = recentlyTriggeredRef.current.get(sceneId);
        if (!triggered || Date.now() - triggered >= DOUBLE_TAP_WINDOW_MS) {
          log.debug(`单击确认，停止录音: sceneId=${sceneId}`);
          recentlyTriggeredRef.current.set(sceneId, Date.now());
          triggerShortcut(sceneId, false);
        }
      }
    }, DOUBLE_TAP_WINDOW_MS);

    pendingTriggerRef.current.set(sceneId, { timestamp: now, timerId });
  }, [triggerShortcut]);

  // 检查是否匹配已注册的快捷键
  const checkShortcutMatch = useCallback(() => {
    const pressedKeys = pressedKeysRef.current;

    // 遍历所有已注册的快捷键
    for (const [shortcut, sceneId] of shortcutToSceneRef.current.entries()) {
      const keys = parseShortcutKeys(shortcut);

      // 检查是否所有键都被按下
      const isAllPressed = keys.every(key => pressedKeys.has(key));

      if (isAllPressed) {
        // 匹配成功，触发快捷键
        log.debug(`快捷键匹配: ${shortcut} -> sceneId=${sceneId}`);
        handleShortcutMatch(sceneId);
        return;
      }
    }
  }, [handleShortcutMatch]);

  // 处理键盘事件
  const handleKeyEvent = useCallback((payload: KeyEventPayload) => {
    // 如果暂停，完全跳过处理（编辑快捷键时）
    if (isPausedRef.current) {
      return;
    }

    const { keycode, rawCode, eventType } = payload;

    // 使用 keyhook 返回的标准化键名
    // 优先使用 keycode，fallback 到 rawCode 映射
    const keyName = keycode !== 'Other' ? keycode : mapRawCodeToKeyName(rawCode, isMacRef.current);
    if (!keyName) {
      return; // 忽略未知按键
    }

    log.debug(`键盘事件: ${keyName} (${eventType})`);

    if (eventType === 'down') {
      // 按键按下
      const wasPressed = pressedKeysRef.current.has(keyName);
      pressedKeysRef.current.add(keyName);

      // 只有新按下的键才检查快捷键匹配
      if (!wasPressed) {
        checkShortcutMatch();
      }
    } else if (eventType === 'up') {
      // 按键释放
      pressedKeysRef.current.delete(keyName);
    }
  }, [checkShortcutMatch]);

  // 初始化 keyhook 监听
  const initializeKeyhook = useCallback(async () => {
    if (unlistenKeyhookRef.current) {
      return; // 已初始化
    }

    try {
      // 动态导入 keyhook 模块
      const { commands, events } = await import('@tauri-keyhook');

      // 检查是否正在监听
      const isListening = await commands.isListening();
      if (!isListening) {
        await commands.startListen();
      }

      // 监听键盘事件
      const unlisten = await events.keyEventPayload.listen((event) => {
        handleKeyEvent(event.payload);
      });

      unlistenKeyhookRef.current = unlisten;
      log.debug('Keyhook 初始化完成');
    } catch (err) {
      log.error(`Keyhook 初始化失败: ${err}`);
    }
  }, [handleKeyEvent]);

  // 注册快捷键
  const registerShortcut = useCallback(async (shortcut: string, sceneId: string) => {
    setIsLoading(true);
    setError(null);

    // 检查冲突
    const conflict = checkConflict(shortcut);
    if (conflict) {
      setError(conflict);
      setIsLoading(false);
      throw new Error(conflict);
    }

    // 更新状态
    registeredShortcutsRef.current.push(shortcut);
    shortcutToSceneRef.current.set(shortcut, sceneId);
    sceneToShortcutRef.current.set(sceneId, shortcut);
    setRegisteredShortcuts(prev => [...prev, shortcut]);

    log.debug(`快捷键已注册: ${shortcut} -> ${sceneId}`);
    setIsLoading(false);
  }, [checkConflict]);

  // 注册快捷键（带结果返回）
  const registerShortcutWithResult = useCallback(async (
    shortcut: string,
    sceneId: string
  ): Promise<RegistrationResult> => {
    setIsLoading(true);
    setError(null);

    // 检查冲突
    const conflict = checkConflict(shortcut);
    if (conflict) {
      setError(conflict);
      setIsLoading(false);
      return { success: false, error: conflict, errorType: 'occupied' };
    }

    // 更新状态
    registeredShortcutsRef.current.push(shortcut);
    shortcutToSceneRef.current.set(shortcut, sceneId);
    sceneToShortcutRef.current.set(sceneId, shortcut);
    setRegisteredShortcuts(prev => [...prev, shortcut]);

    log.debug(`快捷键已注册: ${shortcut} -> ${sceneId}`);
    setIsLoading(false);
    return { success: true };
  }, [checkConflict]);

  // 注销快捷键
  const unregisterShortcut = useCallback(async (shortcut: string) => {
    setIsLoading(true);
    setError(null);

    const sceneId = shortcutToSceneRef.current.get(shortcut);

    // 更新状态
    registeredShortcutsRef.current = registeredShortcutsRef.current.filter(s => s !== shortcut);
    shortcutToSceneRef.current.delete(shortcut);
    if (sceneId) {
      sceneToShortcutRef.current.delete(sceneId);
    }
    setRegisteredShortcuts(prev => prev.filter(s => s !== shortcut));

    log.debug(`快捷键已注销: ${shortcut}`);
    setIsLoading(false);
  }, []);

  // 注销所有快捷键
  const unregisterAllShortcuts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    registeredShortcutsRef.current = [];
    shortcutToSceneRef.current.clear();
    sceneToShortcutRef.current.clear();
    setRegisteredShortcuts([]);

    log.debug('所有快捷键已注销');
    setIsLoading(false);
  }, []);

  // 暂停/恢复快捷键监听（编辑快捷键时使用）
  const setPaused = useCallback((paused: boolean) => {
    // 清除之前的恢复定时器
    if (pauseResumeTimerRef.current) {
      clearTimeout(pauseResumeTimerRef.current);
      pauseResumeTimerRef.current = null;
    }

    if (paused) {
      // 暂停：立即暂停，清空按键状态
      isPausedRef.current = true;
      pressedKeysRef.current.clear();
      log.debug('快捷键监听已暂停');
    } else {
      // 恢复：延迟 300ms 后恢复，确保用户的按键操作完全结束
      pauseResumeTimerRef.current = setTimeout(() => {
        isPausedRef.current = false;
        pressedKeysRef.current.clear();
        log.debug('快捷键监听已恢复');
      }, 300);
    }
  }, []);

  // 初始化：设置事件监听和 keyhook
  useEffect(() => {
    const init = async () => {
      // 检测平台：使用 navigator.userAgent 检测 macOS
      isMacRef.current = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

      // 初始化 keyhook
      await initializeKeyhook();
    };

    init();

    return () => {
      // 清理 keyhook 监听
      if (unlistenKeyhookRef.current) {
        unlistenKeyhookRef.current();
        unlistenKeyhookRef.current = null;
      }
      // 清理暂停恢复定时器
      if (pauseResumeTimerRef.current) {
        clearTimeout(pauseResumeTimerRef.current);
        pauseResumeTimerRef.current = null;
      }
      // 清理待处理的定时器
      for (const [, pending] of pendingTriggerRef.current) {
        if (pending.timerId !== null) {
          clearTimeout(pending.timerId);
        }
      }
      pendingTriggerRef.current.clear();
      recentlyTriggeredRef.current.clear();
    };
  }, [initializeKeyhook]);

  return {
    registerShortcut,
    registerShortcutWithResult,
    unregisterShortcut,
    unregisterAllShortcuts,
    registeredShortcuts,
    isLoading,
    error,
    checkConflict,
    setPaused,
  };
}

/**
 * Register shortcuts for a list of scenes
 *
 * @param scenes Array of scenes to register shortcuts for
 * @param onShortcutTriggered Callback when any shortcut is triggered (sceneId, skipLlm)
 * @param isRecording Current recording state (used for double-tap detection)
 */
export function useSceneShortcuts(
  scenes: Scene[],
  onShortcutTriggered?: (sceneId: string, skipLlm: boolean) => void,
  isRecording?: boolean
) {
  const {
    registerShortcut,
    registerShortcutWithResult,
    unregisterAllShortcuts,
    registeredShortcuts,
    isLoading,
    error,
    checkConflict,
    setPaused,
  } = useShortcut({ onShortcutTriggered, isRecording });

  // Register shortcuts for all enabled scenes
  const registerAllScenes = useCallback(async () => {
    await unregisterAllShortcuts();

    const enabledScenes = scenes.filter((scene) => scene.enabled);
    for (const scene of enabledScenes) {
      try {
        await registerShortcut(scene.shortcut, scene.id);
      } catch (err) {
        log.error(`Failed to register shortcut for scene ${scene.id}: ${err}`);
      }
    }
  }, [scenes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for shortcut conflicts with existing scenes
  const checkShortcutConflict = useCallback((shortcut: string, excludeSceneId?: string): string | null => {
    // Check if shortcut is already registered in our list
    const existingScene = scenes.find(
      (s) => s.shortcut === shortcut && s.id !== excludeSceneId && s.enabled
    );
    if (existingScene) {
      return `快捷键 "${shortcut}" 已绑定到场景 "${existingScene.name}"`;
    }
    return checkConflict(shortcut);
  }, [scenes, checkConflict]);

  // Track if we've already registered to prevent re-registration
  const scenesKey = scenes.map(s => `${s.id}:${s.shortcut}:${s.enabled}`).join(',');

  // Unregister all and register again when scenes change
  useEffect(() => {
    if (scenes.length > 0) {
      // Use IIFE to handle async operation
      (async () => {
        await unregisterAllShortcuts();
        const enabledScenes = scenes.filter((scene) => scene.enabled);
        for (const scene of enabledScenes) {
          try {
            await registerShortcut(scene.shortcut, scene.id);
          } catch (err) {
            console.error(`Failed to register shortcut for scene ${scene.id}:`, err);
          }
        }
      })();
    }

    return () => {
      unregisterAllShortcuts();
    };
    // Only re-run when scenes content actually changes, not when functions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenesKey]);

  return {
    registerAllScenes,
    registerShortcutWithResult,
    unregisterAllShortcuts,
    registeredShortcuts,
    isLoading,
    error,
    checkConflict: checkShortcutConflict,
    setPaused,
  };
}