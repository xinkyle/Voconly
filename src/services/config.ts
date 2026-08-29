import { invoke } from '../utils/tauri';
import type { AppConfig, Model, Scene, BackendType, LlmConfig, LlmProviderConfig, LlmProfile, LlmProviderInstance, GlobalModelConfig } from '../types';

// ============== Rust 数据结构 (与 Rust 后端完全匹配，camelCase) ==============

export interface RustDownloadSource {
  name: string;
  url: string;
  isChinaAccessible: boolean;
  priority: number;
}

interface RustModel {
  id: string;
  name: string;
  backend: string;  // "Whisper" | "Onnx"
  size: string;
  downloaded: boolean;
  path?: string;
  downloadUrls: RustDownloadSource[];
  languages: string[];
  description?: string;
  supportsAutoDetect?: boolean;
  supportsStreaming?: boolean;  // 是否支持流式转录
  accuracyScore?: number;  // 准确度评分 0-1
  speedScore?: number;  // 速度评分 0-1
  defaultLanguage?: string;
}

// Rust LoadStrategy: 所有模型均为常驻内存模式
type RustLoadStrategy = { type: 'Always' };

// Rust ModelRef 类型（与后端完全匹配）
interface RustModelRef {
  modelId: string;
  quantization?: string;
}

interface RustScene {
  id: string;
  name: string;
  shortcut: string;
  /** 模型引用（新格式） */
  model: RustModelRef;
  /** DEPRECATED: 旧的模型ID字段，仅用于向后兼容 */
  modelId?: string;
  loadStrategy: RustLoadStrategy;
  autoType: boolean;
  enabled: boolean;
  /** 提示词类型：内置名（如 "lightPolish", "translate"）或自定义预设名 */
  promptType?: string;
  /** 场景专属自定义提示词 */
  customPrompt?: string;
}

// Rust UserDictionary 类型
interface RustDictionaryEntry {
  word: string;
  aliases?: string[];
}

interface RustUserDictionary {
  enabled: boolean;
  entries: RustDictionaryEntry[];
  threshold: number;
  rawText?: string;
}

interface RustUserPromptPresets {
  lightPolish: string;
  translate: string;
  professionalPolish: string;
  meetingSecretary: string;
  customPresets?: Record<string, string>;
}

interface RustAppConfig {
  /// 全局模型配置
  globalModelConfig: GlobalModelConfig;
  /// DEPRECATED: 模型列表已迁移到预设系统
  models?: RustModel[];
  /// 用户对每个 ASR 模型的默认语言偏好
  modelLanguagePrefs?: Record<string, string>;
  /// 用户对每个 ASR 模型的精度版本偏好
  modelQuantPrefs?: Record<string, string>;
  scenes: RustScene[];
  llm: RustLlmConfig;
  llmProfiles?: RustLlmProfile[];
  llmPromptPresets?: RustUserPromptPresets;
  llmProviders?: Record<string, RustLlmProviderInstance>;
  userDictionary?: RustUserDictionary;
  autoStart?: boolean;
  defaultMicrophone?: string;
  checkUpdates?: boolean;
  showShortcutHint?: boolean;
  maxHistoryRecords?: number;
  maxRecordingDuration?: number;
  segmentTranscribe?: boolean;
  previewHeight?: 'high' | 'medium' | 'low';
  tutorialCompleted?: boolean;
  versionInfoUrl?: string;
}

// ============== Rust LLM 类型 ==============

type RustLlmProviderType = 'ollama' | 'openai' | 'deepseek' | 'gemini' | 'custom';

interface RustLlmProviderConfig {
  providerType: RustLlmProviderType;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutSecs: number;
}

interface RustLlmConfig {
  enabled: boolean;
  provider: RustLlmProviderConfig;
  userPromptTemplate: string;
  maxTokens: number;
  temperature: number;
}

interface RustLlmProfile {
  id: string;
  sceneId: string;
  enabled: boolean;
  providerId?: string;
  model: string;
  userPromptType: string;
  userPromptCustom: string;
  maxTokens: number;
  temperature: number;
}

interface RustLlmProviderInstance {
  metaId: string;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  nGpuLayers?: number;
  contextLimit?: number;
  maxTokens?: number;
}

// ============== 转换函数 ==============
// 由于 Rust 端已使用 camelCase，转换函数更简单

