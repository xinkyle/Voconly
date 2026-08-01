import { useEffect, useCallback, useState, useRef } from 'react';
import type { Scene } from '../types';
import { invoke, listen } from '../utils/tauri';
import { createLogger } from '../services/log';

// 创建日志记录器
const log = createLogger('Shortcut');

interface ShortcutTriggerPayload {
  sceneId: string;
  skipLlm: boolean;
}

interface UseShortcutOptions {
  onShortcutTriggered?: (sceneId: string, skipLlm: boolean) => void;
}

// Registration result for fallback handling
interface RegistrationResult {
  success: boolean;
  error?: string;
  errorType?: 'unsupported' | 'occupied' | 'unknown';
}

// Parse error message to determine error type
function parseShortcutError(errorMessage: string): 'unsupported' | 'occupied' | 'unknown' {
  const lower = errorMessage.toLowerCase();
  if (lower.includes("couldn't recognize") || lower.includes('invalid shortcut format')) {
    return 'unsupported';
  }
  if (lower.includes('already registered') || lower.includes('already used')) {
    return 'occupied';
  }
  return 'unknown';
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
}

/**
 * Hook for managing global shortcuts
 *
 * Provides functionality to:
 * - Register global shortcuts that trigger callbacks when pressed
 * - Unregister shortcuts
 * - Listen for shortcut-triggered events from the Rust backend
 */
