import type { MicrophoneDevice } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from './log';

// 创建日志记录器
const log = createLogger('Audio');

/**
 * Audio Recording Service
 * Uses Web Audio API and MediaRecorder for audio recording
 * Also supports VAD-based recording via Rust backend
 */

// Audio context and recorder instances
let audioContext: AudioContext | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let stream: MediaStream | null = null;
let maxDurationTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Audio recording options
 */
export interface RecordingOptions {
  /** Recording duration limit in seconds (0 = no limit) */
  maxDuration?: number;
  /** Audio mime type */
  mimeType?: string;
  /** Specific microphone device ID to use */
  deviceId?: string;
}

/**
 * Audio data result
 */
export interface AudioData {
  /** Audio blob */
  blob: Blob;
  /** Audio file path (if saved) */
  path?: string;
  /** Recording duration in seconds */
  duration: number;
  /** Sample rate */
  sampleRate: number;
}

/**
 * Check if microphone permission is granted
 */
export async function checkMicrophonePermission(): Promise<PermissionState> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state;
  } catch {
    // Fallback for browsers that don't support permissions API
    return 'prompt';
  }
}

/**
 * Get list of available microphone devices
 * Filters out virtual devices and communication devices to show only real microphones
 * @returns Array of microphone devices
 */
export async function getMicrophones(): Promise<MicrophoneDevice[]> {
  try {
    // First request permission to access device labels
    const devices = await navigator.mediaDevices.enumerateDevices();

    // Keywords to filter out virtual/non-microphone devices
    const excludeKeywords = [
      '立体声混音', 'stereo mix', '混音',
      '通信', 'communication',
      '虚拟', 'virtual',
      'cable output', 'vb-audio',
    ];

    return devices
      .filter(device => device.kind === 'audioinput')
      .filter(device => {
        const label = device.label.toLowerCase();
        // Filter out virtual devices
        return !excludeKeywords.some(keyword => label.includes(keyword.toLowerCase()));
      })
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `麦克风 ${device.deviceId.slice(0, 8)}`,
        kind: device.kind,
      }));
  } catch (error) {
    log.error(`Failed to enumerate devices: ${error}`);
    return [];
  }
}

/**
 * Request microphone permission
 * @returns true if permission granted, false otherwise
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately after getting permission
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    return true;
  } catch (error) {
    log.error(`Microphone permission denied: ${error}`);
    return false;
  }
}

/**
 * Start audio recording
 * @param options Recording options
 * @returns true if recording started successfully
 */
export async function startRecording(options: RecordingOptions = {}): Promise<boolean> {
  try {
    // Build media constraints
    const mediaConstraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
      }
    };

    // Request microphone access
    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

    // Determine mime type
    let mimeType = options.mimeType || 'audio/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      // Fallback to webm if the preferred type is not supported
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Last resort: use any available type
        mimeType = '';
      }
    }

    // Create audio context for processing if needed
    audioContext = new AudioContext();

    // Create MediaRecorder
    const mediaStream = new MediaStream(stream.getAudioTracks());
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: mimeType || undefined,
    });

    audioChunks = [];
    log.debug('audioChunks cleared, starting new recording');

    // Handle data available event
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        log.debug(`Data chunk received, size: ${event.data.size}, total chunks: ${audioChunks.length}`);
      }
    };

    // Start recording
    log.debug('Calling mediaRecorder.start(100)');
    mediaRecorder.start(100); // Collect data every 100ms
    log.debug(`mediaRecorder.start() called, state: ${mediaRecorder.state}`);

    // Handle max duration if specified
    if (options.maxDuration && options.maxDuration > 0) {
      log.debug(`Setting max duration timeout: ${options.maxDuration} seconds`);
      // Clear any existing timeout first
      if (maxDurationTimeoutId) {
        clearTimeout(maxDurationTimeoutId);
        maxDurationTimeoutId = null;
      }
      maxDurationTimeoutId = setTimeout(() => {
        log.debug(`Max duration timeout triggered, current state: ${mediaRecorder?.state}`);
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          log.debug('Auto-stopping due to max duration');
          stopRecording();
        } else {
          log.debug('Max duration timeout: recording already stopped, skipping');
        }
        maxDurationTimeoutId = null;
      }, options.maxDuration * 1000);
    }

    return true;
  } catch (error) {
    log.error(`Failed to start recording: ${error}`);
    cleanup();
    return false;
  }
}

