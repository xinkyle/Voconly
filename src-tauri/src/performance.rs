use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// 性能统计记录
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeStats {
    pub samples: u32,
    pub avg_rtf: f64,
    pub min_rtf: f64,
    pub max_rtf: f64,
    pub last_updated: u64,
    pub total_audio_duration: f64,
    pub total_transcribe_time: f64,
}

/// 区间统计数据
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IntervalStats {
    pub samples: u32,
    pub avg_time_ms: f64, // 平均处理时间（毫秒）
    pub min_time_ms: f64,
    pub max_time_ms: f64,
}

/// 默认处理速度（字/秒）
fn default_chars_per_sec() -> f64 {
    160.0
}

/// LLM 性能统计记录（区间模型）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LlmStats {
    /// 短文本区间（<100字）
    pub short: IntervalStats,
    /// 中文本区间（100-300字）
    pub medium: IntervalStats,
    /// 长文本区间（>300字）- 废弃，保留兼容
    pub long: IntervalStats,

    // 新增：300字以上的动态速度参数
    /// EWMA更新的处理速度（字/秒），初始160
    #[serde(default = "default_chars_per_sec")]
    pub long_chars_per_sec: f64,
    /// 300字以上样本计数
    #[serde(default)]
    pub long_samples: u32,
    /// 累积平均速度（用于日志对比）
    #[serde(default = "default_chars_per_sec")]
    pub long_avg_speed: f64,

    pub last_updated: u64,
}

/// 性能统计数据库
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PerformanceDatabase {
    pub stats: HashMap<String, TranscribeStats>,
}

/// LLM 性能统计数据库
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LlmPerformanceDatabase {
    pub stats: HashMap<String, LlmStats>,
}

// ========== LLM 区间预估配置 ==========

/// 区间文本长度阈值（字符数）
const INTERVAL_THRESHOLD_SHORT: u32 = 100; // <100 chars
const INTERVAL_THRESHOLD_MEDIUM: u32 = 300; // 100-300 chars

/// Default 区间预估时间（毫秒）
/// 基于实际测量：润色场景的 LLM 处理时间
/// 时间构成：基础开销(~400-600ms) + 生成分级时间
const DEFAULT_INTERVAL_SHORT_MS: f64 = 500.0; // 500ms
const DEFAULT_INTERVAL_MEDIUM_MS: f64 = 700.0; // 700ms
const DEFAULT_INTERVAL_LONG_MS: f64 = 1000.0; // 1000ms

/// 最小样本数阈值（达到此数量才使用模型自己的数据）
const MIN_SAMPLES_THRESHOLD: u32 = 3;

/// 性能统计管理器
pub struct PerformanceTracker {
    stats: HashMap<String, TranscribeStats>,
    stats_path: PathBuf,
}

impl PerformanceTracker {
    /// 创建新的性能跟踪器
    pub fn new(data_dir: &PathBuf) -> Self {
        let stats_path = data_dir.join("performance_stats.json");
        let stats = Self::load_stats(&stats_path).unwrap_or_default();

        Self { stats, stats_path }
    }

    /// 记录一次转录性能
    pub fn record(
        &mut self,
        model_id: &str,
        device: &str,
        audio_duration: f64,
        transcribe_time: f64,
    ) {
        let rtf = if audio_duration > 0.0 {
            transcribe_time / audio_duration
        } else {
            0.0
        };

        let key = format!("{}_{}", model_id, device);

        let entry = self.stats.entry(key.clone()).or_insert(TranscribeStats {
            samples: 0,
            avg_rtf: 0.0,
            min_rtf: f64::MAX,
            max_rtf: 0.0,
            last_updated: 0,
            total_audio_duration: 0.0,
            total_transcribe_time: 0.0,
        });

        // 累积数据
        entry.samples += 1;
        entry.total_audio_duration += audio_duration;
        entry.total_transcribe_time += transcribe_time;

        // 计算累积平均 RTF = 总识别时间 / 总音频时长
        entry.avg_rtf = if entry.total_audio_duration > 0.0 {
            entry.total_transcribe_time / entry.total_audio_duration
        } else {
            rtf
        };

        entry.min_rtf = entry.min_rtf.min(rtf);
        entry.max_rtf = entry.max_rtf.max(rtf);
        entry.last_updated = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // 提取日志需要的值（避免借用冲突）
        let avg_rtf = entry.avg_rtf;
        let samples = entry.samples;
        let total_audio = entry.total_audio_duration;

        // 持久化
        self.save_stats();

        log::info!(
            "[Performance] {} {}: rtf={:.3}, avg={:.3}, samples={}, total_audio={:.1}s",
            model_id,
            device,
            rtf,
            avg_rtf,
            samples,
            total_audio
        );
    }

