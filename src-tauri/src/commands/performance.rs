use crate::performance::{LlmPerformanceDatabase, PerformanceDatabase};
use log::info;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

/// 记录转录性能的请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordPerformanceRequest {
    pub model_id: String,
    pub device: String, // "CPU" or "GPU"
    pub audio_duration: f64,
    pub transcribe_time: f64,
}

/// 预估转录时间的请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateTimeRequest {
    pub model_id: String,
    pub device: String,
    pub audio_duration: f64,
}

/// 预估转录时间的响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateTimeResponse {
    pub estimated_time: f64, // 秒
    pub has_sufficient_data: bool,
    pub samples: u32,
    pub avg_rtf: f64,
}

/// 记录 LLM 性能的请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordLlmPerformanceRequest {
    pub model_id: String,
    pub text_len: u32,
    pub process_time: f64,
}

/// 预估 LLM 时间的请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateLlmTimeRequest {
    pub model_id: String,
    pub text_len: u32,
}

/// 预估 LLM 时间的响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateLlmTimeResponse {
    pub estimated_time: f64, // 秒
    pub has_sufficient_data: bool,
    pub interval: String, // "short", "medium", "long"
    pub samples: u32,
    pub avg_time_ms: f64, // 该区间的平均时间（毫秒）
}

/// 全局性能跟踪器的 State
pub struct PerformanceState(pub Arc<crate::performance::GlobalPerformanceTracker>);

/// 全局 LLM 性能跟踪器的 State
pub struct LlmPerformanceState(pub Arc<crate::performance::GlobalLlmPerformanceTracker>);

/// 记录转录性能数据
#[tauri::command]
pub fn record_performance(
    state: State<'_, PerformanceState>,
    request: RecordPerformanceRequest,
) -> Result<(), String> {
    info!(
        "[record_performance] model: {}, device: {}, audio: {:.2}s, transcribe: {:.2}s",
        request.model_id, request.device, request.audio_duration, request.transcribe_time
    );

    state.0.record(
        &request.model_id,
        &request.device,
        request.audio_duration,
        request.transcribe_time,
    );

    Ok(())
}

/// 预估转录时间
#[tauri::command]
pub fn estimate_transcribe_time(
    state: State<'_, PerformanceState>,
    request: EstimateTimeRequest,
) -> Result<EstimateTimeResponse, String> {
    info!(
        "[estimate_transcribe_time] model: {}, device: {}, audio: {:.2}s",
        request.model_id, request.device, request.audio_duration
    );

    let estimated_time =
        state
            .0
            .estimate_time(&request.model_id, &request.device, request.audio_duration);
    let stats = state.0.get_model_stats(&request.model_id, &request.device);

    let (has_sufficient_data, samples, avg_rtf) = match stats {
        Some(s) => (s.samples >= 3, s.samples, s.avg_rtf),
        None => (false, 0, 0.0),
    };

    Ok(EstimateTimeResponse {
        estimated_time,
        has_sufficient_data,
        samples,
        avg_rtf,
    })
}

/// 获取所有性能统计
#[tauri::command]
pub fn get_performance_stats(
    state: State<'_, PerformanceState>,
) -> Result<PerformanceDatabase, String> {
    info!("[get_performance_stats] ========== CALLED ==========");
    let db = state.0.get_all_stats();
    info!(
        "[get_performance_stats] Stats keys: {:?}, count: {}",
        db.stats.keys().collect::<Vec<_>>(),
        db.stats.len()
    );
    Ok(db)
}

/// 初始化性能跟踪器
pub fn init_performance_tracker(data_dir: &std::path::Path) -> PerformanceState {
    let tracker = crate::performance::GlobalPerformanceTracker::new(&data_dir.to_path_buf());
    info!("[Performance] 性能跟踪器初始化完成");
    PerformanceState(Arc::new(tracker))
}

/// 初始化 LLM 性能跟踪器
pub fn init_llm_performance_tracker(data_dir: &std::path::Path) -> LlmPerformanceState {
    let tracker = crate::performance::GlobalLlmPerformanceTracker::new(&data_dir.to_path_buf());
    info!("[LLM Performance] LLM 性能跟踪器初始化完成");
    LlmPerformanceState(Arc::new(tracker))
}

/// 记录 LLM 性能数据（时间单位：毫秒）
#[tauri::command]
pub fn record_llm_performance(
    state: State<'_, LlmPerformanceState>,
    request: RecordLlmPerformanceRequest,
) -> Result<(), String> {
    info!(
        "[record_llm_performance] model: {}, text_len: {}, process_time: {:.0}ms",
        request.model_id, request.text_len, request.process_time
    );

    state
        .0
        .record(&request.model_id, request.text_len, request.process_time);

    Ok(())
}

/// 预估 LLM 处理时间
#[tauri::command]
pub fn estimate_llm_time(
    state: State<'_, LlmPerformanceState>,
    request: EstimateLlmTimeRequest,
) -> Result<EstimateLlmTimeResponse, String> {
    info!(
        "[estimate_llm_time] model: {}, text_len: {}",
        request.model_id, request.text_len
    );

    let estimated_time_ms = state
        .0
        .estimate_time_ms(&request.model_id, request.text_len);

    // 判断区间
    let interval = if request.text_len < 100 {
        "short"
    } else if request.text_len < 300 {
        "medium"
    } else {
        "long"
    };

    // 获取该区间的样本数
    let (has_sufficient_data, samples, avg_time_ms) =
        if let Some(stats) = state.0.get_model_stats(&request.model_id) {
            let interval_stats = match interval {
                "short" => &stats.short,
                "medium" => &stats.medium,
                "long" => &stats.long,
                _ => &stats.short,
            };
            (
                interval_stats.samples >= 3,
                interval_stats.samples,
                interval_stats.avg_time_ms,
            )
        } else {
            (false, 0, estimated_time_ms)
        };

    Ok(EstimateLlmTimeResponse {
        estimated_time: estimated_time_ms / 1000.0, // 转换为秒
        has_sufficient_data,
        interval: interval.to_string(),
        samples,
        avg_time_ms,
    })
}

/// 获取所有 LLM 性能统计
#[tauri::command]
pub fn get_llm_performance_stats(
    state: State<'_, LlmPerformanceState>,
) -> Result<LlmPerformanceDatabase, String> {
    info!("[get_llm_performance_stats] ========== CALLED ==========");
    let db = state.0.get_all_stats();
    info!(
        "[get_llm_performance_stats] Stats keys: {:?}, count: {}",
        db.stats.keys().collect::<Vec<_>>(),
        db.stats.len()
    );
    Ok(db)
}