/**
 * Stop audio recording and return audio data
 * @returns Audio data or null if recording not active
 */
export async function stopRecording(): Promise<AudioData | null> {
  log.debug(`stopRecording() called, mediaRecorder: ${mediaRecorder ? 'exists' : 'null'}, state: ${mediaRecorder?.state}`);

  if (!mediaRecorder || mediaRecorder.state !== 'recording') {
    log.warn(`No active recording to stop, mediaRecorder: ${mediaRecorder}, state: ${mediaRecorder?.state}`);
    return null;
  }

  return new Promise((resolve) => {
    if (!mediaRecorder) {
      log.warn('mediaRecorder became null in Promise');
      resolve(null);
      return;
    }

    log.debug(`Setting up onstop handler, current chunks: ${audioChunks.length}`);

    // Set up a timeout to ensure we always resolve
    const timeoutId = setTimeout(() => {
      log.warn('stopRecording timeout triggered - onstop event never fired!');
      log.warn(`Current audioChunks count: ${audioChunks.length}`);
      cleanup();
      resolve(null);
    }, 5000); // 5 second timeout

    mediaRecorder.onstop = async () => {
      log.debug('onstop event fired!');
      clearTimeout(timeoutId);

      // Calculate duration
      const duration = audioChunks.length > 0 ? Math.round(audioChunks.length * 0.1) : 0;
      log.debug(`Calculated duration: ${duration} seconds, chunks: ${audioChunks.length}`);

      // Create audio blob
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      log.debug(`Audio blob created, size: ${audioBlob.size}`);

      // Clean up
      cleanup();

      resolve({
        blob: audioBlob,
        duration,
        sampleRate: audioContext?.sampleRate || 16000,
      });
    };

    // Stop recording
    try {
      log.debug('Calling mediaRecorder.stop()');
      mediaRecorder.stop();
      log.debug('mediaRecorder.stop() executed');
    } catch (error) {
      log.error(`Error stopping recorder: ${error}`);
      clearTimeout(timeoutId);
      cleanup();
      resolve(null);
    }
  });
}

/**
 * Check if currently recording
 */
