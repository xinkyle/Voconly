// ============== 后端类型 ==============
// 后端类型枚举 - 必须与 Rust 后端枚举值完全匹配 (大写开头)
export type BackendType = 'Whisper' | 'Onnx';

// ============== 预览窗口高度档位 ==============
export type PreviewHeight = 'high' | 'medium' | 'low';

// ============== GPU 信息 ==============
export interface GpuInfo {
  available: boolean;
  gpuType: string;  // cuda, metal, vulkan, none
  maxDevices: number;
  recommendedLayers: number;  // -1 = 全部层，0 = CPU
}

// ============== 加载策略 ==============
// 加载策略类型 - 所有模型均为常驻内存模式
export type LoadStrategy = { type: 'Always' };

// ============== 下载源 ==============
export interface DownloadSource {
  name: string;
  url: string;
  isChinaAccessible: boolean;
  priority: number;
}

// 模型定义
export interface Model {
  id: string;
  name: string;
  backend: BackendType;
  size: string;
  downloaded: boolean;
  path?: string;
  downloadUrls: DownloadSource[];
  languages: string[];
  description?: string;
  modelType?: 'asr' | 'llm';  // 模型类型：ASR 或 LLM
  supportsAutoDetect?: boolean;  // 是否支持自动语言检测
  defaultLanguage?: string;  // 用户配置的默认语言
  supportsStreaming?: boolean;  // 是否支持流式转录
  accuracyScore?: number;  // 准确度评分 0-1
  speedScore?: number;  // 速度评分 0-1
}

// 场景定义
export interface Scene {
  id: string;
  name: string;
  shortcut: string;
  modelId: string;
  autoType?: boolean;
  enabled: boolean;
}

// 应用配置
//
// 职责分离设计:
// - 模型发现: 由文件扫描完成 (scan_available_asr_models)
// - 预设信息: 由 presets 模块提供
// - 用户偏好: 本配置文件仅存储用户设置（语言偏好等）
export interface AppConfig {
  /// DEPRECATED: 模型列表已迁移到预设系统
  /// 此字段仅保留用于向后兼容旧配置文件
  models?: Model[];

  /// 用户对每个 ASR 模型的默认语言偏好
  /// key: 模型 ID (如 "sensevoice-small", "qwen3-asr-0.6b-q4_0")
  /// value: 语言代码 (如 "zh", "en", "auto")
  modelLanguagePrefs?: Record<string, string>;

  scenes: Scene[];
  llm?: LlmConfig;  // LLM 后处理配置
  llmProvider?: LlmProviderConfig;  // LLM 全局 Provider 配置
  llmProviders?: Record<string, LlmProviderInstance>;  // 已配置的 Provider 实例
  llmProfiles?: LlmProfile[];  // LLM 场景级 Profile 列表
  llmPromptPresets?: UserPromptPresets;  // 提示词预设（单一存储）
  autoStart?: boolean;          // 开机自启
  defaultMicrophone?: string;   // 默认麦克风设备ID
  checkUpdates?: boolean;       // 自动检查更新
  showShortcutHint?: boolean;  // 显示快捷键提示
  maxHistoryRecords?: number;  // 最大历史记录数（默认100）
  maxRecordingDuration?: number; // 最大录音时长（秒，默认180秒/3分钟）
  logLevel?: string;           // 日志级别
  userDictionary?: UserDictionary;  // 用户词典
  segmentTranscribe?: boolean;  // 分段转录开关（默认 true）
  previewHeight?: PreviewHeight;  // 预览窗口高度档位（默认 medium）
  tutorialCompleted?: boolean;    // 首次引导是否已完成
  versionInfoUrl?: string;         // 版本信息 URL（用于自动更新检查）
}

// 麦克风设备
export interface MicrophoneDevice {
  deviceId: string;   // 设备ID
  label: string;       // 设备名称
  kind: string;       // 设备类型 (audioinput)
}

// 录音状态
export type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'typing';

// 悬浮面板状态 (使用 camelCase 匹配后端)
export interface FloatPanelState {
  visible: boolean;
  status: RecorderStatus;
  sceneName?: string;
  text?: string;
  // 进度相关信息
  modelId?: string;
  device?: 'CPU' | 'GPU';
  audioDuration?: number;
  isTranscribing?: boolean;
  // LLM 进度相关信息
  llmModelId?: string;
  hasLlmProfile?: boolean;
  textLen?: number;
  // 双击跳过 LLM 标记
  skipLlm?: boolean;
  // 分段转录开关（用于控制 VAD 停顿时的状态指示器）
  segmentTranscribe?: boolean;
}

