use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use crate::backends::{BackendType, LoadStrategy};
use crate::dictionary::UserDictionary;
use crate::llm::{LlmConfig, LlmProfile, LlmProviderConfig, LlmProviderInstance, UserPromptPresets};
use crate::model_manager::ModelManager;
use crate::paths::{config_file_path, models_dir};
use std::collections::HashMap;

/// 当前配置版本
/// 当配置结构发生重大变化时，递增此版本号
/// 旧版本配置会被自动备份并重置为默认配置
const CONFIG_VERSION: u32 = 2;

/// 版本检测是否已执行的标志
/// 确保版本检测只在应用启动时执行一次
static VERSION_CHECKED: AtomicBool = AtomicBool::new(false);

/// 本次启动是否发生过配置重置
/// 用于在 UI 层显示提示
static CONFIG_RESET_OCCURRED: AtomicBool = AtomicBool::new(false);

/// 模型引用，用于唯一标识一个模型实例
///
/// 将模型基础 ID 和量化版本分离存储，避免解析复杂度。
/// - `model_id`: 模型基础ID，如 `qwen3-asr-1.7b`
/// - `quantization`: 量化版本，如 `Q5_K_M`（可选）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelRef {
    /// 模型基础ID（如 qwen3-asr-1.7b）
    pub model_id: String,
    /// 量化版本（如 Q5_K_M），可选
    /// 为空时使用默认行为（最高精度或已下载版本）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantization: Option<String>,
}

impl ModelRef {
    /// 创建新的模型引用
    pub fn new(model_id: String) -> Self {
        Self { model_id, quantization: None }
    }

    /// 带量化版本
    pub fn with_quantization(model_id: String, quantization: String) -> Self {
        Self { model_id, quantization: Some(quantization) }
    }

    /// 获取完整ID（用于日志、显示等）
    pub fn full_id(&self) -> String {
        match &self.quantization {
            Some(q) => format!("{}-{}", self.model_id, q),
            None => self.model_id.clone(),
        }
    }
}

impl Default for ModelRef {
    fn default() -> Self {
        Self { model_id: String::new(), quantization: None }
    }
}

/// 全局模型配置
///
/// 将 ASR 和 LLM 模型配置从场景中剥离，实现全局共用。
/// 所有场景使用相同的 ASR 和 LLM 模型，仅提示词不同。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalModelConfig {
    /// ASR 模型引用（全局共用）
    #[serde(default)]
    pub asr_model: ModelRef,

    /// LLM 配置（全局共用）
    #[serde(default = "default_global_llm_config")]
    pub llm: GlobalLlmConfig,
}

/// 全局 LLM 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalLlmConfig {
    /// Provider ID（如 "ollama", "openai"）
    pub provider_id: String,
    /// 模型名称
    pub model: String,
    /// 最大输出 tokens
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    /// 温度参数
    #[serde(default = "default_temperature")]
    pub temperature: f32,
}

fn default_global_llm_config() -> GlobalLlmConfig {
    GlobalLlmConfig {
        provider_id: String::new(),
        model: String::new(),
        max_tokens: 1024,
        temperature: 0.7,
    }
}

fn default_max_tokens() -> u32 {
    1024
}

fn default_temperature() -> f32 {
    0.7
}

impl Default for GlobalLlmConfig {
    fn default() -> Self {
        default_global_llm_config()
    }
}

impl Default for GlobalModelConfig {
    fn default() -> Self {
        Self {
            asr_model: ModelRef::default(),
            llm: GlobalLlmConfig::default(),
        }
    }
}

/// GGUF model configuration for transcribe-cpp backend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GgufModelConfig {
    /// HuggingFace repo ID (e.g., "Qwen/Qwen3-Audio-0.6B-GGUF")
    pub repo_id: String,
    /// GGUF file name (e.g., "qwen3-asr-0.6b-q4_0.gguf")
    pub filename: String,
    /// Quantization level (e.g., "q4_0", "q8_0")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantization: Option<String>,
}

/// 用户已下载的 LLM 模型状态
/// DEPRECATED: 下载状态现在由文件系统扫描决定 (scan_available_llm_models)
/// 此结构体仅保留用于向后兼容旧配置文件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModelConfig {
    /// 预设 ID
    pub preset_id: String,
    /// 是否已下载
    pub downloaded: bool,
    /// 本地路径（如已下载）
    pub path: Option<String>,
}

