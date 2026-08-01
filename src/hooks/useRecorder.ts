import { useCallback, useState, useRef, useEffect } from 'react';
import {
  startRecording as startRecordingService,
  stopRecording as stopRecordingService,
  requestMicrophonePermission,
  convertToWav,
  startVadRecording,
  stopVadRecording,
  type AudioData,
} from '../services/audio';
import { createLogger } from '../services/log';

// 创建日志记录器
const log = createLogger('Recorder');

export type RecorderStatus = 'idle' | 'recording';

interface UseRecorderOptions {
  /** Maximum recording duration in seconds (0 = no limit) */
  maxDuration?: number;
  /** Specific microphone device ID to use */
  deviceId?: string;
  /** Scene ID for transcription configuration */
  sceneId?: string;
  /** Callback when recording starts */
  onRecordingStarted?: () => void;
  /** Callback when recording stops with audio data (null in VAD mode since audio is processed during recording) */
  onRecordingStopped?: (audioData: AudioData | null) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Use VAD-based recording from Rust backend (default: true) */
  useVad?: boolean;
}

interface UseRecorderReturn {
  /** Current recording status */
  status: RecorderStatus;
  /** Whether recording is in progress */
  isRecording: boolean;
  /** Start recording */
  start: (sceneId?: string) => Promise<boolean>;
  /** Stop recording and get audio data */
  stop: () => Promise<AudioData | null>;
  /** Cancel recording and reset state */
  cancel: () => void;
  /** Last recorded audio data */
  lastAudioData: AudioData | null;
  /** Error message if any */
  error: string | null;
  /** Clear error */
  clearError: () => void;
  /** Convert last recording to WAV format */
  convertToWav: (sampleRate?: number) => Promise<Blob | null>;
}

/**
 * Hook for managing audio recording
 *
 * Provides functionality to:
 * - Start and stop audio recording
 * - Manage recording state (idle/recording)
 * - Handle microphone permissions
 * - Convert audio to WAV format for Whisper
 */
