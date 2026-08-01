import type { HistoryRecord } from '../types';
import { invoke } from '../utils/tauri';
import { createLogger } from './log';

// 创建日志记录器
const log = createLogger('History');

// 内存缓存（仅用于当前页）
let historyCache: HistoryRecord[] | null = null;
let totalCount: number = 0;

// 类型转换：前端 camelCase -> 后端 camelCase (Rust 端已使用 camelCase)
interface RustHistoryRecord {
  id: string;
  timestamp: number;
  content: string;
  duration: number;
  wordCount: number;
}

function fromRustRecord(record: RustHistoryRecord): HistoryRecord {
  return {
    id: record.id,
    timestamp: record.timestamp,
    content: record.content,
    duration: record.duration,
    wordCount: record.wordCount,
  };
}

/**
 * 加载历史记录（默认加载第一页，100条）
 */
export async function loadHistory(): Promise<HistoryRecord[]> {
  if (historyCache !== null) {
    return historyCache;
  }

  try {
    const rustHistory = await invoke<RustHistoryRecord[]>('load_history');
    const history = rustHistory.map(fromRustRecord);
    historyCache = history;
    return history;
  } catch (error) {
    log.error(`Failed to load history: ${error}`);
    historyCache = [];
    return [];
  }
}

/**
 * 获取历史记录总数
 */
export async function getHistoryCount(): Promise<number> {
  try {
    const count = await invoke<number>('get_history_count');
    totalCount = count;
    return count;
  } catch (error) {
    log.error(`Failed to get history count: ${error}`);
    return 0;
  }
}

/**
 * 分页加载历史记录
 * @param page 页码（从1开始）
 * @param pageSize 每页条数（默认100）
 */
export async function loadHistoryPaged(page: number, pageSize: number = 100): Promise<{
  records: HistoryRecord[];
  total: number;
  totalPages: number;
}> {
  try {
    const rustHistory = await invoke<RustHistoryRecord[]>('load_history_paged', {
      page,
      pageSize,
    });
    const records = rustHistory.map(fromRustRecord);

    // 获取总数（如果还没获取过）
    if (totalCount === 0) {
      totalCount = await getHistoryCount();
    }

    const totalPages = Math.ceil(totalCount / pageSize);

    // 更新缓存
    if (page === 1) {
      historyCache = records;
    }

    return {
      records,
      total: totalCount,
      totalPages,
    };
  } catch (error) {
    log.error(`Failed to load history paged: ${error}`);
    return {
      records: [],
      total: 0,
      totalPages: 0,
    };
  }
}

/**
 * 保存历史记录到持久化存储
 * 注意：在SQLite模式下，这会清空表再插入（全量替换）
 */
export async function saveHistory(history: HistoryRecord[]): Promise<void> {
  historyCache = history;

  try {
    const rustHistory = history.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      content: r.content,
      duration: r.duration,
      wordCount: r.wordCount,
    }));
    await invoke('save_history', { history: rustHistory });
    // 更新总数
    totalCount = history.length;
  } catch (error) {
    log.error(`Failed to save history: ${error}`);
  }
}

/**
 * 添加一条历史记录
 */
export async function addHistoryRecord(record: Omit<HistoryRecord, 'id'>): Promise<HistoryRecord> {
  try {
    const rustRecord = await invoke<RustHistoryRecord>('add_history_record', {
      content: record.content,
      duration: record.duration,
      wordCount: record.wordCount,
      timestamp: record.timestamp,
    });

    const newRecord = fromRustRecord(rustRecord);

    // 更新缓存（添加到开头）
    if (historyCache !== null) {
      historyCache = [newRecord, ...historyCache].slice(0, 100);
    }

    // 更新总数
    totalCount += 1;

    return newRecord;
  } catch (error) {
    log.error(`Failed to add history record: ${error}`);
    throw error;
  }
}

/**
 * 删除单条历史记录
 */
export async function deleteHistoryRecord(id: string): Promise<void> {
  try {
    await invoke('delete_history_record', { id });

    // 更新缓存
    if (historyCache !== null) {
      historyCache = historyCache.filter(r => r.id !== id);
    }

    // 更新总数
    totalCount = Math.max(0, totalCount - 1);
  } catch (error) {
    log.error(`Failed to delete history record: ${error}`);
    throw error;
  }
}

/**
 * 清空所有历史记录
 */
export async function clearHistory(): Promise<void> {
  historyCache = [];
  totalCount = 0;

  try {
    await invoke('clear_history');
  } catch (error) {
    log.error(`Failed to clear history: ${error}`);
  }
}

/**
 * 归档统计信息
 */
export interface ArchiveStats {
  fileCount: number;
  totalRecords: number;
}

/**
 * 获取归档统计信息
 */
export async function getArchiveStats(): Promise<ArchiveStats> {
  try {
    return await invoke<ArchiveStats>('get_archive_stats');
  } catch (error) {
    log.error(`Failed to get archive stats: ${error}`);
    return { fileCount: 0, totalRecords: 0 };
  }
}

/**
 * 完整统计信息
 */
export interface FullStats {
  totalDuration: number;
  totalWords: number;
  totalCount: number;
  todayCount: number;
  firstRecordDate?: string;
  activeDays: number;
}

/**
 * 获取完整统计信息
 */
export async function getFullStats(): Promise<FullStats> {
  try {
    return await invoke<FullStats>('get_full_stats');
  } catch (error) {
    log.error(`Failed to get full stats: ${error}`);
    return { totalDuration: 0, totalWords: 0, totalCount: 0, todayCount: 0, activeDays: 0 };
  }
}

/**
 * 重新计算统计数据（从数据库重建）
 */
export async function rebuildStats(): Promise<FullStats> {
  try {
    return await invoke<FullStats>('rebuild_stats');
  } catch (error) {
    log.error(`Failed to rebuild stats: ${error}`);
    return { totalDuration: 0, totalWords: 0, totalCount: 0, todayCount: 0, activeDays: 0 };
  }
}

/**
 * 清除缓存（用于强制刷新）
 */
export function clearHistoryCache(): void {
  historyCache = null;
  totalCount = 0;
}