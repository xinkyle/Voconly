//! Audio capture and VAD (Voice Activity Detection) module
//!
//! This module provides:
//! - Audio capture using cpal
//! - Voice Activity Detection using Silero VAD (ort 2.0)
//! - Smoothed VAD with prefill/hangover/onset logic

mod capture;
mod silero;
mod stream_router;
mod streaming;
mod vad;

pub use capture::AudioCapture;
pub use silero::SileroVad;
pub use stream_router::{StreamCmd, StreamRouter};
pub use streaming::{
    drain_until_finalize, emit_streaming_text, run_stream_worker, StreamingErrorEvent,
    StreamingTextEvent, StreamingTranscription,
};
pub use vad::{SensitivityLevel, SmoothedVad, VadFrame, VoiceActivityDetector};

/// Sample rate for Whisper (16kHz)
pub const WHISPER_SAMPLE_RATE: usize = 16000;