impl Default for LlmModelConfig {
    fn default() -> Self {
        Self {
            preset_id: String::new(),
            downloaded: false,
            path: None,
        }
    }
}

/// ASR 模型缓存结构
///
/// 用于缓存扫描结果，避免重复文件系统扫描。
/// 当添加/删除自定义模型目录后，缓存会自动失效。
pub struct AsrModelsCache {
    /// 缓存的模型列表
    pub models: Vec<crate::presets::ModelPreset>,
    /// 缓存是否有效
    pub valid: std::sync::atomic::AtomicBool,
}

impl AsrModelsCache {
    /// 创建新的空缓存
    pub fn new() -> Self {
        Self {
            models: Vec::new(),
            valid: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// 标记缓存为无效（需要重新扫描）
    pub fn invalidate(&self) {
        self.valid.store(false, std::sync::atomic::Ordering::Release);
    }

    /// 检查缓存是否有效
    pub fn is_valid(&self) -> bool {
        self.valid.load(std::sync::atomic::Ordering::Acquire)
    }

    /// 更新缓存内容
    pub fn update(&mut self, models: Vec<crate::presets::ModelPreset>) {
        self.models = models;
        self.valid.store(true, std::sync::atomic::Ordering::Release);
    }
}

impl Default for AsrModelsCache {
    fn default() -> Self {
        Self::new()
    }
}

/// 下载取消管理器
///
/// 用于管理正在进行的下载任务，支持取消操作。
/// 每个 download task 注册一个取消信号，前端可以通过命令取消下载。
pub struct DownloadCancelManager {
    /// 正在下载的任务: model_id -> 取消信号
    /// 当信号被设置为 true 时，下载任务应该停止
    cancel_signals: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl DownloadCancelManager {
    /// 创建新的管理器
    pub fn new() -> Self {
        Self {
            cancel_signals: Mutex::new(HashMap::new()),
        }
    }

    /// 注册一个下载任务，返回取消信号
    ///
    /// 调用方应在下载循环中检查此信号：
    /// ```ignore
    /// if cancel_signal.load(std::sync::atomic::Ordering::Relaxed) {
    ///     // 清理临时文件，返回取消错误
    /// }
    /// ```
    pub fn register_download(&self, model_id: &str) -> Arc<AtomicBool> {
        let signal = Arc::new(AtomicBool::new(false));
        let mut signals = self.cancel_signals.lock().unwrap();
        signals.insert(model_id.to_string(), Arc::clone(&signal));
        log::info!("[DownloadCancel] Registered download task: {}", model_id);
        signal
    }

    /// 取消指定的下载任务
    ///
    /// 返回 true 如果任务存在并被取消，false 如果任务不存在
    pub fn cancel_download(&self, model_id: &str) -> bool {
        let mut signals = self.cancel_signals.lock().unwrap();
        if let Some(signal) = signals.get(model_id) {
            signal.store(true, std::sync::atomic::Ordering::Release);
            log::info!("[DownloadCancel] Cancel signal set for: {}", model_id);
            true
        } else {
            log::warn!("[DownloadCancel] No download task found for: {}", model_id);
            false
        }
    }

    /// 检查下载任务是否被取消
    pub fn is_cancelled(&self, model_id: &str) -> bool {
        let signals = self.cancel_signals.lock().unwrap();
        signals
            .get(model_id)
            .map(|s| s.load(std::sync::atomic::Ordering::Acquire))
            .unwrap_or(false)
    }

    /// 完成下载后清理
    ///
    /// 下载成功或失败后都应调用此方法清理注册信息
    pub fn finish_download(&self, model_id: &str) {
        let mut signals = self.cancel_signals.lock().unwrap();
        if signals.remove(model_id).is_some() {
            log::info!("[DownloadCancel] Cleaned up download task: {}", model_id);
        }
    }

    /// 获取正在下载的任务列表
    pub fn get_downloading_models(&self) -> Vec<String> {
        let signals = self.cancel_signals.lock().unwrap();
        signals.keys().cloned().collect()
    }
}

impl Default for DownloadCancelManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Application state with ModelManager and ASR Models Cache
pub struct AppServices {
    pub model_manager: Arc<Mutex<Option<ModelManager>>>,
    pub config: Arc<Mutex<AppConfig>>,
    /// ASR 模型缓存（避免重复文件系统扫描）
    pub asr_models_cache: Arc<Mutex<AsrModelsCache>>,
    /// 下载取消管理器（支持取消正在进行的下载）
    pub download_cancel_manager: Arc<DownloadCancelManager>,
}

/// 下载源
/// DEPRECATED: 此结构体已不再使用，模型下载信息现在由预设系统管理
/// 保留此结构体仅用于向后兼容旧的配置文件
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[deprecated(note = "Use presets::DownloadSourcePreset instead")]
pub struct DownloadSource {
    pub name: String,
    pub url: String,
    pub is_china_accessible: bool,
    pub priority: u8,
}

/// Model information
/// DEPRECATED: 模型信息现在由预设系统和文件扫描管理
/// 保留此结构体仅用于向后兼容旧的配置文件
/// 新的模型发现机制:
/// - ASR 模型: scan_available_asr_models() 扫描文件系统
/// - 预设信息: presets/asr_scanner.rs 提供
/// - 用户偏好: AppConfig.model_language_prefs 存储语言偏好
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[deprecated(note = "Model discovery is now handled by presets module")]
pub struct Model {
    pub id: String,
    pub name: String,
    /// 后端类型 (onnx/transcribe_cpp)
    #[serde(default)]
    pub backend: BackendType,
    /// 模型大小 (如 "39MB")
    pub size: String,
    /// 模型是否已下载
    pub downloaded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// 下载源列表
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub download_urls: Vec<DownloadSource>,
    /// 支持的语言
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub languages: Vec<String>,
    /// 模型描述
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// GGUF backend specific configuration (for transcribe-cpp)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gguf_config: Option<GgufModelConfig>,
    /// 是否支持自动语言检测
    #[serde(default)]
    pub supports_auto_detect: bool,
    /// 用户配置的默认语言
    #[serde(default = "default_auto_language")]
    pub default_language: String,
}

/// Scene configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub shortcut: String,
    /// 模型引用（新格式：包含 model_id 和 quantization）
    #[serde(default)]
    pub model: ModelRef,
    /// DEPRECATED: 旧的模型ID字段，仅用于向后兼容旧配置文件
    /// 读取时会自动迁移到 `model` 字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    pub enabled: bool,
    /// 模型加载策略
    #[serde(default)]
    pub load_strategy: LoadStrategy,
    /// 自动输入识别结果
    #[serde(default = "default_true")]
    pub auto_type: bool,
    /// 提示词类型：内置名（如 "lightPolish", "translate"）或自定义预设名
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub prompt_type: String,
    /// 场景专属自定义提示词（可选，优先于 promptType）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_prompt: Option<String>,
}

/// 预览窗口高度档位
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PreviewHeight {
    /// 高 - 显示更多内容
    High,
    /// 中 - 适中显示
    #[default]
    Medium,
    /// 低 - 仅显示约3行
    Low,
}

/// Application configuration
///
/// 职责分离设计:
/// - 模型发现: 由文件扫描完成 (scan_available_asr_models)
/// - 预设信息: 由 presets 模块提供
/// - 用户偏好: 本配置文件仅存储用户设置（语言偏好等）
///
/// 向后兼容:
/// - 旧的 `models` 字段会被忽略（不再读取）
/// - 保留字段定义以便 serde 反序列化不报错
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// 配置版本号，用于检测重大变更并自动重置
    #[serde(default)]
    pub config_version: Option<u32>,

    /// 全局模型配置（ASR + LLM）
    #[serde(default)]
    pub global_model_config: GlobalModelConfig,

    /// DEPRECATED: 模型列表已迁移到预设系统
    /// 此字段仅保留用于向后兼容旧配置文件，新配置文件不会包含此字段
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[deprecated(note = "Use scan_available_asr_models() instead")]
    pub models: Vec<Model>,

    /// 用户对每个 ASR 模型的默认语言偏好
    /// key: 模型 ID (如 "sensevoice-small", "qwen3-asr-0.6b-q4_0")
    /// value: 语言代码 (如 "zh", "en", "auto")
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub model_language_prefs: HashMap<String, String>,

    /// 用户对每个 ASR 模型的精度版本偏好
    /// key: 模型 ID (如 "Qwen3-ASR-1.7B")
    /// value: 精度版本 (如 "Q5_K_M", "Q8_0")
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub model_quant_prefs: HashMap<String, String>,

    pub scenes: Vec<Scene>,
    /// DEPRECATED: LLM 后处理配置已迁移到 global_model_config.llm
    /// 此字段仅保留用于向后兼容旧配置文件
    #[serde(default)]
    #[deprecated(note = "Use global_model_config.llm instead")]
    pub llm: LlmConfig,
    /// DEPRECATED: LLM Provider 配置已迁移到 llm_providers
    /// 此字段仅保留用于向后兼容旧配置文件
    #[serde(default)]
    #[deprecated(note = "Use llm_providers instead")]
    pub llm_provider: LlmProviderConfig,
    /// 已配置的 LLM Provider 实例
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub llm_providers: HashMap<String, LlmProviderInstance>,
    /// DEPRECATED: LLM 场景级 Profile 已迁移到 Scene.promptType 和 Scene.customPrompt
    /// 此字段仅保留用于向后兼容旧配置文件
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[deprecated(note = "Use Scene.promptType and Scene.customPrompt instead")]
    pub llm_profiles: Vec<LlmProfile>,
    /// 提示词预设（单一存储，不按语言分）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub llm_prompt_presets: Option<UserPromptPresets>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_start: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_microphone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_updates: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_shortcut_hint: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_history_records: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_recording_duration: Option<u64>, // 最大录音时长（秒，默认180秒/3分钟）
    /// 教程是否已完成
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tutorial_completed: Option<bool>,
    /// 日志级别
    #[serde(default)]
    pub log_level: Option<String>,
    /// 用户词典
    #[serde(default)]
    pub user_dictionary: UserDictionary,
    /// 分段转录开关
    /// true: 录音期间实时转录音频并显示文字
    /// false: 录音结束后一次性转录
    #[serde(default = "default_true")]
    pub segment_transcribe: bool,
    /// 预览窗口高度档位
    #[serde(default)]
    pub preview_height: PreviewHeight,
    /// 版本信息 URL（用于自动更新检查）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_info_url: Option<String>,
    /// LLM 模型状态
    /// DEPRECATED: 下载状态现在由文件系统扫描决定 (scan_available_llm_models)
    /// 此字段仅保留用于向后兼容旧配置文件，新配置文件不会包含此字段
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[deprecated(note = "Use scan_available_llm_models() instead")]
    pub llm_models: Vec<LlmModelConfig>,
    /// 用户自定义 ASR 模型文件夹路径列表
    /// 用户可通过"导入文件夹"功能添加额外的模型目录，
    /// scan_available_asr_models() 会扫描这些目录中的模型
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub custom_asr_model_dirs: Vec<String>,
    /// ASR 模型闲置自动卸载时间（秒）
    /// 默认 300 秒（5 分钟），设置为 0 禁用自动卸载
    #[serde(default = "default_asr_idle_timeout")]
    pub asr_idle_timeout_seconds: u64,
}

/// 默认 ASR 模型闲置超时时间（300 秒 = 5 分钟）
fn default_asr_idle_timeout() -> u64 {
    300
}

/// 默认自动语言
fn default_auto_language() -> String {
    "auto".to_string()
}

/// 默认 true
fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            // 配置版本号
            config_version: Some(CONFIG_VERSION),