function convertModelFromRust(rust: RustModel): Model {
  return {
    id: rust.id,
    name: rust.name,
    backend: rust.backend as BackendType,
    size: rust.size || '0MB',
    downloaded: rust.downloaded ?? false,
    path: rust.path,
    downloadUrls: rust.downloadUrls?.map(url => ({
      name: url.name,
      url: url.url,
      isChinaAccessible: url.isChinaAccessible,
      priority: url.priority,
    })) || [],
    languages: rust.languages || [],
    description: rust.description,
    supportsAutoDetect: rust.supportsAutoDetect,
    supportsStreaming: rust.supportsStreaming,
    accuracyScore: rust.accuracyScore,
    speedScore: rust.speedScore,
    defaultLanguage: rust.defaultLanguage,
  };
}

function convertSceneFromRust(rust: RustScene): Scene {
  return {
    id: rust.id,
    name: rust.name,
    shortcut: rust.shortcut,
    model: {
      modelId: rust.model?.modelId ?? '',
      quantization: rust.model?.quantization,
    },
    modelId: rust.modelId, // 保留旧字段用于向后兼容
    autoType: rust.autoType ?? true,
    enabled: rust.enabled,
    promptType: rust.promptType,
    customPrompt: rust.customPrompt,
  };
}

function convertModelToRust(model: Model): RustModel {
  return {
    id: model.id,
    name: model.name,
    backend: model.backend,
    size: model.size,
    downloaded: model.downloaded,
    path: model.path,
    downloadUrls: model.downloadUrls.map(url => ({
      name: url.name,
      url: url.url,
      isChinaAccessible: url.isChinaAccessible,
      priority: url.priority,
    })),
    languages: model.languages,
    description: model.description,
    supportsAutoDetect: model.supportsAutoDetect,
    supportsStreaming: model.supportsStreaming,
    accuracyScore: model.accuracyScore,
    speedScore: model.speedScore,
    defaultLanguage: model.defaultLanguage,
  };
}

function convertSceneToRust(scene: Scene): RustScene {
  return {
    id: scene.id,
    name: scene.name,
    shortcut: scene.shortcut,
    model: {
      modelId: scene.model?.modelId ?? '',
      quantization: scene.model?.quantization,
    },
    modelId: scene.modelId, // 保留旧字段用于向后兼容
    loadStrategy: { type: 'Always' },
    autoType: scene.autoType ?? true,
    enabled: scene.enabled,
    promptType: scene.promptType,
    customPrompt: scene.customPrompt,
  };
}

function convertConfigFromRust(rust: RustAppConfig): AppConfig {
  return {
    // 全局模型配置
    globalModelConfig: rust.globalModelConfig,
    // DEPRECATED: models 字段仅用于向后兼容，不再主动使用
    models: rust.models?.map(convertModelFromRust),
    // 新增：用户对每个模型的语言偏好
    modelLanguagePrefs: rust.modelLanguagePrefs,
    // 新增：用户对每个模型的精度版本偏好
    modelQuantPrefs: rust.modelQuantPrefs,
    scenes: rust.scenes.map(convertSceneFromRust),
    llm: rust.llm ? convertLlmConfigFromRust(rust.llm) : undefined,
    llmProfiles: rust.llmProfiles?.map(convertLlmProfileFromRust),
    llmPromptPresets: rust.llmPromptPresets,
    llmProviders: rust.llmProviders ? Object.fromEntries(
      Object.entries(rust.llmProviders).map(([key, value]) => [key, convertLlmProviderInstanceFromRust(value)])
    ) : undefined,
    userDictionary: rust.userDictionary,
    autoStart: rust.autoStart,
    defaultMicrophone: rust.defaultMicrophone,
    checkUpdates: rust.checkUpdates,
    showShortcutHint: rust.showShortcutHint,
    maxHistoryRecords: rust.maxHistoryRecords,
    maxRecordingDuration: rust.maxRecordingDuration,
    segmentTranscribe: rust.segmentTranscribe,
    previewHeight: rust.previewHeight,
    tutorialCompleted: rust.tutorialCompleted,
    versionInfoUrl: rust.versionInfoUrl,
  };
}

