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
    pub model_id: String,
    pub enabled: bool,
    /// 模型加载策略
    #[serde(default)]
    pub load_strategy: LoadStrategy,
    /// 识别语言
    #[serde(default = "default_language")]
    pub language: String,
    /// 自动输入识别结果
    #[serde(default = "default_true")]
    pub auto_type: bool,
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

    pub scenes: Vec<Scene>,
    /// LLM 后处理配置
    #[serde(default)]
    pub llm: LlmConfig,
    /// LLM 全局 Provider 配置
    #[serde(default)]
    pub llm_provider: LlmProviderConfig,
    /// 已配置的 LLM Provider 实例
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub llm_providers: HashMap<String, LlmProviderInstance>,
    /// LLM 场景级 Profile 列表
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
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
}

/// 默认语言
fn default_language() -> String {
    "zh".to_string()
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
            // DEPRECATED: models 字段不再初始化，由预设系统管理
            // 保留空列表以便 serde 反序列化兼容
            #[allow(deprecated)]
            models: Vec::new(),

            // 新增：用户对每个模型的语言偏好
            model_language_prefs: HashMap::new(),

            scenes: vec![
                Scene {
                    id: "1".to_string(),
                    name: "快速录入".to_string(),
                    shortcut: "[".to_string(),
                    model_id: "".to_string(), // 空字符串，提示用户先下载模型
                    enabled: true,
                    load_strategy: LoadStrategy::Always,
                    language: "zh".to_string(),
                    auto_type: true,
                },
                Scene {
                    id: "2".to_string(),
                    name: "准确录入".to_string(),
                    shortcut: "]".to_string(),
                    model_id: "".to_string(), // 空字符串，提示用户先下载模型
                    enabled: true,
                    load_strategy: LoadStrategy::Lazy { idle_timeout: 300 },
                    language: "zh".to_string(),
                    auto_type: true,
                },
            ],
            auto_start: Some(false),
            default_microphone: None,
            check_updates: Some(true),
            show_shortcut_hint: Some(true),
            max_history_records: Some(100),
            max_recording_duration: Some(180), // 默认3分钟
            tutorial_completed: Some(false), // 默认未完成教程
            llm: LlmConfig::default(),
            llm_provider: LlmProviderConfig::default(),
            llm_providers: HashMap::new(),
            llm_profiles: Vec::new(),
            llm_prompt_presets: None,
            log_level: Some("debug".to_string()),
            user_dictionary: UserDictionary::default(),
            segment_transcribe: true, // 默认开启分段转录
            preview_height: PreviewHeight::default(), // 默认中等高度
            version_info_url: None, // 默认使用 updater.rs 中的内置 URL
            #[allow(deprecated)]
            llm_models: Vec::new(),
            custom_asr_model_dirs: Vec::new(),
        }
    }
}

/// Get the config file path
pub fn get_config_path() -> Result<PathBuf, String> {
    config_file_path()
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
pub fn load_config() -> Result<AppConfig, String> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        // 配置文件不存在，返回默认配置
        log::info!("[Config] Config file not found, using default config");
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let mut config: AppConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;

    // Restore default scenes if scenes array is empty
    if config.scenes.is_empty() {
        let default_config = AppConfig::default();
        config.scenes = default_config.scenes;
    }

    // 模型发现现在由 scan_available_asr_models() 完成
    // 不再在此处检查模型存在性

    log::info!("[Config] Loaded config with {} scenes", config.scenes.len());
    Ok(config)
}

/// Save configuration to file (internal helper function)
/// This can be called from other commands without the Tauri command wrapper
pub fn save_config_internal(config: &AppConfig, app_services: &AppServices) -> Result<(), String> {
    log::info!("[save_config_internal] Saving config");

    let config_path = get_config_path()?;
    log::info!("[save_config_internal] Config path: {:?}", config_path);

    let content = serde_json::to_string_pretty(&config)
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
        *memory_config = config.clone();
        log::info!("[save_config_internal] Memory config updated successfully");
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