            // 新增：全局模型配置
            global_model_config: GlobalModelConfig::default(),

            // DEPRECATED: models 字段不再初始化，由预设系统管理
            // 保留空列表以便 serde 反序列化兼容
            #[allow(deprecated)]
            models: Vec::new(),

            // 新增：用户对每个模型的语言偏好
            model_language_prefs: HashMap::new(),

            // 新增：用户对每个模型的精度版本偏好
            model_quant_prefs: HashMap::new(),

            scenes: vec![
                Scene {
                    id: "1".to_string(),
                    name: "轻度润色".to_string(),
                    shortcut: "[".to_string(),
                    model: ModelRef::new(String::new()), // 空 model_id，提示用户先下载模型
                    model_id: None,
                    enabled: true,
                    load_strategy: LoadStrategy::Always,
                    auto_type: true,
                    prompt_type: "lightPolish".to_string(),
                    custom_prompt: None,
                },
                Scene {
                    id: "2".to_string(),
                    name: "专业润色".to_string(),
                    shortcut: "]".to_string(),
                    model: ModelRef::new(String::new()), // 空 model_id，提示用户先下载模型
                    model_id: None,
                    enabled: true,
                    load_strategy: LoadStrategy::Lazy { idle_timeout: 300 },
                    auto_type: true,
                    prompt_type: "professionalPolish".to_string(),
                    custom_prompt: None,
                },
            ],
            auto_start: Some(true), // 默认开启开机自启
            default_microphone: None,
            check_updates: Some(true),
            show_shortcut_hint: Some(true),
            max_history_records: Some(100),
            max_recording_duration: Some(180), // 默认3分钟
            tutorial_completed: Some(false), // 默认未完成教程
            #[allow(deprecated)]
            llm: LlmConfig::default(),
            #[allow(deprecated)]
            llm_provider: LlmProviderConfig::default(),
            llm_providers: HashMap::new(),
            #[allow(deprecated)]
            llm_profiles: Vec::new(),
            llm_prompt_presets: None,
            log_level: Some("info".to_string()),
            user_dictionary: UserDictionary::default(),
            segment_transcribe: true, // 默认开启分段转录
            preview_height: PreviewHeight::default(), // 默认中等高度
            version_info_url: None, // 默认使用 updater.rs 中的内置 URL
            #[allow(deprecated)]
            llm_models: Vec::new(),
            custom_asr_model_dirs: Vec::new(),
            asr_idle_timeout_seconds: default_asr_idle_timeout(), // 默认 5 分钟
        }
    }
}

