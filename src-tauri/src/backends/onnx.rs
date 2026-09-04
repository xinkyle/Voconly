use super::{BackendType, OnnxModelType, SpeechBackend, TranscribeParams, TranscribeResult};
use std::path::Path;
use std::sync::RwLock;

/// ONNX Runtime 后端实现 (使用 transcribe-rs 封装的 ONNX 引擎)
pub struct OnnxBackend {
    // transcribe-rs models require &mut self for transcribe_with
    // Use RwLock for thread-safe interior mutability
    engine: RwLock<OnnxEngine>,
}

/// ONNX 引擎封装
enum OnnxEngine {
    /// SenseVoice 模型 (阿里通义)
    SenseVoice(transcribe_rs::onnx::sense_voice::SenseVoiceModel),
    /// Parakeet 模型 (NVIDIA)
    Parakeet(transcribe_rs::onnx::parakeet::ParakeetModel),
    /// Moonshine 模型 (Useful Sensors)
    Moonshine(transcribe_rs::onnx::moonshine::MoonshineModel),
}

impl OnnxBackend {
    /// 从模型ID检测ONNX模型类型
    pub fn detect_model_type(model_id: &str) -> OnnxModelType {
        let id = model_id.to_lowercase();
        if id.contains("sensevoice") || id.contains("sense_voice") {
            OnnxModelType::SenseVoice
        } else if id.contains("parakeet") {
            OnnxModelType::Parakeet
        } else if id.contains("moonshine") {
            OnnxModelType::Moonshine
        } else if id.contains("whisper") {
            OnnxModelType::Whisper
        } else {
            // 默认尝试作为 SenseVoice 加载
            OnnxModelType::SenseVoice
        }
    }

    /// 加载 SenseVoice 模型
    fn load_sensevoice(model_path: &Path) -> std::io::Result<Self> {
        use transcribe_rs::onnx::{sense_voice::SenseVoiceModel, Quantization};

        let model = SenseVoiceModel::load(model_path, &Quantization::Int8).map_err(
            |e: transcribe_rs::TranscribeError| {
                std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
            },
        )?;

        Ok(Self {
            engine: RwLock::new(OnnxEngine::SenseVoice(model)),
        })
    }

    /// 加载 Parakeet 模型
    fn load_parakeet(model_path: &Path) -> std::io::Result<Self> {
        use transcribe_rs::onnx::{parakeet::ParakeetModel, Quantization};

        let model = ParakeetModel::load(model_path, &Quantization::Int8).map_err(
            |e: transcribe_rs::TranscribeError| {
                std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
            },
        )?;

        Ok(Self {
            engine: RwLock::new(OnnxEngine::Parakeet(model)),
        })
    }

    /// 加载 Moonshine 模型
    fn load_moonshine(model_path: &Path, model_id: &str) -> std::io::Result<Self> {
        use transcribe_rs::onnx::{
            moonshine::{MoonshineModel, MoonshineVariant},
            Quantization,
        };

        // 根据模型 ID 选择正确的变体
        let variant = if model_id.contains("tiny") {
            MoonshineVariant::Tiny
        } else {
            // base 或其他默认使用 Base
            MoonshineVariant::Base
        };

        log::info!(
            "[OnnxBackend] Loading Moonshine model with variant: {:?} for model_id: {}",
            variant,
            model_id
        );

        let model = MoonshineModel::load(model_path, variant, &Quantization::default()).map_err(
            |e: transcribe_rs::TranscribeError| {
                std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
            },
        )?;

        Ok(Self {
            engine: RwLock::new(OnnxEngine::Moonshine(model)),
        })
    }
}