export function useShortcut(options: UseShortcutOptions = {}): UseShortcutReturn {
  const { onShortcutTriggered } = options;
  const [registeredShortcuts, setRegisteredShortcuts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs for synchronous access during batch operations
  const registeredShortcutsRef = useRef<string[]>([]);
  const shortcutToSceneRef = useRef<Map<string, string>>(new Map());

  // Check if a shortcut conflicts with existing registered shortcuts
  const checkConflict = useCallback((shortcut: string): string | null => {
    // Use ref for synchronous check
    if (registeredShortcutsRef.current.includes(shortcut)) {
      const conflictingScene = shortcutToSceneRef.current.get(shortcut);
      return conflictingScene ? `Shortcut "${shortcut}" is bound to scene "${conflictingScene}"` : `Shortcut "${shortcut}" is already in use`;
    }
    return null;
  }, []);

  // Keep callback ref updated
  const onShortcutTriggeredRef = useRef(onShortcutTriggered);
  onShortcutTriggeredRef.current = onShortcutTriggered;

  // Set up event listener for shortcut-triggered events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;

    log.debug('Setting up shortcut listener');

    listen<ShortcutTriggerPayload>('shortcut-triggered', (event) => {
      const { sceneId, skipLlm } = event.payload;
      log.debug(`Shortcut triggered event received, sceneId: ${sceneId}, skipLlm: ${skipLlm}`);
      log.debug(`onShortcutTriggeredRef.current: ${onShortcutTriggeredRef.current ? 'exists' : 'null'}`);
      // Use ref to get latest callback
      if (onShortcutTriggeredRef.current) {
        log.debug('Calling onShortcutTriggered callback');
        onShortcutTriggeredRef.current(sceneId, skipLlm);
        log.debug('onShortcutTriggered callback returned');
      } else {
        log.warn('onShortcutTriggeredRef.current is null');
      }
    }).then(fn => {
      if (mounted) {
        unlisten = fn;
        log.debug('Listener setup complete');
      } else {
        fn();
      }
    }).catch(err => {
      log.error(`Failed to setup shortcut listener: ${err}`);
    });

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // Empty deps - listener set up once

  // Register a global shortcut
  const registerShortcut = useCallback(async (shortcut: string, sceneId: string) => {
    setIsLoading(true);
    setError(null);

    // First check for conflict in frontend
    const conflict = checkConflict(shortcut);
    if (conflict) {
      setError(conflict);
      setIsLoading(false);
      throw new Error(conflict);
    }

    try {
      await invoke('register_shortcut', { shortcut, sceneId });
      // Update ref synchronously for immediate use in batch operations
      registeredShortcutsRef.current.push(shortcut);
      shortcutToSceneRef.current.set(shortcut, sceneId);
      // Update state for UI
      setRegisteredShortcuts((prev) => [...prev, shortcut]);
      log.debug(`Shortcut registered: ${shortcut} for scene: ${sceneId}`);
    } catch (err) {
      // Handle conflict error from Rust backend
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.toLowerCase().includes('already') ||
          errorMessage.toLowerCase().includes('conflict') ||
          errorMessage.toLowerCase().includes('registered')) {
        setError(`Shortcut "${shortcut}" is already used by another app or scene`);
      } else {
        setError(errorMessage);
      }
      log.error(`Failed to register shortcut: ${errorMessage}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [checkConflict]);

  // Register shortcut with fallback support - returns result instead of throwing
  const registerShortcutWithResult = useCallback(async (
    shortcut: string,
    sceneId: string
  ): Promise<RegistrationResult> => {
    setIsLoading(true);
    setError(null);

    // First check for conflict in frontend
    const conflict = checkConflict(shortcut);
    if (conflict) {
      setError(conflict);
      setIsLoading(false);
      return { success: false, error: conflict, errorType: 'occupied' };
    }

    try {
      await invoke('register_shortcut', { shortcut, sceneId });
      // Update ref synchronously for immediate use in batch operations
      registeredShortcutsRef.current.push(shortcut);
      shortcutToSceneRef.current.set(shortcut, sceneId);
      // Update state for UI
      setRegisteredShortcuts((prev) => [...prev, shortcut]);
      log.debug(`Shortcut registered: ${shortcut} for scene: ${sceneId}`);
      return { success: true };
    } catch (err) {
      // Handle error from Rust backend
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorType = parseShortcutError(errorMessage);
      setError(errorMessage);
      log.error(`Failed to register shortcut: ${errorMessage}`);
      return { success: false, error: errorMessage, errorType };
    } finally {
      setIsLoading(false);
    }
  }, [checkConflict]);

  // Unregister a specific shortcut
  const unregisterShortcut = useCallback(async (shortcut: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await invoke('unregister_shortcut', { shortcut });
      // Update ref synchronously
      registeredShortcutsRef.current = registeredShortcutsRef.current.filter((s) => s !== shortcut);
      shortcutToSceneRef.current.delete(shortcut);
      // Update state for UI
      setRegisteredShortcuts((prev) => prev.filter((s) => s !== shortcut));
      log.debug(`Shortcut unregistered: ${shortcut}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      log.error(`Failed to unregister shortcut: ${errorMessage}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Unregister all shortcuts
  const unregisterAllShortcuts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await invoke('unregister_all_shortcuts');
      // Update ref synchronously
      registeredShortcutsRef.current = [];
      shortcutToSceneRef.current = new Map();
      // Update state for UI
      setRegisteredShortcuts([]);
      log.debug('All shortcuts unregistered');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      log.error(`Failed to unregister all shortcuts: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load registered shortcuts on mount
  useEffect(() => {
    let mounted = true;

    const loadShortcuts = async () => {
      try {
        const shortcuts = await invoke<string[]>('get_registered_shortcuts');
        if (mounted) {
          // Update both ref and state
          registeredShortcutsRef.current = shortcuts;
          setRegisteredShortcuts(shortcuts);
        }
      } catch (err) {
        log.error(`Failed to get registered shortcuts: ${err}`);
      }
    };

    loadShortcuts();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    registerShortcut,
    registerShortcutWithResult,
    unregisterShortcut,
    unregisterAllShortcuts,
    registeredShortcuts,
    isLoading,
    error,
    checkConflict,
  };
}

/**
 * Register shortcuts for a list of scenes
 *
 * @param scenes Array of scenes to register shortcuts for
 * @param onShortcutTriggered Callback when any shortcut is triggered (sceneId, skipLlm)
 */
export function useSceneShortcuts(
  scenes: Scene[],
  onShortcutTriggered?: (sceneId: string, skipLlm: boolean) => void
) {
  const {
    registerShortcut,
    registerShortcutWithResult,
    unregisterAllShortcuts,
    registeredShortcuts,
    isLoading,
    error,
    checkConflict,
  } = useShortcut({ onShortcutTriggered });

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
      return `Shortcut "${shortcut}" is bound to scene "${existingScene.name}"`;
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
  };
}