    /// 获取预估转录时间
    pub fn estimate_time(&self, model_id: &str, device: &str, audio_duration: f64) -> f64 {
        let key = format!("{}_{}", model_id, device);

        if let Some(stats) = self.stats.get(&key) {
            if stats.samples >= 3 {
                // 有足够数据，使用平均值
                return audio_duration * stats.avg_rtf;
            }
        }

        // 没有足够数据，使用默认值
        let default_rtf = if device == "GPU" { 0.4 } else { 2.5 };
        audio_duration * default_rtf
    }

    /// 获取所有统计的副本
    pub fn get_all_stats(&self) -> PerformanceDatabase {
        PerformanceDatabase {
            stats: self.stats.clone(),
        }
    }

    /// 获取特定模型设备的统计
    pub fn get_model_stats(&self, model_id: &str, device: &str) -> Option<TranscribeStats> {
        let key = format!("{}_{}", model_id, device);
        self.stats.get(&key).cloned()
    }

    fn load_stats(path: &PathBuf) -> Option<HashMap<String, TranscribeStats>> {
        let data = fs::read_to_string(path).ok()?;
        serde_json::from_str(&data).ok()
    }

    fn save_stats(&self) {
        if let Ok(data) = serde_json::to_string_pretty(&self.stats) {
            if let Some(parent) = self.stats_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&self.stats_path, data);
        }
    }
}

/// 全局性能跟踪器（使用 Mutex 保证线程安全）
pub struct GlobalPerformanceTracker {
    inner: Arc<Mutex<PerformanceTracker>>,
}

impl GlobalPerformanceTracker {
    pub fn new(data_dir: &PathBuf) -> Self {
        Self {
            inner: Arc::new(Mutex::new(PerformanceTracker::new(data_dir))),
        }
    }

    pub fn record(&self, model_id: &str, device: &str, audio_duration: f64, transcribe_time: f64) {
        if let Ok(mut tracker) = self.inner.lock() {
            tracker.record(model_id, device, audio_duration, transcribe_time);
        }
    }

    pub fn estimate_time(&self, model_id: &str, device: &str, audio_duration: f64) -> f64 {
        if let Ok(tracker) = self.inner.lock() {
            tracker.estimate_time(model_id, device, audio_duration)
        } else {
            // 默认值
            let default_rtf = if device == "GPU" { 0.4 } else { 2.5 };
            audio_duration * default_rtf
        }
    }

    pub fn get_all_stats(&self) -> PerformanceDatabase {
        if let Ok(tracker) = self.inner.lock() {
            tracker.get_all_stats()
        } else {
            PerformanceDatabase::default()
        }
    }

    pub fn get_model_stats(&self, model_id: &str, device: &str) -> Option<TranscribeStats> {
        if let Ok(tracker) = self.inner.lock() {
            tracker.get_model_stats(model_id, device)
        } else {
            None
        }
    }
}

impl Clone for GlobalPerformanceTracker {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

/// LLM 性能统计管理器（区间模型）
pub struct LlmPerformanceTracker {
    stats: HashMap<String, LlmStats>,
    stats_path: PathBuf,
}

impl LlmPerformanceTracker {
    /// 创建新的 LLM 性能跟踪器
    pub fn new(data_dir: &PathBuf) -> Self {
        let stats_path = data_dir.join("llm_performance_stats.json");
        let stats = Self::load_stats(&stats_path).unwrap_or_default();

        Self { stats, stats_path }
    }

