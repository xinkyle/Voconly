/**
 * Performance Service
 * 性能统计服务 - 记录转录性能并预估进度
 * 数据存储在后端，启动时加载到内存缓存
 */

import { invoke } from '../utils/tauri';

/**
 * 性能统计记录
 */
export interface TranscribeStats {
  samples: number;
  avgRtf: number;
  minRtf: number;
  maxRtf: number;
  lastUpdated: number;
  // 累积数据用于精确计算平均RTF
  totalAudioDuration: number; // 累计音频时长（秒）
  totalTranscribeTime: number; // 累计识别时间（秒）
}

/**
 * 区间统计数据
 */
export interface IntervalStats {
  samples: number;
  avgTimeMs: number;  // 平均处理时间（毫秒）
  minTimeMs: number;
  maxTimeMs: number;
}

/**
 * LLM 性能统计记录（区间模型）
 */
export interface LlmStats {
  short: IntervalStats;   // 短文本区间（<100字）- 固定值
  medium: IntervalStats;  // 中文本区间（100-300字）- 固定值
  long: IntervalStats;    // 长文本区间（>300字）- 废弃，保留兼容

  // 新增：300字以上的动态速度参数
  longCharsPerSec: number;  // EWMA更新的处理速度（字/秒），初始160
  longSamples: number;      // 300字以上样本计数
  longAvgSpeed: number;     // 累积平均速度（用于日志对比）

  lastUpdated: number;
}

/**
 * 创建默认的 LlmStats 结构
 */
export function createDefaultLlmStats(): LlmStats {
  return {
    short: { samples: 0, avgTimeMs: 500, minTimeMs: 500, maxTimeMs: 500 },
    medium: { samples: 0, avgTimeMs: 700, minTimeMs: 700, maxTimeMs: 700 },
    long: { samples: 0, avgTimeMs: 1000, minTimeMs: 1000, maxTimeMs: 1000 },
    longCharsPerSec: 160,
    longSamples: 0,
    longAvgSpeed: 160,
    lastUpdated: 0,
  };
}

/**
 * 性能统计数据库
 */
export interface PerformanceStats {
  [key: string]: TranscribeStats;
}

/**
 * LLM 性能统计数据库
 */
export interface LlmPerformanceStats {
  [key: string]: LlmStats;
}

/**
 * 记录性能的请求参数
 */
export interface RecordPerformanceRequest {
  modelId: string;
  device: 'CPU' | 'GPU';
  audioDuration: number;
  transcribeTime: number;
}

/**
 * 预估时间的请求参数
 */
export interface EstimateTimeRequest {
  modelId: string;
  device: 'CPU' | 'GPU';
  audioDuration: number;
}

/**
 * 预估时间的响应
 */
export interface EstimateTimeResponse {
  estimatedTime: number;
  hasSufficientData: boolean;
  samples: number;
  avgRtf: number;
}

/**
 * 预估 LLM 时间的响应
 */
export interface EstimateLlmTimeResponse {
  estimatedTime: number;  // 秒
  hasSufficientData: boolean;
  interval: string;        // "short", "medium", "long"
  samples: number;
  avgTimeMs: number;     // 该区间的平均时间（毫秒）
  charsPerSec?: number;  // >300字时的处理速度（字/秒）
}

// 内存缓存 - 启动时从后端加载
let memoryCache: PerformanceStats = {};
let llmMemoryCache: LlmPerformanceStats = {};
let isInitialized = false;
let isLlmInitialized = false;

/**
 * 初始化性能缓存 - 从后端加载数据
 * 应在应用启动时调用
 */
export async function initPerformanceCache(): Promise<void> {
  console.log('[Performance] initPerformanceCache called, isInitialized:', isInitialized);
  if (isInitialized) {
    console.log('[Performance] Already initialized, skipping');
    return;
  }

  try {
    console.log('[Performance] Fetching stats from backend...');
    const result = await invoke<{ stats: PerformanceStats }>('get_performance_stats');
    console.log('[Performance] Backend response:', result);
    memoryCache = result.stats || {};
    isInitialized = true;
    console.log('[Performance] Cache initialized from backend, keys:', Object.keys(memoryCache).length, 'cache:', memoryCache);
  } catch (e) {
    console.error('[Performance] Failed to initialize cache from backend:', e);
    memoryCache = {};
    isInitialized = true;
  }
}

