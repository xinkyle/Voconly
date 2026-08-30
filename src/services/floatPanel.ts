import { invoke } from '../utils/tauri';
import type { FloatPanelState } from '../types';

// Re-export for backward compatibility
export type { FloatPanelState };

/**
 * Show the global float panel with the given state
 */
export async function showFloatPanel(state: Omit<FloatPanelState, 'visible'>): Promise<void> {
  const fullState: FloatPanelState = {
    ...state,
    visible: true,
  };

  console.log('[floatPanel] Sending state to backend:', JSON.stringify(fullState, null, 2));
  console.log('[floatPanel] Status value:', fullState.status, typeof fullState.status);
  await invoke('show_float_panel', { state: fullState });
}

/**
 * Hide the global float panel
 */
export async function hideFloatPanel(reason: string = 'unknown'): Promise<void> {
  console.log(`[floatPanel] hideFloatPanel called, reason: ${reason}`);
  console.trace('[floatPanel] hideFloatPanel call stack');
  await invoke('hide_float_panel', { reason });
}