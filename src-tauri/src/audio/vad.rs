use anyhow::Result;
use std::collections::VecDeque;

/// VAD sensitivity level for dynamic adjustment
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SensitivityLevel {
    /// Normal sensitivity - default behavior
    Normal,
    /// High sensitivity - faster segmentation, less hangover tolerance
    High,
}

/// VAD frame classification
pub enum VadFrame<'a> {
    /// Speech frame - may contain multiple frames (prefill + current + hangover)
    Speech(&'a [f32]),
    /// Non-speech (silence, noise)
    Noise,
}

impl<'a> VadFrame<'a> {
    #[inline]
    pub fn is_speech(&self) -> bool {
        matches!(self, VadFrame::Speech(_))
    }
}

/// Voice Activity Detector trait
pub trait VoiceActivityDetector: Send + Sync {
    /// Process one audio frame and return classification
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> Result<VadFrame<'a>>;

    /// Check if a frame contains voice (convenience method)
    fn is_voice(&mut self, frame: &[f32]) -> Result<bool> {
        Ok(self.push_frame(frame)?.is_speech())
    }

    /// Adjust VAD sensitivity for faster/slower segmentation
    /// Default implementation does nothing - override in implementations that support it
    fn adjust_sensitivity(&mut self, _level: SensitivityLevel) {}

    /// Reset detector state
    fn reset(&mut self) {}
}

/// Smoothed VAD wrapper with prefill, hangover, and onset logic
///
/// This wrapper adds temporal smoothing to prevent rapid state changes:
/// - Prefill: Keep N frames before speech starts (capture speech onset)
/// - Hangover: Keep N frames after speech ends (capture speech trailing)
/// - Onset: Require N consecutive voice frames before declaring speech
///
/// Supports dynamic sensitivity adjustment via `adjust_sensitivity()`:
/// - Normal mode: default hangover for natural pauses
/// - High mode: reduced hangover for faster segmentation
pub struct SmoothedVad {
    inner_vad: Box<dyn VoiceActivityDetector>,
    prefill_frames: usize,
    hangover_frames: usize,
    normal_hangover_frames: usize, // Store original hangover for reset
    high_hangover_frames: usize,   // High sensitivity hangover (default: 3 frames = 90ms)
    onset_frames: usize,

    frame_buffer: VecDeque<Vec<f32>>,
    hangover_counter: usize,
    onset_counter: usize,
    in_speech: bool,

    temp_out: Vec<f32>,
    current_sensitivity: SensitivityLevel,
}

impl SmoothedVad {
    /// Create a new smoothed VAD wrapper
    ///
    /// # Arguments
    /// * `inner_vad` - The underlying VAD detector
    /// * `prefill_frames` - Number of frames to keep before speech starts
    /// * `hangover_frames` - Number of frames to keep after speech ends (normal mode)
    /// * `onset_frames` - Number of consecutive voice frames required to start speech
    pub fn new(
        inner_vad: Box<dyn VoiceActivityDetector>,
        prefill_frames: usize,
        hangover_frames: usize,
        onset_frames: usize,
    ) -> Self {
        Self {
            inner_vad,
            prefill_frames,
            hangover_frames,
            normal_hangover_frames: hangover_frames,
            high_hangover_frames: 2, // 64ms - extremely sensitive, finds any pause
            onset_frames,
            frame_buffer: VecDeque::new(),
            hangover_counter: 0,
            onset_counter: 0,
            in_speech: false,
            temp_out: Vec::new(),
            current_sensitivity: SensitivityLevel::Normal,
        }
    }
}

impl VoiceActivityDetector for SmoothedVad {
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> Result<VadFrame<'a>> {
        // 1. Buffer every incoming frame for possible pre-roll
        self.frame_buffer.push_back(frame.to_vec());
        while self.frame_buffer.len() > self.prefill_frames + 1 {
            self.frame_buffer.pop_front();
        }

        // 2. Delegate to the wrapped VAD
        let is_voice = self.inner_vad.is_voice(frame)?;

        match (self.in_speech, is_voice) {
            // Potential start of speech - need to accumulate onset frames
            (false, true) => {
                self.onset_counter += 1;
                if self.onset_counter >= self.onset_frames {
                    // We have enough consecutive voice frames to trigger speech
                    self.in_speech = true;
                    self.hangover_counter = self.hangover_frames;
                    self.onset_counter = 0;

                    // Collect prefill + current frame
                    self.temp_out.clear();
                    for buf in &self.frame_buffer {
                        self.temp_out.extend(buf);
                    }
                    Ok(VadFrame::Speech(&self.temp_out))
                } else {
                    // Not enough frames yet, still silence
                    Ok(VadFrame::Noise)
                }
            }

            // Ongoing Speech
            (true, true) => {
                self.hangover_counter = self.hangover_frames;
                Ok(VadFrame::Speech(frame))
            }

            // End of Speech or interruption during onset phase
            (true, false) => {
                if self.hangover_counter > 0 {
                    self.hangover_counter -= 1;
                    Ok(VadFrame::Speech(frame))
                } else {
                    self.in_speech = false;
                    Ok(VadFrame::Noise)
                }
            }

            // Silence or broken onset sequence
            (false, false) => {
                self.onset_counter = 0;
                Ok(VadFrame::Noise)
            }
        }
    }

    fn adjust_sensitivity(&mut self, level: SensitivityLevel) {
        if self.current_sensitivity == level {
            return; // No change needed
        }

        self.current_sensitivity = level;
        match level {
            SensitivityLevel::Normal => {
                self.hangover_frames = self.normal_hangover_frames;
                log::info!(
                    "[VAD] Sensitivity set to Normal (hangover={} frames = {}ms)",
                    self.hangover_frames,
                    self.hangover_frames * 32
                );
            }
            SensitivityLevel::High => {
                self.hangover_frames = self.high_hangover_frames;
                log::info!("[VAD] Sensitivity set to High (hangover={} frames = {}ms) - controlling segment length",
                    self.hangover_frames, self.hangover_frames * 32);
            }
        }
    }

    fn reset(&mut self) {
        self.frame_buffer.clear();
        self.hangover_counter = 0;
        self.onset_counter = 0;
        self.in_speech = false;
        self.temp_out.clear();
        self.inner_vad.reset();

        // Restore normal sensitivity on reset
        if self.current_sensitivity != SensitivityLevel::Normal {
            self.current_sensitivity = SensitivityLevel::Normal;
            self.hangover_frames = self.normal_hangover_frames;
            log::info!("[VAD] Reset: sensitivity restored to Normal");
        }
    }
}