/**
 * 初始化 LLM 性能缓存 - 从后端加载数据
 */
export async function initLlmPerformanceCache(): Promise<void> {
  console.log('[Performance] initLlmPerformanceCache called, isLlmInitialized:', isLlmInitialized);
  if (isLlmInitialized) {
    console.log('[Performance] LLM already initialized, skipping');
    return;
  }

  try {
    console.log('[Performance] Fetching LLM stats from backend...');
    const result = await invoke<{ stats: LlmPerformanceStats }>('get_llm_performance_stats');
    console.log('[Performance] LLM Backend response:', result);
    llmMemoryCache = result.stats || {};
    isLlmInitialized = true;
    console.log('[Performance] LLM Cache initialized from backend, keys:', Object.keys(llmMemoryCache).length, 'cache:', llmMemoryCache);
  } catch (e) {
    console.error('[Performance] Failed to initialize LLM cache from backend:', e);
    llmMemoryCache = {};
    isLlmInitialized = true;
  }
}

/**
 * 计算 RTF (Real-Time Factor)
 * @param transcribeTime 转录耗时（秒）
 * @param audioDuration 音频时长（秒）
 */
export function calculateRtf(transcribeTime: number, audioDuration: number): number {
  if (audioDuration <= 0) return 0;
  return transcribeTime / audioDuration;
}

/**
 * 打印性能对比日志 - 预估 vs 实际
 * 格式化输出，方便定位差异
 */
function logPerformanceComparison(
  type: 'ASR' | 'LLM',
  modelId: string,
  device: 'CPU' | 'GPU' | '-',
  estimatedTime: number,
  actualTime: number,
  samples: number,
  avgMetric: number,
  metricName: string
): void {
  const error = actualTime - estimatedTime;
  const errorPercent = estimatedTime > 0 ? ((error / estimatedTime) * 100).toFixed(1) : 'N/A';
  const accuracy = estimatedTime > 0 ? Math.max(0, 100 - Math.abs(parseFloat(errorPercent))).toFixed(1) : 'N/A';

  // 使用 console.table 的视觉效果
  const border = '═'.repeat(60);
  const separator = '─'.repeat(60);

  console.log(`\n%c${border}`, 'color: #4CAF50; font-weight: bold;');
  console.log(`%c  📊 性能对比日志 [${type}]`, 'color: #4CAF50; font-weight: bold; font-size: 14px;');
  console.log(`%c${separator}`, 'color: #4CAF50;');

  // 基本信息
  console.log(`  模型: ${modelId}${device !== '-' ? ` (${device})` : ''}`);
  console.log(`  样本数: ${samples}`);
  console.log(`  平均${metricName}: ${avgMetric.toFixed(4)}`);

  console.log(`%c${separator}`, 'color: #4CAF50;');

  // 时间对比表格
  console.log(`  ┌─────────────────┬──────────────────┐`);
  console.log(`  │ 预估时间        │ ${estimatedTime.toFixed(3).padStart(12)} 秒   │`);
  console.log(`  │ 实际时间        │ ${actualTime.toFixed(3).padStart(12)} 秒   │`);
  console.log(`  ├─────────────────┼──────────────────┤`);

  // 误差行 - 根据正负值着色
  const errorSign = error >= 0 ? '+' : '';
  const errorColor = Math.abs(parseFloat(errorPercent)) <= 10 ? '#4CAF50' :
                     Math.abs(parseFloat(errorPercent)) <= 30 ? '#FF9800' : '#F44336';
  console.log(`  │ 误差            │ %c${errorSign}${error.toFixed(3).padStart(12)} 秒 (${errorSign}${errorPercent}%)`,
    `color: ${errorColor}; font-weight: bold;`);
  console.log(`  │ 准确率          │ ${accuracy.padStart(12)}%      │`);
  console.log(`  └─────────────────┴──────────────────┘`);

  // 判断结果
  const absErrorPercent = Math.abs(parseFloat(errorPercent));
  let result = '';
  let resultColor = '';
  if (absErrorPercent <= 10) {
    result = '✅ 预估非常准确';
    resultColor = '#4CAF50';
  } else if (absErrorPercent <= 30) {
    result = '⚠️ 预估基本合理';
    resultColor = '#FF9800';
  } else if (error > 0) {
    result = '🔴 实际耗时超出预估，需要优化';
    resultColor = '#F44336';
  } else {
    result = '🟡 预估偏大，可考虑调整';
    resultColor = '#FFC107';
  }
  console.log(`  %c${result}`, `color: ${resultColor}; font-weight: bold; font-size: 13px;`);
  console.log(`%c${border}\n`, 'color: #4CAF50; font-weight: bold;');
}