/// Get the config file path
pub fn get_config_path() -> Result<PathBuf, String> {
    config_file_path()
}

/// 配置加载结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadConfigResult {
    pub config: AppConfig,
    /// 版本是否匹配，false 表示配置已被重置，需要显示提示
    pub version_matches: bool,
}

/// Load configuration from file
///
/// 职责分离设计:
/// - 本函数仅加载用户偏好配置
/// - 模型发现由 scan_available_asr_models() 完成
/// - 预设信息由 presets 模块提供
///
/// 向后兼容:
/// - 旧的 `models` 字段会被忽略
/// - 保留字段定义以便 serde 反序列化不报错
#[tauri::command]
pub fn load_config() -> Result<LoadConfigResult, String> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        // 配置文件不存在，返回默认配置
        log::info!("[Config] Config file not found, using default config");
        return Ok(LoadConfigResult {
            config: AppConfig::default(),
            version_matches: true,
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    // 尝试解析配置
    let parsed: Result<AppConfig, _> = serde_json::from_str(&content);

    // 检查版本是否匹配
    let version_matches = parsed.as_ref()
        .map(|c| c.config_version == Some(CONFIG_VERSION))
        .unwrap_or(false);

    // 检查是否已经执行过版本重置（使用静态变量追踪）
    let version_checked = VERSION_CHECKED.load(std::sync::atomic::Ordering::Relaxed);

    log::info!(
        "[Config] Version check: version_checked={}, version_matches={}, expected={}, got={:?}",
        version_checked,
        version_matches,
        CONFIG_VERSION,
        parsed.as_ref().ok().and_then(|c| c.config_version)
    );

    // 只在首次调用且版本不匹配时执行重置
    if !version_checked && !version_matches {
        // 标记版本检测已执行
        VERSION_CHECKED.store(true, std::sync::atomic::Ordering::Relaxed);
        // 标记本次启动发生了配置重置
        CONFIG_RESET_OCCURRED.store(true, std::sync::atomic::Ordering::Relaxed);

        // 版本不匹配，备份旧配置并重置
        let backup_path = config_path.with_extension("backup.json");

        log::info!(
            "[Config] Config version mismatch (expected {}, got {:?}). Backing up to {:?}",
            CONFIG_VERSION,
            parsed.as_ref().ok().and_then(|c| c.config_version),
            backup_path
        );

        // 备份旧配置
        if let Err(e) = fs::copy(&config_path, &backup_path) {
            log::warn!("[Config] Failed to backup old config: {}", e);
        }

        // 重置为默认配置
        let new_config = AppConfig::default();
        log::info!(
            "[Config] New default config has config_version: {:?}",
            new_config.config_version
        );

        // 保存新配置
        let config_content = serde_json::to_string_pretty(&new_config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        log::info!(
            "[Config] Serialized config contains 'configVersion': {}",
            config_content.contains("configVersion")
        );
        fs::write(&config_path, config_content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;

        log::info!("[Config] Config reset to default (version {})", CONFIG_VERSION);

        return Ok(LoadConfigResult {
            config: new_config,
            version_matches: false,
        });
    }

    // 标记版本检测已执行（如果还没标记）
    if !version_checked {
        VERSION_CHECKED.store(true, std::sync::atomic::Ordering::Relaxed);
    }

    // 版本匹配，正常加载
    let mut config: AppConfig = parsed.map_err(|e| format!("Failed to parse config file: {}", e))?;

    // 数据迁移：将旧的 model_id 字段迁移到新的 model 字段
    let migrated_model_refs = migrate_scene_model_refs(&mut config);

    // 数据迁移：将旧的 llm_profiles[].userPromptType 迁移到 scenes[].promptType
    let migrated_prompt_types = migrate_scene_prompt_types(&mut config);

    // 数据迁移：补全全局 LLM 配置（从 llm_providers 中选择第一个启用的）
    let migrated_llm_config = migrate_global_llm_config(&mut config);

    // 如果发生了迁移，保存配置文件
    if migrated_model_refs || migrated_prompt_types || migrated_llm_config {
        log::info!("[Config] Migration occurred, saving updated config");
        let config_content = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(&config_path, config_content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;
    }

    // Restore default scenes if scenes array is empty
    if config.scenes.is_empty() {
        let default_config = AppConfig::default();
        config.scenes = default_config.scenes;
    }

    // 检查本次启动是否发生过配置重置
    let reset_occurred = CONFIG_RESET_OCCURRED.load(std::sync::atomic::Ordering::Relaxed);
    // 如果发生过重置，强制返回 version_matches=false 以便前端显示提示
    let version_matches = if reset_occurred {
        log::info!("[Config] Config reset occurred earlier, returning version_matches=false");
        false
    } else {
        version_matches
    };

    log::info!("[Config] Loaded config with {} scenes, version_matches={}",
        config.scenes.len(), version_matches);
    Ok(LoadConfigResult {
        config,
        version_matches,
    })
}

/// 迁移场景的模型引用数据
///
/// 将旧的 `model_id` 字段（可能包含量化后缀）迁移到新的 `model` 字段。
/// 迁移规则：
/// - 如果 `model.model_id` 为空但 `model_id` 存在，解析 `model_id` 并迁移
/// - 解析时尝试提取量化后缀（如 Q5_K_M）
/// - 迁移后清空 `model_id` 字段
///
/// 返回 `true` 表示发生了迁移，`false` 表示无变化
fn migrate_scene_model_refs(config: &mut AppConfig) -> bool {
    let mut migrated = false;
    for scene in &mut config.scenes {
        // 如果 model.model_id 为空但有旧的 model_id 字段，进行迁移
        if scene.model.model_id.is_empty() {
            if let Some(old_model_id) = &scene.model_id {
                if !old_model_id.is_empty() {
                    // 解析旧的 model_id，提取基础 ID 和量化后缀
                    let base_id = crate::utils::get_base_model_id(old_model_id);
                    let quant = crate::utils::extract_quant_suffix(old_model_id);

                    scene.model = ModelRef {
                        model_id: base_id,
                        quantization: quant,
                    };

                    log::info!(
                        "[Config] Migrated scene '{}': model_id '{}' -> model {{ model_id: '{}', quantization: {:?} }}",
                        scene.id, old_model_id, scene.model.model_id, scene.model.quantization
                    );

                    // 清空旧字段
                    scene.model_id = None;
                    migrated = true;
                }
            }
        } else {
            // 新字段已有值，清空旧字段
            scene.model_id = None;
        }
    }
    migrated
}

/// 迁移场景提示词类型
///
/// 将旧的 `llm_profiles[].user_prompt_type` 迁移到 `scenes[].prompt_type`。
/// 迁移规则：
/// - 遍历所有场景，如果 `prompt_type` 为空：
///   - 在 `llm_profiles` 中查找 `scene_id` 匹配的 profile
///   - 如果找到，将 `user_prompt_type` 复制到 `prompt_type`
///   - 如果没找到，根据场景名称设置默认值
///
/// 返回 `true` 表示发生了迁移，`false` 表示无变化
fn migrate_scene_prompt_types(config: &mut AppConfig) -> bool {
    #[allow(deprecated)]
    let profiles = &config.llm_profiles;
    let mut migrated = false;

    for scene in &mut config.scenes {
        // 如果 prompt_type 为空，尝试从 llm_profiles 迁移
        if scene.prompt_type.is_empty() {
            // 在 llm_profiles 中查找匹配的 profile
            let matched_profile = profiles.iter().find(|p| p.scene_id == scene.id);

            if let Some(profile) = matched_profile {
                if !profile.user_prompt_type.is_empty() {
                    scene.prompt_type = profile.user_prompt_type.clone();
                    log::info!(
                        "[Config] Migrated scene '{}' prompt_type from llm_profiles: '{}'",
                        scene.id, scene.prompt_type
                    );
                    migrated = true;
                }
            } else {
                // 没找到匹配的 profile，根据场景名称设置默认值
                let default_type = match scene.name.as_str() {
                    "轻度润色" => "lightPolish",
                    "专业润色" => "professionalPolish",
                    "翻译" => "translate",
                    _ => "lightPolish",
                };
                scene.prompt_type = default_type.to_string();
                log::info!(
                    "[Config] Set default prompt_type for scene '{}': '{}' (name: '{}')",
                    scene.id, scene.prompt_type, scene.name
                );
                migrated = true;
            }
        }
    }
    migrated
}

/// 补全全局 LLM 配置
///
/// 如果 `global_model_config.llm.provider_id` 或 `model` 为空，
/// 从 `llm_providers` 中找到第一个启用的 provider 进行补全。
///
/// 返回 `true` 表示发生了迁移，`false` 表示无变化
fn migrate_global_llm_config(config: &mut AppConfig) -> bool {
    let llm = &mut config.global_model_config.llm;
    let mut migrated = false;

    // 如果 provider_id 或 model 为空，尝试从 llm_providers 补全
    if llm.provider_id.is_empty() || llm.model.is_empty() {
        // 从 llm_providers 中找到第一个启用的 provider
        let first_enabled = config
            .llm_providers
            .values()
            .find(|provider| provider.enabled);

        if let Some(provider) = first_enabled {
            // 补全 provider_id
            if llm.provider_id.is_empty() {
                llm.provider_id = provider.meta_id.clone();
                log::info!(
                    "[Config] Migrated global LLM provider_id from llm_providers: '{}'",
                    llm.provider_id
                );
                migrated = true;
            }

            // 补全 model（如果 provider 有 default_model）
            if llm.model.is_empty() {
                if let Some(default_model) = &provider.default_model {
                    llm.model = default_model.clone();
                    log::info!(
                        "[Config] Migrated global LLM model from llm_providers: '{}'",
                        llm.model
                    );
                    migrated = true;
                }
            }
        } else {
            log::info!(
                "[Config] No enabled llm_provider found, skipping global LLM config migration"
            );
        }
    }
    migrated
}

/// Save configuration to file (internal helper function)
/// This can be called from other commands without the Tauri command wrapper
pub fn save_config_internal(config: &AppConfig, app_services: &AppServices) -> Result<(), String> {
    log::info!("[save_config_internal] Saving config");
    log::info!("[save_config_internal] ⏱️ ASR idle timeout: {} seconds ({} minutes)",
        config.asr_idle_timeout_seconds,
        config.asr_idle_timeout_seconds / 60
    );

    let config_path = get_config_path()?;
    log::info!("[save_config_internal] Config path: {:?}", config_path);

    // 确保版本号始终是当前版本
    let config_to_save = if config.config_version != Some(CONFIG_VERSION) {
        let mut config = config.clone();
        config.config_version = Some(CONFIG_VERSION);
        log::info!("[save_config_internal] Updated config version to {}", CONFIG_VERSION);
        config
    } else {
        config.clone()
    };

    let content = serde_json::to_string_pretty(&config_to_save)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    log::info!(
        "[save_config_internal] Serialized config length: {} bytes",
        content.len()
    );

    fs::write(&config_path, content).map_err(|e| format!("Failed to write config file: {}", e))?;
    log::info!("[save_config_internal] File written successfully");

    // Update in-memory config
    {
        let mut memory_config = app_services
            .config
            .lock()
            .map_err(|e| format!("Failed to lock config: {}", e))?;
        *memory_config = config_to_save;
        log::info!("[save_config_internal] ✅ Memory config updated, asr_idle_timeout_seconds = {}",
            memory_config.asr_idle_timeout_seconds
        );
    }

    // 配置变更后，清理不再被任何场景使用的模型
    {
        let mut model_manager = app_services
            .model_manager
            .lock()
            .map_err(|e| format!("Failed to lock model manager: {}", e))?;
        if let Some(mgr) = model_manager.as_mut() {
            mgr.cleanup_unused_models();
            log::info!("[save_config_internal] 已清理未使用的模型");
        }
    }

    Ok(())
}

/// Save configuration to file
#[tauri::command]
pub fn save_config(
    config: AppConfig,
    app_services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    log::info!("[save_config] Called with config");
    log::info!("[save_config] Scenes: {:?}", config.scenes);

    // 保留内存中的 custom_asr_model_dirs（前端不维护这个字段）
    let custom_dirs = {
        let memory_config = app_services
            .config
            .lock()
            .map_err(|e| format!("Failed to lock config: {}", e))?;
        memory_config.custom_asr_model_dirs.clone()
    };

    // 如果前端传递的配置没有自定义目录，使用内存中的值
    let mut config = config;
    if config.custom_asr_model_dirs.is_empty() && !custom_dirs.is_empty() {
        log::info!(
            "[save_config] 保留内存中的 custom_asr_model_dirs: {:?}",
            custom_dirs
        );
        config.custom_asr_model_dirs = custom_dirs;
    }

    // Use the internal helper function
    save_config_internal(&config, &app_services)?;

    Ok(())
}

/// Get model storage directory
#[tauri::command]
pub fn get_model_storage_path() -> Result<String, String> {
    let model_dir = models_dir()?;
    Ok(model_dir.to_string_lossy().to_string())
}

/// Check if config file exists
#[tauri::command]
pub fn config_exists() -> bool {
    if let Ok(path) = get_config_path() {
        path.exists()
    } else {
        false
    }
}

// Note: mark_model_downloaded() and mark_llm_model_downloaded() have been removed.
// Download status is now determined by filesystem scanning:
// - ASR models: scan_available_asr_models() in presets/asr_scanner.rs
// - LLM models: scan_available_llm_models() in llm_models/presets.rs

#[cfg(test)]
mod global_model_config_tests {
    use super::*;

    #[test]
    fn test_global_model_config_serialization() {
        // 创建 GlobalModelConfig 实例
        let config = GlobalModelConfig {
            asr_model: ModelRef::with_quantization(
                "qwen3-asr-1.7b".to_string(),
                "Q5_K_M".to_string(),
            ),
            llm: GlobalLlmConfig {
                provider_id: "ollama".to_string(),
                model: "qwen2.5:7b".to_string(),
                max_tokens: 2048,
                temperature: 0.7,
            },
        };

        // 序列化
        let json = serde_json::to_string_pretty(&config).unwrap();
        println!("Serialized GlobalModelConfig:\n{}", json);

        // 反序列化
        let deserialized: GlobalModelConfig = serde_json::from_str(&json).unwrap();

        // 验证
        assert_eq!(deserialized.asr_model.model_id, "qwen3-asr-1.7b");
        assert_eq!(deserialized.asr_model.quantization, Some("Q5_K_M".to_string()));
        assert_eq!(deserialized.llm.provider_id, "ollama");
        assert_eq!(deserialized.llm.model, "qwen2.5:7b");
        assert_eq!(deserialized.llm.max_tokens, 2048);
        assert_eq!(deserialized.llm.temperature, 0.7);
    }

    #[test]
    fn test_app_config_with_global_model_config() {
        // 创建带有 GlobalModelConfig 的 AppConfig
        let config = AppConfig {
            global_model_config: GlobalModelConfig {
                asr_model: ModelRef::new("sensevoice-small".to_string()),
                llm: GlobalLlmConfig {
                    provider_id: "openai".to_string(),
                    model: "gpt-4".to_string(),
                    max_tokens: 1024,
                    temperature: 0.5,
                },
            },
            ..Default::default()
        };

        // 序列化
        let json = serde_json::to_string_pretty(&config).unwrap();
        println!("Serialized AppConfig:\n{}", json);

        // 验证 JSON 包含 globalModelConfig
        assert!(json.contains("globalModelConfig"));
        assert!(json.contains("asrModel"));
        assert!(json.contains("providerId"));

        // 反序列化
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();

        // 验证
        assert_eq!(deserialized.global_model_config.asr_model.model_id, "sensevoice-small");
        assert_eq!(deserialized.global_model_config.llm.provider_id, "openai");
    }

    #[test]
    fn test_backward_compatibility() {
        // 测试旧配置文件的反序列化（不包含 globalModelConfig）
        let old_config_json = r#"{
            "scenes": [
                {
                    "id": "1",
                    "name": "测试场景",
                    "shortcut": "1",
                    "model": {
                        "modelId": "sensevoice-small"
                    },
                    "enabled": true
                }
            ]
        }"#;

        // 应该能正常解析，使用默认的 globalModelConfig
        let config: AppConfig = serde_json::from_str(old_config_json).unwrap();

        // 验证默认值
        assert!(config.global_model_config.asr_model.model_id.is_empty());
        assert!(config.global_model_config.llm.provider_id.is_empty());
        assert_eq!(config.scenes.len(), 1);
    }
}
