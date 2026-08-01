import { invoke } from '../utils/tauri';

export interface FloatPanelState {
  visible: boolean;
  status: 'idle' | 'recording' | 'transcribing' | 'typing';
  sceneName?: string;
  text?: string;
  // 进度条相关字段
  modelId?: string;
  device?: 'CPU' | 'GPU';
  audioDuration?: number;
  isTranscribing?: boolean;
  // LLM 进度相关字段
  llmModelId?: string;
  hasLlmProfile?: boolean;
  textLen?: number;
  // 双击跳过 LLM 标记
  skipLlm?: boolean;
  // 分段转录开关（用于控制状态指示器）
  segmentTranscribe?: boolean;
}

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