/**
 * 性能记录数据
 */
export interface PerformanceRecordData {
  asrModelId: string;
  asrDevice: 'CPU' | 'GPU';
  asrEstimatedTime: number;
  asrActualTime: number;
  asrSamples: number;
  asrAvgRtf: number;
  llmModelId?: string;
  llmEstimatedTime?: number;
  llmActualTime?: number;
  llmSamples?: number;
  llmAvgTimePerChar?: number;
}

/**
 * 打印综合性能对比日志 - 包含 ASR + LLM 分段和总计
 */
export function logOverallPerformance(data: PerformanceRecordData): void {
  const border = '═'.repeat(70);
  const separator = '─'.repeat(70);
  const doubleSeparator = '═'.repeat(70);

  console.log(`\n%c${border}`, 'color: #2196F3; font-weight: bold;');
  console.log(`%c  📈 综合性能对比日志`, 'color: #2196F3; font-weight: bold; font-size: 15px;');
  console.log(`%c${separator}`, 'color: #2196F3;');

  // ========== ASR 部分 ==========
  const asrError = data.asrActualTime - data.asrEstimatedTime;
  const asrErrorPercent = data.asrEstimatedTime > 0 ? (asrError / data.asrEstimatedTime * 100) : 0;
  const asrColor = Math.abs(asrErrorPercent) <= 10 ? '#4CAF50' :
                   Math.abs(asrErrorPercent) <= 30 ? '#FF9800' : '#F44336';

  console.log(`  %c【ASR 语音识别】`, 'color: #9C27B0; font-weight: bold; font-size: 13px;');
  console.log(`  模型: ${data.asrModelId} (${data.asrDevice}) | 样本: ${data.asrSamples} | 平均RTF: ${data.asrAvgRtf.toFixed(4)}`);
  console.log(`  预估: ${data.asrEstimatedTime.toFixed(3)}s | 实际: ${data.asrActualTime.toFixed(3)}s | ` +
    `%c误差: ${asrError >= 0 ? '+' : ''}${asrError.toFixed(3)}s (${asrErrorPercent >= 0 ? '+' : ''}${asrErrorPercent.toFixed(1)}%)`,
    `color: ${asrColor}; font-weight: bold;`);

  // ========== LLM 部分（如有）==========
  let totalEstimated = data.asrEstimatedTime;
  let totalActual = data.asrActualTime;

  if (data.llmModelId && data.llmActualTime !== undefined) {
    const llmError = data.llmActualTime - (data.llmEstimatedTime || 0);
    const llmErrorPercent = (data.llmEstimatedTime || 0) > 0 ? (llmError / (data.llmEstimatedTime || 1) * 100) : 0;
    const llmColor = Math.abs(llmErrorPercent) <= 10 ? '#4CAF50' :
                     Math.abs(llmErrorPercent) <= 30 ? '#FF9800' : '#F44336';

    totalEstimated = data.asrEstimatedTime + (data.llmEstimatedTime || 0);
    totalActual = data.asrActualTime + data.llmActualTime;

    console.log(`%c  ${separator}`, 'color: #2196F3;');
    console.log(`  %c【LLM 文本处理】`, 'color: #00BCD4; font-weight: bold; font-size: 13px;');
    console.log(`  模型: ${data.llmModelId} | 样本: ${data.llmSamples || 0} | 平均秒/字符: ${(data.llmAvgTimePerChar || 0).toFixed(4)}`);
    console.log(`  预估: ${(data.llmEstimatedTime || 0).toFixed(3)}s | 实际: ${data.llmActualTime.toFixed(3)}s | ` +
      `%c误差: ${llmError >= 0 ? '+' : ''}${llmError.toFixed(3)}s (${llmErrorPercent >= 0 ? '+' : ''}${llmErrorPercent.toFixed(1)}%)`,
      `color: ${llmColor}; font-weight: bold;`);
  }

  // ========== 总计 ==========
  const totalError = totalActual - totalEstimated;
  const totalErrorPercent = totalEstimated > 0 ? (totalError / totalEstimated * 100) : 0;
  const totalColor = Math.abs(totalErrorPercent) <= 10 ? '#4CAF50' :
                     Math.abs(totalErrorPercent) <= 30 ? '#FF9800' : '#F44336';
  const totalAccuracy = Math.max(0, 100 - Math.abs(totalErrorPercent));

  console.log(`%c  ${doubleSeparator}`, 'color: #2196F3; font-weight: bold;');
  console.log(`  %c【总计】`, 'color: #2196F3; font-weight: bold; font-size: 13px;');

  // 总计表格
  console.log(`  ┌───────────────┬───────────────┬───────────────┬─────────────┐`);
  console.log(`  │               │   预估时间    │   实际时间    │    误差     │`);
  console.log(`  ├───────────────┼───────────────┼───────────────┼─────────────┤`);
  console.log(`  │ ASR 部分      │ ${data.asrEstimatedTime.toFixed(3).padStart(10)}s   │ ${data.asrActualTime.toFixed(3).padStart(10)}s   │ ` +
    `%c${(asrError >= 0 ? '+' : '') + asrError.toFixed(3).padStart(8)}s`.padEnd(13) + '│',
    `color: ${asrColor}; font-weight: bold;`);

  if (data.llmModelId && data.llmActualTime !== undefined) {
    const llmErr = data.llmActualTime - (data.llmEstimatedTime || 0);
    const llmErrPct = (data.llmEstimatedTime || 0) > 0 ? (llmErr / (data.llmEstimatedTime || 1) * 100) : 0;
    const llmClr = Math.abs(llmErrPct) <= 10 ? '#4CAF50' : Math.abs(llmErrPct) <= 30 ? '#FF9800' : '#F44336';
    console.log(`  │ LLM 部分      │ ${(data.llmEstimatedTime || 0).toFixed(3).padStart(10)}s   │ ${data.llmActualTime.toFixed(3).padStart(10)}s   │ ` +
      `%c${(llmErr >= 0 ? '+' : '') + llmErr.toFixed(3).padStart(8)}s`.padEnd(13) + '│',
      `color: ${llmClr}; font-weight: bold;`);
  }

  console.log(`  ├───────────────┼───────────────┼───────────────┼─────────────┤`);
  console.log(`  │ 总计          │ ${totalEstimated.toFixed(3).padStart(10)}s   │ ${totalActual.toFixed(3).padStart(10)}s   │ ` +
    `%c${(totalError >= 0 ? '+' : '') + totalError.toFixed(3).padStart(8)}s`.padEnd(13) + '│',
    `color: ${totalColor}; font-weight: bold;`);
  console.log(`  └───────────────┴───────────────┴───────────────┴─────────────┘`);

  // 总结
  let summary = '';
  let summaryColor = '';
  if (totalAccuracy >= 90) {
    summary = '✅ 预估非常准确';
    summaryColor = '#4CAF50';
  } else if (totalAccuracy >= 70) {
    summary = '⚠️ 预估基本合理';
    summaryColor = '#FF9800';
  } else if (totalError > 0) {
    summary = '🔴 实际耗时超出预估，需要优化预估模型';
    summaryColor = '#F44336';
  } else {
    summary = '🟡 预估偏大，可考虑收紧';
    summaryColor = '#FFC107';
  }

  console.log(`  %c准确率: ${totalAccuracy.toFixed(1)}% | ${summary}`, `color: ${summaryColor}; font-weight: bold; font-size: 13px;`);
  console.log(`%c${border}\n`, 'color: #2196F3; font-weight: bold;');
}