impl SpeechBackend for OnnxBackend {
    fn load(model_path: &Path) -> std::io::Result<Self> {
        // For ONNX models, model_path is expected to be a directory
        // The actual model file should be model.int8.onnx inside the directory
        if !model_path.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Model directory not found: {:?}", model_path),
            ));
        }

        // Check if it's a directory (expected for ONNX models)
        let model_dir = if model_path.is_dir() {
            model_path.to_path_buf()
        } else {
            // Legacy support: if a file was passed, use its parent directory
            model_path.parent().unwrap_or(model_path).to_path_buf()
        };

        // 从路径推断模型类型
        let model_id = model_dir
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let model_type = Self::detect_model_type(&model_id);

        // 根据模型类型选择加载方式
        match model_type {
            OnnxModelType::SenseVoice => Self::load_sensevoice(&model_dir),
            OnnxModelType::Parakeet => Self::load_parakeet(&model_dir),
            OnnxModelType::Moonshine => Self::load_moonshine(&model_dir, &model_id),
            OnnxModelType::Whisper | OnnxModelType::Unknown => {
                // Whisper ONNX 暂不支持，默认为 SenseVoice
                Self::load_sensevoice(&model_dir)
            }
        }
    }

    fn transcribe(
        &self,
        audio: &[f32],
        params: &TranscribeParams,
    ) -> std::io::Result<TranscribeResult> {
        let mut engine = self.engine.write().map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("Lock error: {}", e))
        })?;
        let text = match &mut *engine {
            OnnxEngine::SenseVoice(engine) => {
                use transcribe_rs::onnx::sense_voice::SenseVoiceParams;

                let mut sp = SenseVoiceParams::default();
                if !params.language.is_empty() && params.language != "auto" {
                    sp.language = Some(params.language.clone());
                }

                match engine.transcribe_with(audio, &sp) {
                    Ok(result) => result.text,
                    Err(e) => {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("SenseVoice transcribe failed: {}", e),
                        ))
                    }
                }
            }
            OnnxEngine::Parakeet(engine) => {
                use transcribe_rs::onnx::parakeet::{ParakeetParams, TimestampGranularity};

                let mut pp = ParakeetParams::default();
                pp.timestamp_granularity = Some(TimestampGranularity::Segment);

                match engine.transcribe_with(audio, &pp) {
                    Ok(result) => result.text,
                    Err(e) => {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("Parakeet transcribe failed: {}", e),
                        ))
                    }
                }
            }
            OnnxEngine::Moonshine(engine) => {
                use transcribe_rs::onnx::moonshine::MoonshineParams;

                let mp = MoonshineParams::default();

                match engine.transcribe_with(audio, &mp) {
                    Ok(result) => result.text,
                    Err(e) => {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("Moonshine transcribe failed: {}", e),
                        ))
                    }
                }
            }
        };

        Ok(TranscribeResult::new(text))
    }

    fn memory_usage(&self) -> u64 {
        // ONNX Runtime 模型通常需要加载到内存
        // 实际使用时应从运行时获取准确值
        // 这里返回估算值
        let engine = self.engine.read().unwrap();
        match &*engine {
            OnnxEngine::SenseVoice(_) => 200, // MB
            OnnxEngine::Parakeet(_) => 1500,  // MB
            OnnxEngine::Moonshine(_) => 100,  // MB
        }
    }

    fn backend_type(&self) -> BackendType {
        BackendType::Onnx
    }
}

/// 应用 ONNX Runtime 加速器设置
pub fn apply_ort_accelerator(accelerator: &str) {
    use transcribe_rs::accel;

    log::info!("[OrtAccelerator] ========== 开始设置 GPU 加速器 ==========");
    log::info!("[OrtAccelerator] 请求的加速器: {}", accelerator);

    // 打印可用的加速器
    let available = accel::OrtAccelerator::available();
    log::info!("[OrtAccelerator] 编译时可用的加速器: {:?}", available);

    let ort_pref = match accelerator {
        "cpu" => accel::OrtAccelerator::CpuOnly,
        "cuda" => accel::OrtAccelerator::Cuda,
        "directml" | "dml" => accel::OrtAccelerator::DirectMl,
        "rocm" => accel::OrtAccelerator::Rocm,
        _ => accel::OrtAccelerator::Auto,
    };

    log::info!("[OrtAccelerator] 映射后的加速器枚举: {:?}", ort_pref);
    log::info!("[OrtAccelerator] 即将调用 set_ort_accelerator...");

    // 设置加速器 (这只是设置原子变量，不应崩溃)
    accel::set_ort_accelerator(ort_pref);

    // 验证设置是否成功
    let current = accel::get_ort_accelerator();
    log::info!("[OrtAccelerator] 设置后读取的加速器: {:?}", current);

    // 简洁总结：使用的 GPU 加速器
    let accelerator_name = match current {
        accel::OrtAccelerator::CpuOnly => "CPU",
        accel::OrtAccelerator::Cuda => "CUDA",
        accel::OrtAccelerator::DirectMl => "DirectML",
        accel::OrtAccelerator::Rocm => "ROCm",
        accel::OrtAccelerator::TensorRt => "TensorRT",
        accel::OrtAccelerator::CoreMl => "CoreML",
        accel::OrtAccelerator::WebGpu => "WebGPU",
        accel::OrtAccelerator::Xnnpack => "XNNPACK",
        accel::OrtAccelerator::Auto => "Auto",
        // 非穷尽枚举，未来可能新增
        _ => "Unknown",
    };
    log::info!("[OrtAccelerator] GPU 加速器: {}", accelerator_name);
}
