//! Last recording module - saves the most recent transcription audio
//!
//! This module saves the most recent recording audio for debugging and re-transcription purposes.
//! The audio is saved to User Data/last_recording.wav (single file, overwritten each time)
//!
//! Usage: The audio is saved asynchronously, not blocking the main workflow

use crate::paths::last_recording_path;
use std::path::PathBuf;

/// Save the most recent audio for debugging/re-transcription
/// Returns the path where the audio was saved
pub fn save_last_recording(samples: &[f32], sample_rate: u32) -> Option<PathBuf> {
    let save_path = get_last_recording_path()?;

    // Create parent directory if needed
    if let Some(parent) = save_path.parent() {
        if !parent.exists() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    // Write WAV file
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    match hound::WavWriter::create(&save_path, spec) {
        Ok(mut writer) => {
            for sample in samples {
                let int_sample = (*sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                if writer.write_sample(int_sample).is_err() {
                    log::warn!("[LastRecording] Failed to write sample");
                    return None;
                }
            }
            if writer.finalize().is_err() {
                log::warn!("[LastRecording] Failed to finalize WAV file");
                return None;
            }
            log::info!("[LastRecording] Saved to: {:?}", save_path);
            Some(save_path)
        }
        Err(e) => {
            log::warn!("[LastRecording] Failed to create WAV writer: {}", e);
            None
        }
    }
}

/// Get the last recording file path
fn get_last_recording_path() -> Option<PathBuf> {
    last_recording_path().ok()
}

/// Get the last recording file path as string (for display)
pub fn get_last_recording_path_string() -> Option<String> {
    get_last_recording_path().map(|p| p.to_string_lossy().to_string())
}
