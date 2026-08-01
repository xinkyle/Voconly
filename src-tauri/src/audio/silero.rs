use anyhow::Result;
use ndarray::{Array1, Array2, Array3};
use ort::session::{Session, SessionInputValue};
use ort::value::Value;
use std::path::Path;

use super::{VadFrame, VoiceActivityDetector};
use crate::audio::WHISPER_SAMPLE_RATE;

/// Samples per frame for Silero v6.x models (16kHz * 32ms = 512)
const SILERO_FRAME_SAMPLES: usize = 512;

/// Context size for Silero v6.x models (64 samples for 16kHz)
/// Official implementation prepends context from previous frame
const CONTEXT_SIZE: usize = 64;

/// Total input size: context + frame = 64 + 512 = 576
const INPUT_SIZE: usize = CONTEXT_SIZE + SILERO_FRAME_SAMPLES;

/// Hidden state dimension for Silero VAD v6.x models
const HIDDEN_STATE_DIM: usize = 128;

/// Silero VAD detector (v6.x format)
///
/// Uses the Silero VAD ONNX model to detect voice activity.
/// Compatible with Silero VAD v6.x models (silero_vad_v6.2.1_16k.onnx)
///
/// Model format (v6.x):
/// - Inputs: input (batch, 576), state (2, batch, 128), sr (scalar)
/// - Outputs: output (batch, 1), stateN (2, batch, 128)
///
/// Note: Official implementation prepends 64 samples of context from previous frame,
/// so actual input size is 512 + 64 = 576 samples.
pub struct SileroVad {
    session: Session,
    threshold: f32,
    neg_threshold: f32,
    in_speech: bool,
    // Hidden state tensor (combined state for v6.x models)
    // Shape: (2, 1, 128)
    state_tensor: Array3<f32>,
    // Context buffer: last 64 samples from previous frame
    context: Vec<f32>,
    // Sample rate tensor
    sample_rate_tensor: Array1<i64>,
}

impl SileroVad {
    /// Create a new Silero VAD detector with hysteresis mechanism
    ///
    /// # Arguments
    /// * `model_path` - Path to the silero_vad.onnx model file
    /// * `threshold` - Voice probability threshold to enter speech state (default 0.5)
    /// * `neg_threshold` - Voice probability threshold to exit speech state (default 0.35)
    pub fn new<P: AsRef<Path>>(model_path: P, threshold: f32, neg_threshold: f32) -> Result<Self> {
        if !(0.0..=1.0).contains(&threshold) {
            anyhow::bail!("threshold must be between 0.0 and 1.0");
        }
        if !(0.0..=1.0).contains(&neg_threshold) {
            anyhow::bail!("neg_threshold must be between 0.0 and 1.0");
        }
        if neg_threshold >= threshold {
            anyhow::bail!(
                "neg_threshold ({}) must be less than threshold ({})",
                neg_threshold,
                threshold
            );
        }

        // Use ort 2.0 API to create session
        let session = Session::builder()?.commit_from_file(model_path)?;

        // Initialize hidden state tensor
        // Shape: (2, 1, 128) for v6.x models
        let state_tensor = Array3::<f32>::zeros((2, 1, HIDDEN_STATE_DIM));

        // Initialize context buffer with zeros
        let context = vec![0.0; CONTEXT_SIZE];

        // Sample rate tensor (16kHz = 16000)
        let sample_rate_tensor = Array1::from_vec(vec![WHISPER_SAMPLE_RATE as i64]);

        Ok(Self {
            session,
            threshold,
            neg_threshold,
            in_speech: false,
            state_tensor,
            context,
            sample_rate_tensor,
        })
    }
}

impl VoiceActivityDetector for SileroVad {
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> Result<VadFrame<'a>> {
        // Pad/truncate frame to exactly 512 samples
        let padded_frame: Vec<f32> = if frame.len() < SILERO_FRAME_SAMPLES {
            let mut padded = frame.to_vec();
            padded.extend(std::iter::repeat(0.0).take(SILERO_FRAME_SAMPLES - frame.len()));
            padded
        } else if frame.len() > SILERO_FRAME_SAMPLES {
            frame[..SILERO_FRAME_SAMPLES].to_vec()
        } else {
            frame.to_vec()
        };

        // Concatenate context + current frame = 64 + 512 = 576 samples
        // This matches official Silero v6.x implementation
        let input_samples: Vec<f32> = self
            .context
            .iter()
            .chain(padded_frame.iter())
            .cloned()
            .collect();

        // Update context for next frame (last 64 samples of current frame)
        self.context = padded_frame[padded_frame.len() - CONTEXT_SIZE..].to_vec();

        // Create input tensors
        // Audio input: shape (1, 576) = context + frame
        let audio_array = Array2::from_shape_vec((1, INPUT_SIZE), input_samples)?;
        let audio_input: Value = Value::from_array(audio_array)?.into();

        // State input: shape (2, 1, 128)
        let state_input: Value = Value::from_array(self.state_tensor.clone())?.into();

        // Sample rate input: scalar i64
        let sr_input: Value = Value::from_array(self.sample_rate_tensor.clone())?.into();

        // Run inference
        let inputs: [SessionInputValue; 3] =
            [audio_input.into(), state_input.into(), sr_input.into()];

        let outputs = match self.session.run(inputs) {
            Ok(o) => o,
            Err(e) => {
                log::error!("[Silero v6] Inference error: {:?}", e);
                anyhow::bail!("Silero inference failed: {:?}", e);
            }
        };

        // Extract output probability
        let output_view = outputs[0].try_extract_array::<f32>()?;
        let prob = *output_view.first().unwrap_or(&0.0);

        log::debug!(
            "[Silero v6] prob={}, threshold={}, neg_threshold={}, in_speech={}",
            prob,
            self.threshold,
            self.neg_threshold,
            self.in_speech
        );

        // Update state tensor from output
        let state_n_view = outputs[1].try_extract_array::<f32>()?;
        self.state_tensor =
            state_n_view
                .to_owned()
                .into_shape_with_order((2, 1, HIDDEN_STATE_DIM))?;

        // Hysteresis classification
        if self.in_speech {
            if prob < self.neg_threshold {
                self.in_speech = false;
                log::debug!("[Silero v6] Speech→Noise: prob={}", prob);
                Ok(VadFrame::Noise)
            } else {
                Ok(VadFrame::Speech(frame))
            }
        } else {
            if prob > self.threshold {
                self.in_speech = true;
                log::debug!("[Silero v6] Noise→Speech: prob={}", prob);
                Ok(VadFrame::Speech(frame))
            } else {
                Ok(VadFrame::Noise)
            }
        }
    }

    fn reset(&mut self) {
        self.state_tensor = Array3::<f32>::zeros((2, 1, HIDDEN_STATE_DIM));
        self.context = vec![0.0; CONTEXT_SIZE];
        self.in_speech = false;
    }
}
