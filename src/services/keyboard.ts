/**
 * Keyboard Service
 * Wraps keyboard simulation backend commands for text input
 */

import { invoke } from '../utils/tauri';
import { createLogger } from './log';

// 创建日志记录器
const log = createLogger('Keyboard');

/**
 * Type text at current cursor position using keyboard simulation
 * @param text Text to input
 * @returns Promise that resolves when input is complete
 * @throws Error if keyboard simulation fails
 */
export async function typeText(text: string): Promise<void> {
  const callId = Date.now();
  log.info(`[${callId}] typeText called, text length: ${text.length}`);
  try {
    const result = await invoke<void>('simulate_input', { text });
    log.info(`[${callId}] typeText completed successfully`);
    return result;
  } catch (error) {
    log.error(`[${callId}] typeText failed: ${error}`);
    throw error;
  }
}

/**
 * Type text with error handling and logging
 * @param text Text to input
 * @returns Result object with success status and optional error message
 */
export async function typeTextSafe(text: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 保留换行符，让 LLM 处理后的段落结构能够正确显示
    await typeText(text);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ACCESSIBILITY_DENIED')) {
      // macOS 辅助功能权限未授予：模拟粘贴失败，但后端已先把文字写入剪贴板。
      // 通知全局监听器（App.tsx）展示权限引导，用户可手动 ⌘V 粘贴，文字不丢失
      log.error('Accessibility permission denied, text kept in clipboard');
      window.dispatchEvent(new CustomEvent('voconly:accessibility-denied'));
      return { success: false, error: 'ACCESSIBILITY_DENIED' };
    }
    log.error(`Keyboard simulation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export default {
  typeText,
  typeTextSafe,
};