function convertConfigToRust(config: AppConfig): RustAppConfig {
  return {
    // 全局模型配置
    globalModelConfig: config.globalModelConfig,
    // DEPRECATED: models 字段仅用于向后兼容，发送空数组
    models: config.models?.map(convertModelToRust) || [],
    // 新增：用户对每个模型的语言偏好
    modelLanguagePrefs: config.modelLanguagePrefs || {},
    // 新增：用户对每个模型的精度版本偏好
    modelQuantPrefs: config.modelQuantPrefs || {},
    scenes: config.scenes.map(convertSceneToRust),
    llm: config.llm ? convertLlmConfigToRust(config.llm) : {
      enabled: false,
      provider: {
        providerType: 'ollama',
        enabled: true,
        baseUrl: 'http://localhost:11434',
        model: 'qwen2.5:3b',
        timeoutSecs: 30,
      },
      userPromptTemplate: '{text}',
      maxTokens: 1024,
      temperature: 0.3,
    },
    llmProfiles: config.llmProfiles?.map(convertLlmProfileToRust),
    llmPromptPresets: config.llmPromptPresets,
    llmProviders: config.llmProviders ? Object.fromEntries(
      Object.entries(config.llmProviders).map(([key, value]) => [key, convertLlmProviderInstanceToRust(value)])
    ) : undefined,
    userDictionary: config.userDictionary,
    autoStart: config.autoStart,
    defaultMicrophone: config.defaultMicrophone,
    checkUpdates: config.checkUpdates,
    showShortcutHint: config.showShortcutHint,
    maxHistoryRecords: config.maxHistoryRecords,
    maxRecordingDuration: config.maxRecordingDuration,
    segmentTranscribe: config.segmentTranscribe ?? true,
    previewHeight: config.previewHeight,
    tutorialCompleted: config.tutorialCompleted,
    versionInfoUrl: config.versionInfoUrl,
  };
}

// ============== LLM 转换函数 ==============

function convertLlmProviderConfigFromRust(rust: RustLlmProviderConfig): LlmProviderConfig {
  return {
    providerType: rust.providerType,
    enabled: rust.enabled,
    baseUrl: rust.baseUrl,
    apiKey: rust.apiKey,
    model: rust.model,
    timeoutSecs: rust.timeoutSecs,
  };
}

function convertLlmProviderConfigToRust(config: LlmProviderConfig): RustLlmProviderConfig {
  return {
    providerType: config.providerType,
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    timeoutSecs: config.timeoutSecs,
  };
}

function convertLlmConfigFromRust(rust: RustLlmConfig): LlmConfig {
  return {
    enabled: rust.enabled,
    provider: convertLlmProviderConfigFromRust(rust.provider),
    userPromptTemplate: rust.userPromptTemplate,
    maxTokens: rust.maxTokens,
    temperature: rust.temperature,
  };
}

function convertLlmConfigToRust(config: LlmConfig): RustLlmConfig {
  return {
    enabled: config.enabled,
    provider: convertLlmProviderConfigToRust(config.provider),
    userPromptTemplate: config.userPromptTemplate,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };
}

function convertLlmProfileFromRust(rust: RustLlmProfile): LlmProfile {
  return {
    id: rust.id,
    sceneId: rust.sceneId,
    enabled: rust.enabled,
    providerId: rust.providerId,
    model: rust.model,
    userPromptType: rust.userPromptType,
    userPromptCustom: rust.userPromptCustom,
    maxTokens: rust.maxTokens,
    temperature: rust.temperature,
  };
}

function convertLlmProfileToRust(profile: LlmProfile): RustLlmProfile {
  return {
    id: profile.id,
    sceneId: profile.sceneId,
    enabled: profile.enabled,
    providerId: profile.providerId,
    model: profile.model,
    userPromptType: profile.userPromptType,
    userPromptCustom: profile.userPromptCustom,
    maxTokens: profile.maxTokens,
    temperature: profile.temperature,
  };
}

function convertLlmProviderInstanceFromRust(rust: RustLlmProviderInstance): LlmProviderInstance {
  return {
    metaId: rust.metaId,
    enabled: rust.enabled,
    baseUrl: rust.baseUrl,
    apiKey: rust.apiKey,
    defaultModel: rust.defaultModel,
    nGpuLayers: rust.nGpuLayers,
    contextLimit: rust.contextLimit,
    maxTokens: rust.maxTokens,
  };
}

function convertLlmProviderInstanceToRust(instance: LlmProviderInstance): RustLlmProviderInstance {
  return {
    metaId: instance.metaId,
    enabled: instance.enabled,
    baseUrl: instance.baseUrl,
    apiKey: instance.apiKey,
    defaultModel: instance.defaultModel,
    nGpuLayers: instance.nGpuLayers,
    contextLimit: instance.contextLimit,
    maxTokens: instance.maxTokens,
  };
}