export function useRecorder(options: UseRecorderOptions = {}): UseRecorderReturn {
  const { maxDuration = 180, deviceId, sceneId, onRecordingStarted, onRecordingStopped, onError, useVad = true } = options;
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [lastAudioData, setLastAudioData] = useState<AudioData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep status in a ref for use in callbacks (avoids closure stale state)
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Keep callbacks in refs to avoid stale closures
  const onRecordingStartedRef = useRef(onRecordingStarted);
  const onRecordingStoppedRef = useRef(onRecordingStopped);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onRecordingStartedRef.current = onRecordingStarted;
    onRecordingStoppedRef.current = onRecordingStopped;
    onErrorRef.current = onError;
  }, [onRecordingStarted, onRecordingStopped, onError]);

  const isRecording = status === 'recording';

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const start = useCallback(async (overrideSceneId?: string): Promise<boolean> => {
    clearError();
    const effectiveSceneId = overrideSceneId ?? sceneId;
    log.debug(`start() called, useVad: ${useVad}, sceneId: ${effectiveSceneId}`);

    try {
      if (useVad) {
        // Use VAD-based recording from Rust backend
        log.debug('Starting VAD recording...');
        const success = await startVadRecording(effectiveSceneId);
        log.debug(`VAD recording result: ${success}`);

        if (!success) {
          const errMsg = '启动录音失败';
          setError(errMsg);
          onErrorRef.current?.(errMsg);
          return false;
        }

        setStatus('recording');
        log.debug('Recording started successfully');
        onRecordingStartedRef.current?.();
        return true;
      } else {
        // Use web-based recording (legacy)
        // Request microphone permission first
        log.debug('Checking microphone permission...');
        const hasPermission = await requestMicrophonePermission();
        log.debug(`Permission result: ${hasPermission}`);
        if (!hasPermission) {
          const errMsg = '无法获取麦克风权限，请检查系统设置';
          log.error('Permission denied');
          setError(errMsg);
          onErrorRef.current?.(errMsg);
          return false;
        }

        // Start recording
        log.debug('Calling startRecordingService...');
        const success = await startRecordingService({ maxDuration, deviceId });
        log.debug(`startRecordingService result: ${success}`);
        if (!success) {
          const errMsg = '启动录音失败';
          log.error('startRecordingService failed');
          setError(errMsg);
          onErrorRef.current?.(errMsg);
          return false;
        }

        setStatus('recording');
        log.debug('Calling onRecordingStarted callback');
        onRecordingStartedRef.current?.();
        log.debug('Recording started successfully');
        return true;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error(`Error in start(): ${errorMessage}`);
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
      return false;
    }
  }, [maxDuration, deviceId, sceneId, clearError, useVad]);

  const stop = useCallback(async (): Promise<AudioData | null> => {
    clearError();

    // Use ref to get current status (avoids closure stale state)
    const currentStatus = statusRef.current;
    log.debug(`stop() called, current status: ${currentStatus}`);

    if (currentStatus !== 'recording') {
      log.warn(`No active recording to stop, status is: ${currentStatus}`);
      return null;
    }

    try {
      if (useVad) {
        // Stop VAD recording - audio is saved asynchronously by backend
        // Frontend does not need to read the file (audio already processed during recording)
        log.debug('Stopping VAD recording...');
        await stopVadRecording();
        log.debug('VAD recording stopped (audio saved asynchronously to User Data/last_recording.wav)');

        // In VAD mode, audio is already processed during recording via streaming transcription
        // No need to read file or create blob
        setStatus('idle');
        onRecordingStoppedRef.current?.(null);  // Pass null - audio already processed
        return null;
      } else {
        // Use web-based recording (legacy)
        log.debug('Calling stopRecordingService...');
        const audioData = await stopRecordingService();
        log.debug(`stopRecordingService returned: ${audioData ? 'with data' : 'null/empty'}`);

        if (audioData) {
          log.debug('Setting lastAudioData and calling onRecordingStopped callback');
          setLastAudioData(audioData);
          lastAudioDataRef.current = audioData;  // Update ref immediately for callbacks
          log.debug('Calling onRecordingStoppedRef.current...');
          onRecordingStoppedRef.current?.(audioData);
          log.debug('onRecordingStopped callback completed');
        } else {
          const errMsg = '录音数据为空';
          log.error('Recording failed: audioData is null/empty, calling onError');
          setError(errMsg);
          onErrorRef.current?.(errMsg);
          log.debug('onError callback completed');
        }

        setStatus('idle');
        return audioData;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error(`Error in stop(): ${errorMessage}`);
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
      setStatus('idle');
      return null;
    }
  }, [clearError, useVad]);

  // Cancel recording - reset state without triggering callbacks
  const cancel = useCallback((): void => {
    log.debug('cancel() called, resetting recorder state');
    setStatus('idle');
    setError(null);
    // Don't trigger any callbacks - just reset state
  }, []);

  // Keep lastAudioData in ref for convertToWavFormat
  const lastAudioDataRef = useRef(lastAudioData);
  useEffect(() => {
    lastAudioDataRef.current = lastAudioData;
  }, [lastAudioData]);

  const convertToWavFormat = useCallback(async (sampleRate: number = 16000): Promise<Blob | null> => {
    log.debug(`convertToWavFormat called, lastAudioData: ${lastAudioDataRef.current ? 'exists' : 'null'}`);
    if (!lastAudioDataRef.current) {
      log.warn('No audio data to convert');
      return null;
    }

    try {
      log.debug(`Calling convertToWav with blob size: ${lastAudioDataRef.current.blob.size}`);
      const wavBlob = await convertToWav(lastAudioDataRef.current.blob, sampleRate);
      log.debug(`convertToWav completed, result size: ${wavBlob.size}`);
      return wavBlob;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error(`Failed to convert to WAV: ${errorMessage}`);
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
      return null;
    }
  }, []);

  return {
    status,
    isRecording,
    start,
    stop,
    cancel,
    lastAudioData,
    error,
    clearError,
    convertToWav: convertToWavFormat,
  };
}

export default useRecorder;
