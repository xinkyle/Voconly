/**
 * Keyboard Service
 * Wraps keyboard simulation backend commands for text input
 */

import { invoke } from '../utils/tauri';
import { createLogger } from './log';
import { deliverTextOnce, type InputOutcome } from './textDelivery';
export type { InputOutcome } from './textDelivery';

// 创建日志记录器
const log = createLogger('Keyboard');

/**
 * Deliver text to the focused editor and report the target confirmation status.
 * @param text Text to input
 * @returns Delivery outcome; submission alone does not confirm insertion.
 * @throws Error if keyboard simulation fails
 */
export async function typeText(text: string): Promise<InputOutcome> {
  const callId = Date.now();
  log.info(`[${callId}] typeText called, text length: ${text.length}`);
  try {
    const result = await invoke<InputOutcome>('simulate_input', { text });
    log.info(`[${callId}] delivery status=${result.status}, method=${result.method}, reason=${result.reason || ''}`);
    return result;
  } catch (error) {
    log.error(`[${callId}] typeText failed: ${error}`);
    throw error;
  }
}

/**
 * Type text with error handling and logging
 * @param text Text to input
 * @returns Delivery outcome without automatically retrying a failed IPC call.
 */
export async function typeTextSafe(text: string): Promise<InputOutcome> {
  const outcome = await deliverTextOnce(text, typeText);
  if (outcome.reason?.includes('ACCESSIBILITY_DENIED')) {
    // macOS permission failure happens after the result was copied to the clipboard.
    log.error('Accessibility permission denied, text kept in clipboard');
    window.dispatchEvent(new CustomEvent('voconly:accessibility-denied'));
  }
  return outcome;
}

export default {
  typeText,
  typeTextSafe,
};
