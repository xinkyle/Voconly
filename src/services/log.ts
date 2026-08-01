/**
 * Frontend log service - bridges to Rust backend log system
 * Logs are written to file via tauri-plugin-log
 */

import { invoke } from '../utils/tauri';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Log a message to the backend log system
 */
async function logToBackend(level: LogLevel, message: string, context?: string): Promise<void> {
  try {
    const formattedMessage = context ? `[${context}] ${message}` : message;
    // We use a simple approach: just call invoke to log
    // The backend already handles logging via tauri-plugin-log
    await invoke('log_from_frontend', {
      level,
      message: formattedMessage
    });
  } catch {
    // Silently fail - don't break the app if logging fails
  }
}

/**
 * Log info level message
 */
export async function logInfo(message: string, context?: string): Promise<void> {
  // Also log to console for development
  if (context) {
    console.log(`[${context}] ${message}`);
  } else {
    console.log(message);
  }
  await logToBackend('info', message, context);
}

/**
 * Log debug level message
 */
export async function logDebug(message: string, context?: string): Promise<void> {
  if (context) {
    console.log(`[${context}] ${message}`);
  } else {
    console.log(message);
  }
  await logToBackend('debug', message, context);
}

/**
 * Log warn level message
 */
export async function logWarn(message: string, context?: string): Promise<void> {
  if (context) {
    console.warn(`[${context}] ${message}`);
  } else {
    console.warn(message);
  }
  await logToBackend('warn', message, context);
}

/**
 * Log error level message
 */
export async function logError(message: string, context?: string): Promise<void> {
  if (context) {
    console.error(`[${context}] ${message}`);
  } else {
    console.error(message);
  }
  await logToBackend('error', message, context);
}

/**
 * Log trace level message
 */
export async function logTrace(message: string, context?: string): Promise<void> {
  if (context) {
    console.log(`[${context}] [TRACE] ${message}`);
  } else {
    console.log(`[TRACE] ${message}`);
  }
  await logToBackend('trace', message, context);
}

/**
 * Create a logger with a fixed context
 */
export function createLogger(context: string) {
  return {
    info: (message: string) => logInfo(message, context),
    debug: (message: string) => logDebug(message, context),
    warn: (message: string) => logWarn(message, context),
    error: (message: string) => logError(message, context),
    trace: (message: string) => logTrace(message, context),
  };
}

// Default export with all methods
export default {
  info: logInfo,
  debug: logDebug,
  warn: logWarn,
  error: logError,
  trace: logTrace,
  createLogger,
};