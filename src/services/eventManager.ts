/**
 * 全局事件监听管理器
 * 确保同一事件只有一个监听器，避免 React Strict Mode 等场景下的重复注册
 */

import { listen } from '../utils/tauri';

type UnlistenFn = () => void;

class EventListenerManager {
  private listeners: Map<string, UnlistenFn> = new Map();
  private pendingSetup: Map<string, Promise<UnlistenFn>> = new Map();

  /**
   * 确保事件只有一个监听器
   * 如果已有监听器，会先取消旧的再注册新的
   */
  async ensureOnce<T>(
    event: string,
    handler: (event: { payload: T }) => void | Promise<void>
  ): Promise<void> {
    // 如果正在设置中，等待完成
    const pending = this.pendingSetup.get(event);
    if (pending) {
      await pending;
    }

    // 取消现有监听器
    const existingUnlisten = this.listeners.get(event);
    if (existingUnlisten) {
      existingUnlisten();
      this.listeners.delete(event);
    }

    // 注册新监听器
    const setupPromise = listen<T>(event, handler);
    this.pendingSetup.set(event, setupPromise);

    try {
      const unlisten = await setupPromise;
      this.listeners.set(event, unlisten);
    } finally {
      this.pendingSetup.delete(event);
    }
  }

  /**
   * 取消指定事件的监听
   */
  off(event: string): void {
    const unlisten = this.listeners.get(event);
    if (unlisten) {
      unlisten();
      this.listeners.delete(event);
    }
  }

  /**
   * 取消所有监听
   */
  offAll(): void {
    this.listeners.forEach((unlisten) => unlisten());
    this.listeners.clear();
  }
}

export const eventManager = new EventListenerManager();