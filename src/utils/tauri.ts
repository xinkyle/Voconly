/**
 * Tauri API helpers with dynamic imports
 * Prevents errors when APIs are not yet initialized
 */

// Cache for loaded APIs
let cachedInvoke: typeof import('@tauri-apps/api/core').invoke | null = null;
let cachedListen: typeof import('@tauri-apps/api/event').listen | null = null;
let cachedEmit: typeof import('@tauri-apps/api/event').emit | null = null;
let cachedEmitTo: typeof import('@tauri-apps/api/event').emitTo | null = null;

/**
 * Get invoke function with dynamic import
 */
export async function getInvoke(): Promise<typeof import('@tauri-apps/api/core').invoke> {
  if (cachedInvoke) return cachedInvoke;
  const { invoke } = await import('@tauri-apps/api/core');
  cachedInvoke = invoke;
  return invoke;
}

/**
 * Get listen function with dynamic import
 */
export async function getListen(): Promise<typeof import('@tauri-apps/api/event').listen> {
  if (cachedListen) return cachedListen;
  const { listen } = await import('@tauri-apps/api/event');
  cachedListen = listen;
  return listen;
}

/**
 * Get emit function with dynamic import
 */
export async function getEmit(): Promise<typeof import('@tauri-apps/api/event').emit> {
  if (cachedEmit) return cachedEmit;
  const { emit } = await import('@tauri-apps/api/event');
  cachedEmit = emit;
  return emit;
}

/**
 * Get emitTo function with dynamic import
 */
export async function getEmitTo(): Promise<typeof import('@tauri-apps/api/event').emitTo> {
  if (cachedEmitTo) return cachedEmitTo;
  const { emitTo } = await import('@tauri-apps/api/event');
  cachedEmitTo = emitTo;
  return emitTo;
}

/**
 * Safe invoke wrapper
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invokeFn = await getInvoke();
  return invokeFn<T>(cmd, args);
}

/**
 * Safe listen wrapper
 */
export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> {
  const listenFn = await getListen();
  return listenFn<T>(event, handler);
}

/**
 * Safe emit wrapper - emit event to all windows
 */
export async function emit<T>(event: string, payload: T): Promise<void> {
  const emitFn = await getEmit();
  return emitFn<T>(event, payload);
}

/**
 * Safe emitTo wrapper - emit event to a specific window
 */
export async function emitTo<T>(target: string, event: string, payload: T): Promise<void> {
  const emitToFn = await getEmitTo();
  return emitToFn<T>(target, event, payload);
}