    /// 判断文本属于哪个区间
    fn get_interval(text_len: u32) -> &'static str {
        if text_len < INTERVAL_THRESHOLD_SHORT {
            "short"
        } else if text_len < INTERVAL_THRESHOLD_MEDIUM {
            "medium"
        } else {
            "long"
        }
    }

    /// 记录一次 LLM 处理性能
    pub fn record(&mut self, model_id: &str, text_len: u32, process_time_ms: f64) {
        let _interval = Self::get_interval(text_len);

        let entry = self.stats.entry(model_id.to_string()).or_insert(LlmStats {
            short: IntervalStats::default(),
            medium: IntervalStats::default(),
            long: IntervalStats::default(),
            long_chars_per_sec: 160.0, // 初始速度
            long_samples: 0,
            long_avg_speed: 160.0,
            last_updated: 0,
        });

        // 300字以上：EWMA更新动态速度参数
        if text_len > INTERVAL_THRESHOLD_MEDIUM {
            const BASE_TIME_MS: f64 = 700.0; // 300字基数时间

            // 边界检查：实际耗时必须大于基数时间才能计算速度
            if process_time_ms > BASE_TIME_MS {
                // 实测速度 = (字数 - 300) / ((实际耗时 - 基数) / 1000)
                let extra_chars = (text_len - INTERVAL_THRESHOLD_MEDIUM) as f64;
                let extra_time_sec = (process_time_ms - BASE_TIME_MS) / 1000.0;
                let measured_speed = extra_chars / extra_time_sec;

                // EWMA更新: new = 0.8 * old + 0.2 * measured
                let old_speed = entry.long_chars_per_sec;
                entry.long_chars_per_sec = 0.8 * old_speed + 0.2 * measured_speed;
                entry.long_samples += 1;

                // 累积平均（用于日志对比）
                let prev_avg = entry.long_avg_speed;
                let prev_samples = entry.long_samples - 1;
                if prev_samples > 0 {
                    entry.long_avg_speed = (prev_avg * prev_samples as f64 + measured_speed)
                        / entry.long_samples as f64;
                } else {
                    entry.long_avg_speed = measured_speed;
                }

                log::info!(
                    "[LLM Performance] {} >300 chars: len={}, time={}ms, measured={} chars/s, ewma={} chars/s, samples={}",
                    model_id,
                    text_len,
                    process_time_ms as u32,
                    measured_speed as u32,
                    entry.long_chars_per_sec as u32,
                    entry.long_samples
                );
            } else {
                log::warn!(
                    "[LLM Performance] {} >300 chars: time={}ms < base {}ms, skipping speed update",
                    model_id,
                    process_time_ms as u32,
                    BASE_TIME_MS as u32
                );
            }
        } else {
            // 300字以内：不再更新区间统计，保持固定值
            log::info!(
                "[LLM Performance] {} <=300 chars: len={}, time={}ms (fixed estimate used)",
                model_id,
                text_len,
                process_time_ms as u32
            );
        }

        entry.last_updated = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        // 持久化
        self.save_stats();
    }