// LLM 错误事件 payload
export interface LlmErrorPayload {
  /** 错误信息 */
  error: string;
  /** 是否已输出原文 */
  originalTextOutput: boolean;
}

// 快捷键事件
export interface ShortcutEvent {
  sceneId: string;
  shortcut: string;
}

// 可用模型（从配置读取）
export interface AvailableModel {
  id: string;
  name: string;
  backend: BackendType;
  size: string;
  url: string;
  description?: string;  // 模型应用场景描述
  downloaded?: boolean;  // 是否已下载
  // 加载状态（运行时）
  loading?: boolean;     // 正在加载模型
  loaded?: boolean;      // 模型已加载到内存
}

// 场景配置（从 project.json voice_input 配置）
export interface SceneConfig {
  id: string;
  name: string;
  shortcut: string;
  modelId: string;
  enabled: boolean;
}

// 历史记录
export interface HistoryRecord {
  id: string;
  timestamp: number;
  content: string;
  duration: number;  // 录音时长（秒）
  wordCount: number; // 字数
}

// ============== LLM 类型 ==============

// LLM Provider 类型
export type LlmProviderType = 'ollama' | 'openai' | 'deepseek' | 'gemini' | 'custom';

// 认证类型
export type AuthType = 'bearer' | 'x_api_key' | 'none';

// Provider 元数据（硬编码列表）
export interface ProviderMeta {
  id: string;           // "ollama", "openai", "deepseek"...
  label: string;        // "Ollama", "OpenAI", "DeepSeek"...
  icon: string;         // 图标标识
  baseUrl: string;     // 默认 API 地址
  allowBaseUrlEdit: boolean;
  requiresApiKey: boolean;
  authType: AuthType;
  popular: boolean;     // 是否常用（默认显示）
  description: string;  // 描述信息
}

// Provider 实例配置（用户配置）
export interface LlmProviderInstance {
  metaId: string;      // 对应 ProviderMeta.id
  enabled: boolean;
  baseUrl: string;     // 用户自定义或默认
  apiKey?: string;
  defaultModel?: string;
  nGpuLayers?: number;  // GPU 层数（仅 llama.cpp 有效，-1 = 全部，0 = CPU）
  contextLimit?: number; // 上下文长度限制（仅本地 Provider 有效，默认 4096）
  maxTokens?: number; // 最大输出 tokens（本地模型默认 1024）
}

// Provider 列表项（包含配置状态）
export interface ProviderWithConfig {
  meta: ProviderMeta;
  instance?: LlmProviderInstance;
}

// LLM Provider 配置
export interface LlmProviderConfig {
  providerType: LlmProviderType;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutSecs: number;
}

// LLM 配置
export interface LlmConfig {
  enabled: boolean;
  provider: LlmProviderConfig;
  userPromptTemplate: string;
  maxTokens: number;
  temperature: number;
}

// 用户提示词类型（前端显示用）
export type UserPromptType = 'LightPolish' | 'Translate' | 'ProfessionalPolish' | 'MeetingSecretary' | 'Custom';

// LLM Profile - 场景级配置
export interface LlmProfile {
  id: string;
  sceneId: string;
  enabled: boolean;
  providerId?: string;  // Provider ID，如 "ollama", "openai" 等
  model: string;
  /// 用户提示词类型：内置类型为 "polish", "translate", "summarize"
  /// 自定义预设为预设名称（如 "正式表达", "会议秘书"）
  userPromptType: string;
  userPromptCustom: string;
  maxTokens: number;
  temperature: number;
}

// 全局提示词预设
export interface UserPromptPresets {
  lightPolish: string;
  translate: string;
  professionalPolish: string;
  meetingSecretary: string;
  /** 用户自定义预设（key 为分类名称，value 为提示词模板） */
  customPresets?: Record<string, string>;
}

// ============== 用户词典类型 ==============

/// 单个词典词条
export interface DictionaryEntry {
  word: string;
  aliases?: string[];
}

/// 用户词典配置
export interface UserDictionary {
  enabled: boolean;
  entries: DictionaryEntry[];
  threshold: number;
  /** 原始输入文本（用于展示，保留用户格式） */
  rawText?: string;
}

// ============== 已加载模型信息 ==============

export interface LoadedModelInfo {
  modelId: string;
  backendType: string;
  memoryMb: number;
  sizeMb: number;
  loadedAtSecs: number;
  lastUsedSecs: number;
}

// ============== 统计信息 ==============

export interface StatsData {
  totalDuration: number;
  totalWords: number;
  totalCount: number;
  todayCount: number;
  todayDate: string;
  firstRecordDate?: string;
  activeDays: number;
}

export interface ArchiveStats {
  fileCount: number;
  totalRecords: number;
}