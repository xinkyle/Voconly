// TypeScript bindings for tauri-plugin-keyhook
// 键盘事件 payload 类型

export interface KeyEventPayload {
  /** 标准化按键名称，如 LeftCtrl、RightShift */
  keycode: string;
  /** 平台特定的原始键码 */
  rawCode: number;
  /** 按键状态：down 或 up */
  eventType: string;
}

/** keyhook 命令 */
export const commands = {
  /** 开始监听键盘事件 */
  async startListen(): Promise<void> {
    await invoke("plugin:keyhook|start_listen");
  },

  /** 停止监听键盘事件 */
  async stopListen(): Promise<void> {
    await invoke("plugin:keyhook|stop_listen");
  },

  /** 检查是否正在监听 */
  async isListening(): Promise<boolean> {
    return await invoke("plugin:keyhook|is_listening");
  },

  /** 设置快捷键拦截（拦截按键并阻止传递给其他应用） */
  async setShortcutBlock(keycodes: string[]): Promise<void> {
    await invoke("plugin:keyhook|set_shortcut_block", { keycodes });
  },

  /** 清除拦截规则 */
  async clearBlockRule(): Promise<void> {
    await invoke("plugin:keyhook|clear_block_rule");
  },
};

/** keyhook 事件 */
export const events = {
  /** 键盘事件 */
  keyEventPayload: {
    /** 监听键盘事件 */
    listen: (callback: (event: { payload: KeyEventPayload }) => void) => {
      return listenKeyEvent(callback);
    },
  },
};

import { invoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

/** 监听键盘事件 */
async function listenKeyEvent(
  callback: (event: { payload: KeyEventPayload }) => void
): Promise<() => void> {
  return await tauriListen<KeyEventPayload>("keyhook:key-event", callback);
}