    /// 预估 LLM 处理时间（毫秒）
    pub fn estimate_time_ms(&self, model_id: &str, text_len: u32) -> f64 {
        const SHORT_TIME_MS: f64 = 500.0; // <100字固定值
        const MEDIUM_TIME_MS: f64 = 700.0; // 100-300字固定值
        const BASE_TIME_MS: f64 = 700.0; // 300字基数（与medium衔接）
        const DEFAULT_CHARS_PER_SEC: f64 = 160.0;

        // <100字：固定值
        if text_len < INTERVAL_THRESHOLD_SHORT {
            return SHORT_TIME_MS;
        }

        // 100-300字：固定值
        if text_len <= INTERVAL_THRESHOLD_MEDIUM {
            return MEDIUM_TIME_MS;
        }

        // >300字：线性预估
        let extra_chars = (text_len - INTERVAL_THRESHOLD_MEDIUM) as f64;

        // 使用动态速度参数（如果存在）或默认值
        let chars_per_sec = if let Some(stats) = self.stats.get(model_id) {
            if stats.long_chars_per_sec > 0.0 {
                stats.long_chars_per_sec
            } else {
                DEFAULT_CHARS_PER_SEC
            }
        } else {
            DEFAULT_CHARS_PER_SEC
        };

        // 线性公式：基数时间 + 超出字数 / 速度 * 1000
        let extra_time_ms = (extra_chars / chars_per_sec) * 1000.0;
        let estimated = BASE_TIME_MS + extra_time_ms;

        log::debug!(
            "[LLM Estimate] {}: len={}, chars_per_sec={}, estimated={}ms",
            model_id,
            text_len,
            chars_per_sec as u32,
            estimated as u32
        );

        estimated
    }

    /// 获取所有统计的副本
    pub fn get_all_stats(&self) -> LlmPerformanceDatabase {
        LlmPerformanceDatabase {
            stats: self.stats.clone(),
        }
    }

    /// 获取特定模型的统计
    pub fn get_model_stats(&self, model_id: &str) -> Option<LlmStats> {
        self.stats.get(model_id).cloned()
    }

    fn load_stats(path: &PathBuf) -> Option<HashMap<String, LlmStats>> {
        let data = fs::read_to_string(path).ok()?;
        serde_json::from_str(&data).ok()
    }

    fn save_stats(&self) {
        if let Ok(data) = serde_json::to_string_pretty(&self.stats) {
            if let Some(parent) = self.stats_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&self.stats_path, data);
        }
    }
}

/// 全局 LLM 性能跟踪器
pub struct GlobalLlmPerformanceTracker {
    inner: Arc<Mutex<LlmPerformanceTracker>>,
}

impl GlobalLlmPerformanceTracker {
    pub fn new(data_dir: &PathBuf) -> Self {
        Self {
            inner: Arc::new(Mutex::new(LlmPerformanceTracker::new(data_dir))),
        }
    }

    /// 记录 LLM 处理性能（时间单位：毫秒）
    pub fn record(&self, model_id: &str, text_len: u32, process_time_ms: f64) {
        if let Ok(mut tracker) = self.inner.lock() {
            tracker.record(model_id, text_len, process_time_ms);
        }
    }

    /// 预估 LLM 处理时间（返回毫秒）
    pub fn estimate_time_ms(&self, model_id: &str, text_len: u32) -> f64 {
        if let Ok(tracker) = self.inner.lock() {
            tracker.estimate_time_ms(model_id, text_len)
        } else {
            // 默认值（mutex lock 失败时使用）
            const SHORT_TIME_MS: f64 = 500.0;
            const MEDIUM_TIME_MS: f64 = 700.0;
            const DEFAULT_CHARS_PER_SEC: f64 = 160.0;

            if text_len < INTERVAL_THRESHOLD_SHORT {
                SHORT_TIME_MS
            } else if text_len <= INTERVAL_THRESHOLD_MEDIUM {
                MEDIUM_TIME_MS
            } else {
                // >300字：线性预估
                let extra_chars = (text_len - INTERVAL_THRESHOLD_MEDIUM) as f64;
                MEDIUM_TIME_MS + (extra_chars / DEFAULT_CHARS_PER_SEC) * 1000.0
            }
        }
    }

    pub fn get_all_stats(&self) -> LlmPerformanceDatabase {
        if let Ok(tracker) = self.inner.lock() {
            tracker.get_all_stats()
        } else {
            LlmPerformanceDatabase::default()
        }
    }

    pub fn get_model_stats(&self, model_id: &str) -> Option<LlmStats> {
        if let Ok(tracker) = self.inner.lock() {
            tracker.get_model_stats(model_id)
        } else {
            None
        }
    }
}

impl Clone for GlobalLlmPerformanceTracker {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}