/**
 * 记录一次转录性能
 * 同步更新后端和内存缓存
 */
export async function recordPerformance(
  modelId: string,
  device: 'CPU' | 'GPU',
  audioDuration: number,
  transcribeTime: number
): Promise<void> {
  const key = `${modelId}_${device}`;
  const rtf = calculateRtf(transcribeTime, audioDuration);

  // 获取记录前的预估时间（用于对比）
  const prevEntry = memoryCache[key];
  const prevAvgRtf = prevEntry && prevEntry.samples >= 3 ? prevEntry.avgRtf : (device === 'GPU' ? 0.4 : 2.5);
  const estimatedTime = audioDuration * prevAvgRtf;

  // 更新内存缓存
  const entry = memoryCache[key] || {
    samples: 0,
    avgRtf: 0,
    minRtf: Infinity,
    maxRtf: 0,
    lastUpdated: 0,
    totalAudioDuration: 0,
    totalTranscribeTime: 0,
  };

  entry.samples += 1;
  entry.totalAudioDuration = (entry.totalAudioDuration || 0) + audioDuration;
  entry.totalTranscribeTime = (entry.totalTranscribeTime || 0) + transcribeTime;
  entry.avgRtf = entry.totalAudioDuration > 0
    ? entry.totalTranscribeTime / entry.totalAudioDuration
    : rtf;
  entry.minRtf = Math.min(entry.minRtf, rtf);
  entry.maxRtf = Math.max(entry.maxRtf, rtf);
  entry.lastUpdated = Date.now();

  memoryCache[key] = entry;

  // 打印对比日志
  logPerformanceComparison(
    'ASR',
    modelId,
    device,
    estimatedTime,
    transcribeTime,
    entry.samples,
    entry.avgRtf,
    'RTF'
  );

  // 异步更新后端
  try {
    await invoke('record_performance', {
      request: {
        modelId: modelId,
        device,
        audioDuration: audioDuration,
        transcribeTime: transcribeTime,
      },
    });
  } catch (e) {
    console.error('[Performance] Failed to record to backend:', e);
    // 内存缓存已更新，后端失败不影响使用
  }
}