// ============== API 函数 ==============

export async function loadConfig(): Promise<AppConfig> {
  const rustConfig = await invoke<RustAppConfig>('load_config');
  return convertConfigFromRust(rustConfig);
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const rustConfig = convertConfigToRust(config);
  await invoke('save_config', { config: rustConfig });
}

export async function getModelStoragePath(): Promise<string> {
  return invoke<string>('get_model_storage_path');
}

export async function configExists(): Promise<boolean> {
  return invoke<boolean>('config_exists');
}

// ============== ModelPreset 类型 (与 Rust ModelPreset 完全匹配) ==============

export interface PythonModelConfig {
  modelId: string;
  device?: string;
  dtype?: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  size: string;
  description?: string;
  downloadUrls: RustDownloadSource[];
  modelType: 'asr' | 'llm';
  // ASR-specific fields
  backend?: BackendType;
  languages: string[];
  supportsAutoDetect?: boolean;
  supportsStreaming?: boolean;  // 是否支持流式转录
  accuracyScore?: number;  // 准确度评分 0-1
  speedScore?: number;  // 速度评分 0-1
  pythonConfig?: PythonModelConfig;
  // LLM-specific fields (not used for ASR)
  nGpuLayers?: number;
  nCtx?: number;
  recommended?: boolean;
  // Model file/directory path (set by scanner for discovered models)
  // 扫描发现的模型实际路径（包括自定义目录中的模型）
  path?: string;
  // Quantization info for GGUF models
  filename?: string;  // Actual filename (e.g., "Qwen3-ASR-1.7B-Q5_K_M.gguf")
  quant?: string;     // Quantization version (e.g., "Q5_K_M", "F16")
  // Downloaded quantization versions
  downloadedQuants?: string[];  // All downloaded quant versions for this model
  activeQuant?: string;        // Currently active quant version
}

/**
 * Scan available ASR models from storage directory
 * Returns both preset models (with download URLs) and user models (without download URLs)
 */
export async function scanAsrModels(): Promise<ModelPreset[]> {
  return invoke<ModelPreset[]>('scan_asr_models');
}

/**
 * Scan available LLM models from storage directory
 * Returns both preset models (with download URLs) and user models (without download URLs)
 */
export async function scanLlmModels(): Promise<LlmModelPreset[]> {
  return invoke<LlmModelPreset[]>('scan_llm_models');
}

/**
 * LLM Model Preset (matches Rust LlmModelPreset)
 */
export interface LlmModelPreset {
  id: string;
  name: string;
  size: string;
  description: string;
  downloadUrls: RustDownloadSource[];
  nGpuLayers: number;
  nCtx: number;
  recommended: boolean;
}

/**
 * ASR Model with Status (matches Rust AsrModelWithStatus)
 */
export interface AsrModelWithStatus {
  preset: ModelPreset;
  downloaded: boolean;
  path?: string;
  sizeMb?: number;
  /** Available quantization variants (from catalog) */
  quantVariants: QuantVariant[];
  /** Downloaded quantization versions (from filesystem scan) */
  downloadedQuants?: string[];
  /** Currently active quantization version */
  activeQuant?: string;
}

/**
 * Quantization variant information
 */
export interface QuantVariant {
  quant: string;
  filename: string;
  sizeBytes: number;
  isRecommended: boolean;
}

/**
 * Quantization precision labels
 * Maps quantization types to precision categories
 * Used to display precision label instead of quant name (Q5_K_M → "低精度")
 */
export const QUANT_LABELS: Record<string, 'low' | 'medium' | 'high'> = {
  'Q5_K_M': 'low',
  'Q8_0': 'medium',
  'F16': 'high',
};

/**
 * Get precision label for a quantization type
 * @param quant Quantization type (e.g., "Q5_K_M", "Q8_0", "F16")
 * @returns Precision label key ('low', 'medium', 'high') or undefined
 */
export function getQuantLabel(quant: string): 'low' | 'medium' | 'high' | undefined {
  return QUANT_LABELS[quant];
}

/**
 * LLM Model with Status (matches Rust LlmModelWithStatus)
 */
export interface LlmModelWithStatus {
  preset: LlmModelPreset;
  downloaded: boolean;
  path?: string;
  sizeMb?: number;
}

