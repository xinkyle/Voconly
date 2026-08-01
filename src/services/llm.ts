/**
 * LLM Service
 * Wraps LLM-related Tauri commands for text post-processing and Profile management
 */

import { invoke } from '../utils/tauri';
import { createLogger } from './log';
import type { LlmProfile, LlmProviderInstance, ProviderWithConfig, UserPromptPresets } from '../types';

// 创建日志记录器
const log = createLogger('LLM');

// ============== Types ==============

/** LLM 进度阶段 */
export type LlmStage = 'loading' | 'tokenizing' | 'decoding' | 'generating' | 'complete';

/** LLM 进度事件 */
export interface LlmProgressEvent {
  /** 当前阶段 */
  stage: LlmStage;
  /** 当前进度值（如已生成 tokens 数） */
  current: number;
  /** 总量（如 max_tokens） */
  total: number;
  /** 百分比 (0-100) */
  percentage: number;
  /** 实时速度（tokens/秒，仅生成阶段有效） */
  tokens_per_sec?: number;
  /** 预估剩余时间（秒，仅生成阶段有效） */
  estimated_remaining_secs?: number;
}

/** LLM 处理请求参数 */
export interface LlmProcessRequest {
  /** 要处理的文本 */
  text: string;
  /** 可选的模型覆盖 */
  model?: string;
  /** 可选的温度参数覆盖 */
  temperature?: number;
}

/** LLM 健康检查响应 */
export interface LlmHealthResponse {
  /** 是否可用 */
  available: boolean;
  /** Provider 名称 */
  provider: string;
  /** 可用模型列表 */
  models: string[];
  /** 错误信息（如果有） */
  error: string | null;
}

/** LLM 处理响应 */
export interface LlmResponse {
  /** 是否成功 */
  success: boolean;
  /** 处理后的文本 */
  text: string;
  /** 错误信息（如果有） */
  error: string | null;
  /** 使用的 token 数量 */
  tokensUsed: number | null;
}

// ============== API Functions ==============

/**
 * 检查 LLM 服务状态
 * @returns LLM 健康检查结果，包含可用状态、Provider 名称和模型列表
 */