/**
 * 预估转录时间（同步，从内存缓存）
 */
export function estimateTranscribeTime(
  modelId: string,
  device: 'CPU' | 'GPU',
  audioDuration: number
): EstimateTimeResponse {
  const key = `${modelId}_${device}`;
  const entry = memoryCache[key];

  // 诊断日志
  console.log('[Performance] estimateTranscribeTime called:', {
    modelId,
    device,
    audioDuration,
    key,
    isInitialized,
    hasCacheEntry: !!entry,
    cacheKeys: Object.keys(memoryCache),
    entrySamples: entry?.samples,
  });

  if (entry && entry.samples >= 3) {
    const result = {
      estimatedTime: audioDuration * entry.avgRtf,
      hasSufficientData: true,
      samples: entry.samples,
      avgRtf: entry.avgRtf,
    };
    console.log('[Performance] Using cached data:', result);
    return result;
  }

  // 默认值
  const defaultRtf = device === 'GPU' ? 0.4 : 2.5;
  const result = {
    estimatedTime: audioDuration * defaultRtf,
    hasSufficientData: false,
    samples: entry?.samples || 0,
    avgRtf: entry?.avgRtf || defaultRtf,
  };
  console.log('[Performance] Using default RTF:', defaultRtf, 'result:', result);
  return result;
}

/**
 * 获取所有性能统计（从内存缓存）
 */
export function getAllStats(): PerformanceStats {
  return { ...memoryCache };
}

/**
 * 从后端重新加载缓存
 */
export async function reloadCacheFromBackend(): Promise<void> {
  try {
    const result = await invoke<{ stats: PerformanceStats }>('get_performance_stats');
    memoryCache = result.stats || {};
    console.log('[Performance] Cache reloaded from backend');
  } catch (e) {
    console.error('[Performance] Failed to reload cache:', e);
  }
}

/**
 * 清除内存缓存（不清除后端数据）
 */
export function clearMemoryCache(): void {
  memoryCache = {};
  console.log('[Performance] Memory cache cleared');
}

// 默认 RTF 值
export const DEFAULT_RTF = {
  GPU: 0.4,
  CPU: 2.5,
} as const;

// 默认每字符处理时间（秒）- 用于 recordLlmPerformance 的 fallback
export const DEFAULT_TIME_PER_CHAR = 0.01; // 约 100 字符/秒

/**
 * 记录 LLM 性能（打印日志对比）
 */