export function isRecording(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

/**
 * Save audio data to file
 * @param audioData Audio data to save
 * @param filePath Optional file path. If not provided, will prompt user
 * @returns File path if saved successfully
 */
export async function saveAudioToFile(audioData: AudioData, filePath?: string): Promise<string | null> {
  try {
    // Dynamic import Tauri plugins
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');

    let savePath = filePath;

    // If no file path provided, prompt user
    if (!savePath) {
      const selected = await save({
        filters: [{
          name: 'Audio',
          extensions: ['webm', 'wav']
        }],
        defaultPath: `recording_${Date.now()}.webm`
      });

      if (!selected) {
        return null;
      }
      savePath = selected;
    }

    // Convert blob to array buffer
    const arrayBuffer = await audioData.blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Write to file using Tauri fs
    await writeFile(savePath!, uint8Array);

    return savePath ?? null;
  } catch (error) {
    log.error(`Failed to save audio: ${error}`);
    return null;
  }
}

/**
 * Convert audio blob to WAV format
 * This is useful for Whisper which prefers WAV format
 * @param audioBlob Original audio blob (webm)
 * @param sampleRate Target sample rate
 * @returns WAV formatted blob
 */
export async function convertToWav(audioBlob: Blob, sampleRate: number = 16000): Promise<Blob> {
  log.debug(`convertToWav called, input blob size: ${audioBlob.size}`);
  try {
    // Create a new AudioContext if not available (it may have been closed during cleanup)
    let ctx = audioContext;
    if (!ctx || ctx.state === 'closed') {
      log.debug('Creating new AudioContext');
      ctx = new AudioContext();
    }

    // Decode audio data
    log.debug('Decoding audio data...');
    const arrayBuffer = await audioBlob.arrayBuffer();
    log.debug(`Array buffer size: ${arrayBuffer.byteLength}`);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    log.debug(`Audio decoded, duration: ${audioBuffer.duration}, sampleRate: ${audioBuffer.sampleRate}`);

    // Convert to target sample rate if needed
    let buffer = audioBuffer;
    if (audioBuffer.sampleRate !== sampleRate) {
      log.debug(`Resampling from ${audioBuffer.sampleRate} to ${sampleRate}`);
      buffer = await resampleBuffer(audioBuffer, sampleRate);
    }

    // Encode to WAV
    log.debug('Encoding to WAV...');
    const wavBlob = await encodeWav(buffer);
    log.debug(`WAV encoded, size: ${wavBlob.size}`);
    return wavBlob;
  } catch (error) {
    log.error(`Failed to convert to WAV: ${error}`);
    // Return original if conversion fails
    return audioBlob;
  }
}

/**
 * Resample audio buffer to target sample rate
 */
async function resampleBuffer(audioBuffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
  if (audioBuffer.sampleRate === targetSampleRate) {
    return audioBuffer;
  }

  const ratio = audioBuffer.sampleRate / targetSampleRate;
  const newLength = Math.round(audioBuffer.length / ratio);
  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    newLength,
    targetSampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start();

  return offlineContext.startRendering();
}

/**
 * Encode AudioBuffer to WAV format
 */
async function encodeWav(buffer: AudioBuffer): Promise<Blob> {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write audio data
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Write string to DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Clean up resources
 */
function cleanup(): void {
  log.debug('cleanup() called');

  // Clear max duration timeout
  if (maxDurationTimeoutId) {
    log.debug('Clearing max duration timeout');
    clearTimeout(maxDurationTimeoutId);
    maxDurationTimeoutId = null;
  }

  // Stop all tracks in the stream
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  // Close audio context
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  // Clear recorder
  mediaRecorder = null;
  audioChunks = [];
}

/**
 * Get recording status
 */
export function getRecordingStatus(): string {
  if (!mediaRecorder) {
    return 'idle';
  }
  return mediaRecorder.state;
}

/**
 * Get audio level for visualization
 * @returns Audio level (0-1) or null if not recording
 */
export function getAudioLevel(): number | null {
  if (!stream || !isRecording()) {
    return null;
  }

  // This is a simplified version - for real visualization,
  // you would need to use AudioWorklet or AnalyserNode
  return 0.5;
}

export default {
  checkMicrophonePermission,
  getMicrophones,
  requestMicrophonePermission,
  startRecording,
  stopRecording,
  isRecording,
  saveAudioToFile,
  convertToWav,
  getRecordingStatus,
  getAudioLevel,
  // VAD-based recording functions
  startVadRecording,
  stopVadRecording,
  setStreamingMode,
  preinitAudioCapture,
};

/**
 * Start VAD-based recording using Rust backend
 * This uses Silero VAD to detect voice activity and filter silence
 * @param sceneId - The scene ID for transcription configuration
 */
export async function startVadRecording(sceneId?: string): Promise<boolean> {
  try {
    await invoke('start_vad_recording', { sceneId });
    return true;
  } catch (error) {
    log.error(`Failed to start VAD recording: ${error}`);
    return false;
  }
}

/**
 * Stop VAD-based recording and get audio file path
 * Returns the path to the recorded WAV file with silence filtered out
 */
export async function stopVadRecording(): Promise<string | null> {
  try {
    const audioPath = await invoke<string>('stop_vad_recording');
    return audioPath;
  } catch (error) {
    log.error(`Failed to stop VAD recording: ${error}`);
    return null;
  }
}

/**
 * Set streaming transcription mode
 * When enabled, audio segments are transcribed in real-time during recording
 */
export async function setStreamingMode(enabled: boolean): Promise<void> {
  try {
    await invoke('set_streaming_mode', { enabled });
  } catch (error) {
    log.error(`Failed to set streaming mode: ${error}`);
  }
}

/**
 * Pre-initialize audio capture to reduce latency on first recording
 * This creates the AudioCapture instance and opens the microphone device
 * so that subsequent recordings can start immediately without initialization delay
 */
export async function preinitAudioCapture(): Promise<boolean> {
  try {
    await invoke('preinit_audio_capture');
    log.info('Audio capture pre-initialized successfully');
    return true;
  } catch (error) {
    log.error(`Failed to pre-initialize audio capture: ${error}`);
    return false;
  }
}