export async function healthCheck(): Promise<LlmHealthResponse> {
  log.debug('healthCheck: invoking llm_health_check command...');
  try {
    const result = await invoke<LlmHealthResponse>('llm_health_check');
    log.debug(`healthCheck: result=${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    log.error(`healthCheck: error=${err}`);
    throw err;
  }
}

/**
 * 获取可用模型列表
 * @returns LLM 可用模型名称数组
 */
export async function listModels(): Promise<string[]> {
  return invoke<string[]>('llm_list_models');
}

/**
 * 处理文本（LLM 后处理）
 * @param text 要处理的文本
 * @param model 可选的模型覆盖
 * @param temperature 可选的温度参数覆盖
 * @returns LLM 处理结果
 */
export async function processText(
  text: string,
  model?: string,
  temperature?: number
): Promise<LlmResponse> {
  const request: LlmProcessRequest = {
    text,
    model,
    temperature,
  };

  return invoke<LlmResponse>('llm_process_text', { request });
}

/**
 * 处理文本（简化版本）
 * @param text 要处理的文本
 * @returns 处理后的文本，失败时返回原文本
 */
export async function processTextSimple(text: string): Promise<string> {
  try {
    const response = await processText(text);
    if (response.success) {
      return response.text;
    }
    log.warn(`Process text failed: ${response.error}`);
    return text;
  } catch (error) {
    log.error(`Process text error: ${error}`);
    return text;
  }
}

/**
 * 按场景处理文本（使用场景级 Profile 配置）
 * @param sceneId 场景 ID
 * @param text 要处理的文本
 * @returns LLM 处理结果
 */
export async function processTextForScene(
  sceneId: string,
  text: string
): Promise<LlmResponse> {
  return invoke<LlmResponse>('llm_process_text_for_scene', { sceneId, text });
}

/**
 * 按场景处理文本（带进度事件）
 * 通过监听 llm-progress 事件获取实时进度
 * @param sceneId 场景 ID
 * @param text 要处理的文本
 * @returns LLM 处理结果
 */
export async function processTextForSceneWithProgress(
  sceneId: string,
  text: string
): Promise<LlmResponse> {
  log.debug(`processTextForSceneWithProgress: sceneId=${sceneId}, text length=${text.length}`);
  return invoke<LlmResponse>('llm_process_text_for_scene_with_progress', { sceneId, text });
}

/**
 * 订阅 LLM 进度事件
 * @param callback 进度回调函数
 * @returns 取消订阅函数
 */
export async function subscribeToLlmProgress(
  callback: (event: LlmProgressEvent) => void
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<LlmProgressEvent>('llm-progress', (event) => {
    log.debug(`LLM progress: stage=${event.payload.stage}, percentage=${event.payload.percentage}%`);
    callback(event.payload);
  });
  return unlisten;
}

/**
 * 按场景处理文本（简化版本）
 * @param sceneId 场景 ID
 * @param text 要处理的文本
 * @returns 处理后的文本，失败或未启用时返回原文本
 */
export async function processTextForSceneSimple(
  sceneId: string,
  text: string
): Promise<{ processed: boolean; text: string }> {
  try {
    const response = await processTextForScene(sceneId, text);
    if (response.success) {
      return { processed: true, text: response.text };
    }
    log.debug(`Process text for scene not successful: ${response.error}`);
    return { processed: false, text };
  } catch (error) {
    log.error(`Process text for scene error: ${error}`);
    return { processed: false, text };
  }
}

// ============== Profile API Functions ==============

/**
 * 获取指定场景的 LLM Profile
 * @param sceneId 场景 ID
 * @returns LLM Profile 配置，如果不存在则返回 null
 */
export async function getLlmProfile(sceneId: string): Promise<LlmProfile | null> {
  return invoke<LlmProfile | null>('get_llm_profile', { sceneId });
}

/**
 * 保存 LLM Profile（创建或更新）
 * @param profile LLM Profile 配置
 * @returns 保存成功返回 true
 */
export async function saveLlmProfile(profile: LlmProfile): Promise<boolean> {
  return invoke<boolean>('save_llm_profile', { profile });
}

/**
 * 获取提示词预设
 * @returns 提示词预设配置，如果不存在则返回 null
 */
export async function getLlmPromptPresets(): Promise<UserPromptPresets | null> {
  return invoke<UserPromptPresets | null>('get_llm_prompt_presets');
}

/**
 * 保存提示词预设
 * @param presets 提示词预设配置
 * @returns 保存成功返回预设
 */
export async function saveLlmPromptPresets(presets: UserPromptPresets): Promise<UserPromptPresets> {
  return invoke<UserPromptPresets>('save_llm_prompt_presets', { presets });
}

// ============== Provider 管理 API ==============

/**
 * 获取 Provider 列表（包含配置状态）
 * @returns Provider 列表
 */
export async function getProviderList(): Promise<ProviderWithConfig[]> {
  return invoke<ProviderWithConfig[]>('get_provider_list');
}

/**
 * 保存 Provider 配置
 * @param providerId Provider ID
 * @param instance Provider 实例配置
 * @returns 保存成功返回 instance
 */
export async function saveProviderConfig(
  providerId: string,
  instance: LlmProviderInstance
): Promise<LlmProviderInstance> {
  return invoke<LlmProviderInstance>('save_provider_config', { providerId, instance });
}

/**
 * 删除 Provider 配置
 * @param providerId Provider ID
 * @returns 保存成功返回 true
 */
export async function deleteProviderConfig(providerId: string): Promise<void> {
  return invoke<void>('delete_provider_config', { providerId });
}

/**
 * 从 Provider 获取模型列表
 * @param providerId Provider ID
 * @param baseUrl API 地址
 * @param apiKey API Key（可选）
 * @returns 模型列表
 */
export async function fetchProviderModels(
  providerId: string,
  baseUrl: string,
  apiKey?: string
): Promise<string[]> {
  return invoke<string[]>('fetch_provider_models', { providerId, baseUrl, apiKey });
}

/**
 * 检查 Provider 连接状态
 * @param providerId Provider ID
 * @param baseUrl API 地址
 * @param apiKey API Key（可选）
 * @returns 健康检查响应
 */
export async function checkProviderConnection(
  providerId: string,
  baseUrl: string,
  apiKey?: string
): Promise<LlmHealthResponse> {
  return invoke<LlmHealthResponse>('check_provider_connection', { providerId, baseUrl, apiKey });
}

/**
 * 获取 LLM 模型存储路径
 * @param presetId 模型预设 ID
 * @returns 模型存储路径
 */
export async function getLlmModelStoragePath(presetId: string): Promise<string> {
  return invoke<string>('get_llm_model_storage_path_cmd', { presetId });
}

// ============== LLM Model Management API ==============

/** LLM 模型状态信息 */
export interface LlmModelWithStatus {
  preset: {
    id: string;
    name: string;
    size: string;
    description: string;
    nGpuLayers: number;
    nCtx: number;
    recommended: boolean;
  };
  downloaded: boolean;
  path: string | null;
  sizeMb: number | null;
}

/** LLM 模型下载请求参数 */
export interface DownloadLlmModelRequest {
  presetId: string;
  preferredSource?: string;
  preferChina?: boolean;
}

/** 下载结果 */
export interface DownloadResult {
  success: boolean;
  path: string | null;
  error: string | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
}

/**
 * 获取 LLM 模型预设列表（包含下载状态）
 * @returns 模型预设列表
 */
export async function getLlmModelList(): Promise<LlmModelWithStatus[]> {
  return invoke<LlmModelWithStatus[]>('get_llm_model_list');
}

/**
 * 下载 LLM 模型
 * @param request 下载请求参数
 * @returns 下载结果
 */
export async function downloadLlmModel(request: DownloadLlmModelRequest): Promise<DownloadResult> {
  return invoke<DownloadResult>('download_llm_model', { request });
}

/**
 * 删除已下载的 LLM 模型
 * @param presetId 模型预设 ID
 */
export async function deleteLlmModel(presetId: string): Promise<void> {
  return invoke<void>('delete_llm_model', { presetId });
}

/**
 * 检查 LLM 模型是否已下载
 * @param presetId 模型预设 ID
 * @returns 是否已下载
 */
export async function checkLlmModelExists(presetId: string): Promise<boolean> {
  return invoke<boolean>('check_llm_model_exists', { presetId });
}

/**
 * 检测 GPU 可用性
 * @returns GPU 信息
 */
export async function detectGpu(): Promise<{
  available: boolean;
  gpuType: string;
  maxDevices: number;
  recommendedLayers: number;
}> {
  return invoke<{
    available: boolean;
    gpuType: string;
    maxDevices: number;
    recommendedLayers: number;
  }>('detect_gpu');
}

// ============== Provider 模型缓存 API ==============

/**
 * 获取缓存的模型列表
 * @param providerId Provider ID
 * @returns 缓存的模型列表，如果没有缓存则返回空数组
 */
export async function getCachedProviderModels(providerId: string): Promise<string[]> {
  return invoke<string[]>('get_cached_provider_models', { providerId });
}

/**
 * 刷新模型列表并缓存
 * @param providerId Provider ID
 * @returns 从 API 获取的模型列表
 */
export async function refreshProviderModels(providerId: string): Promise<string[]> {
  return invoke<string[]>('refresh_provider_models', { providerId });
}

// ============== Default Export ==============

export default {
  healthCheck,
  listModels,
  processText,
  processTextSimple,
  processTextForScene,
  processTextForSceneSimple,
  processTextForSceneWithProgress,
  subscribeToLlmProgress,
  getLlmProfile,
  saveLlmProfile,
  getLlmPromptPresets,
  saveLlmPromptPresets,
  // Provider management
  getProviderList,
  saveProviderConfig,
  deleteProviderConfig,
  fetchProviderModels,
  checkProviderConnection,
  // Provider model cache
  getCachedProviderModels,
  refreshProviderModels,
  // LLM model management
  getLlmModelList,
  downloadLlmModel,
  deleteLlmModel,
  checkLlmModelExists,
  getLlmModelStoragePath,
  // GPU detection
  detectGpu,
};