export function recordLlmPerformance(
  modelId: string,
  textLen: number,
  processingTimeMs: number
): void {
  const MEDIUM_THRESHOLD = 300;
  const BASE_TIME_MS = 700;

  // >300字：显示动态速度参数
  if (textLen > MEDIUM_THRESHOLD && processingTimeMs > BASE_TIME_MS) {
    const cachedStats = llmMemoryCache[modelId];
    const charsPerSec = cachedStats?.longCharsPerSec || 160;
    const samples = cachedStats?.longSamples || 0;

    // 计算实测速度
    const extraChars = textLen - MEDIUM_THRESHOLD;
    const extraTimeSec = (processingTimeMs - BASE_TIME_MS) / 1000;
    const measuredSpeed = extraChars / extraTimeSec;

    console.log(`%c[LLM Performance] ${modelId} >300 chars`, 'color: #00BCD4; font-weight: bold;');
    console.log(`  字数: ${textLen}, 实际耗时: ${processingTimeMs.toFixed(0)}ms`);
    console.log(`  实测速度: ${measuredSpeed.toFixed(1)} 字/秒`);
    console.log(`  EWMA速度: ${charsPerSec.toFixed(1)} 字/秒 (样本数: ${samples})`);
  } else {
    // <=300字：简单日志
    console.log(`[LLM Performance] ${modelId} <=300 chars: len=${textLen}, time=${processingTimeMs.toFixed(0)}ms`);
  }
}

/**
 * 预估 LLM 处理时间（300字以内固定值，300字以上线性预估+动态速度）
 */
export function estimateLlmTime(
  modelId: string,
  textLen: number
): EstimateLlmTimeResponse {
  console.log('[Performance] estimateLlmTime called:', {
    modelId,
    textLen,
    hasCache: !!llmMemoryCache[modelId],
  });

  const SHORT_THRESHOLD = 100;
  const MEDIUM_THRESHOLD = 300;
  const SHORT_TIME_MS = 500;
  const MEDIUM_TIME_MS = 700;
  const BASE_TIME_MS = 700;
  const DEFAULT_CHARS_PER_SEC = 160;

  // <100字：固定值
  if (textLen < SHORT_THRESHOLD) {
    return {
      estimatedTime: SHORT_TIME_MS / 1000,
      hasSufficientData: false,
      interval: 'short',
      samples: 0,
      avgTimeMs: SHORT_TIME_MS,
    };
  }

  // 100-300字：固定值
  if (textLen <= MEDIUM_THRESHOLD) {
    return {
      estimatedTime: MEDIUM_TIME_MS / 1000,
      hasSufficientData: false,
      interval: 'medium',
      samples: 0,
      avgTimeMs: MEDIUM_TIME_MS,
    };
  }

  // >300字：线性预估
  const extraChars = textLen - MEDIUM_THRESHOLD;

  // 使用动态速度参数（如果存在且有样本）或默认值
  const cachedStats = llmMemoryCache[modelId];
  const charsPerSec = cachedStats?.longCharsPerSec && cachedStats.longSamples > 0
    ? cachedStats.longCharsPerSec
    : DEFAULT_CHARS_PER_SEC;

  const hasSufficientData = cachedStats?.longSamples >= 3;

  // 线性公式：基数时间 + 超出字数 / 速度 * 1000
  const extraTimeMs = (extraChars / charsPerSec) * 1000;
  const estimatedMs = BASE_TIME_MS + extraTimeMs;

  console.log('[Performance] LLM linear estimate:', {
    modelId,
    textLen,
    extraChars,
    charsPerSec,
    estimatedMs,
    samples: cachedStats?.longSamples || 0,
  });

  return {
    estimatedTime: estimatedMs / 1000,
    hasSufficientData: hasSufficientData,
    interval: 'long',
    samples: cachedStats?.longSamples || 0,
    avgTimeMs: estimatedMs,
    charsPerSec: charsPerSec,
  };
}

/**
 * 获取所有 LLM 性能统计（从内存缓存）
 */
export function getAllLlmStats(): LlmPerformanceStats {
  return { ...llmMemoryCache };
}

/**
 * 从后端重新加载 LLM 缓存
 */
export async function reloadLlmCacheFromBackend(): Promise<void> {
  try {
    const result = await invoke<{ stats: LlmPerformanceStats }>('get_llm_performance_stats');
    llmMemoryCache = result.stats || {};
    console.log('[Performance] LLM Cache reloaded from backend');
  } catch (e) {
    console.error('[Performance] Failed to reload LLM cache:', e);
  }
}

// 兼容旧 API 的别名
export const estimateTranscribeTimeLocal = estimateTranscribeTime;