/**
 * Get ASR model list with download status
 * Returns combined list of downloaded models and preset models not yet downloaded
 */
export async function getAsrModelList(): Promise<AsrModelWithStatus[]> {
  return invoke<AsrModelWithStatus[]>('get_asr_model_list');
}

/**
 * Get LLM model list with download status
 * Returns combined list of downloaded models and preset models not yet downloaded
 */
export async function getLlmModelList(): Promise<LlmModelWithStatus[]> {
  return invoke<LlmModelWithStatus[]>('get_llm_model_list');
}

/**
 * Valid quantization suffixes (synced with backend: src-tauri/src/utils/quant.rs)
 * DO NOT modify this list without updating the backend is_valid_quant() function.
 */
const VALID_QUANTS = [
  'Q8_0', 'Q6_K', 'Q5_K_M', 'Q5_K_S', 'Q5_0',
  'Q4_K_M', 'Q4_K_S', 'Q4_0',
  'Q3_K_M', 'Q3_K_L', 'Q3_K_S', 'Q2_K',
  'F32', 'F16', 'BF16'
];

/**
 * Parse model ID with optional quantization suffix
 * Examples:
 * - "qwen3-asr-1.7b" → { baseId: "qwen3-asr-1.7b" }
 * - "qwen3-asr-1.7b-Q8_0" → { baseId: "qwen3-asr-1.7b", quant: "Q8_0" }
 * - "nemotron-3.5-asr-streaming-0.6b-Q5_K_M" → { baseId: "nemotron-3.5-asr-streaming-0.6b", quant: "Q5_K_M" }
 */
export function parseModelId(fullModelId: string): { baseId: string; quant?: string } {
  if (!fullModelId) {
    return { baseId: '' };
  }

  // Check for known quantization suffix (case-insensitive)
  for (const quant of VALID_QUANTS) {
    const suffix = '-' + quant;
    if (fullModelId.toLowerCase().endsWith(suffix.toLowerCase())) {
      return {
        baseId: fullModelId.slice(0, -suffix.length),
        quant: quant
      };
    }
  }

  return { baseId: fullModelId };
}

/**
 * Check if a model with the given full ID is downloaded
 * Uses asrModels data (must be loaded first) for fast synchronous check
 * For async backend check, use checkModelExists from downloader.ts
 * @param fullModelId The full model ID (may include quantization suffix)
 * @param asrModels List of ASR models with download status
 * @returns true if the model (and specific quantization if specified) is downloaded
 */
export function isModelDownloaded(
  fullModelId: string,
  asrModels: AsrModelWithStatus[]
): boolean {
  if (!fullModelId || asrModels.length === 0) {
    return false;
  }

  const { baseId, quant } = parseModelId(fullModelId);

  // Find the model by base ID (case-insensitive)
  const model = asrModels.find(m => m.preset.id.toLowerCase() === baseId.toLowerCase());
  if (!model) {
    return false;
  }

  // If no quantization specified, check if the model is downloaded
  if (!quant) {
    // For models without quantization (like ONNX), check the downloaded flag directly
    // downloadedQuants may be empty for ONNX models
    if (model.downloaded) {
      return true;
    }
    // For GGUF models with quantization, check downloadedQuants
    const downloadedQuants = model.downloadedQuants || [];
    return downloadedQuants.length > 0;
  }

  // Check if the specific quantization version is downloaded (case-insensitive)
  const normalizedQuant = quant.toUpperCase();
  const downloadedQuants = model.downloadedQuants || [];

  return downloadedQuants.some(q => q.toUpperCase() === normalizedQuant);
}

/**
 * Get custom ASR model directories
 * Returns list of user-added directories containing custom ASR models
 */
export async function getCustomAsrModelDirs(): Promise<string[]> {
  return invoke<string[]>('get_custom_asr_model_dirs');
}

/**
 * Add a custom ASR model directory
 * @param path Directory path to add
 * @returns true if added successfully
 */
export async function addCustomAsrModelDir(path: string): Promise<boolean> {
  return invoke<boolean>('add_custom_asr_model_dir', { path });
}

/**
 * Remove a custom ASR model directory
 * @param path Directory path to remove
 * @returns true if removed successfully
 */
export async function removeCustomAsrModelDir(path: string): Promise<boolean> {
  return invoke<boolean>('remove_custom_asr_model_dir', { path });
}