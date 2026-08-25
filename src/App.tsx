import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from './utils/tauri';
import type { AppConfig, Scene, FloatPanelState, HistoryRecord, LlmProfile, Model, LlmErrorPayload } from './types';
import { getFullModelId } from './types';
import ModelConfigPanel from './components/ModelConfigPanel';
import MemoryPanel from './components/MemoryPanel';
import HomePanel from './components/HomePanel';
import { SettingsShortcut, SettingsSystem, SettingsAbout, SettingsDictionary } from './components/settings';
import AboutMenu from './components/AboutMenu';
import { useToast } from './components/ui/Toast';
import { loadConfig, saveConfig } from './services/config';
import { subscribeToDownloadProgress, subscribeToDownloadComplete, subscribeToDownloadError, subscribeToDownloadCancelled, cancelModelDownload, type DownloadProgress } from './services/downloader';
  import { updateTrayMenu } from './services/tray';
import { useSceneShortcuts } from './hooks/useShortcut';
import { useRecorder } from './hooks/useRecorder';
import MemoryErrorDialog from './components/MemoryErrorDialog';
import {
  recordPerformance,
  initPerformanceCache,
  initLlmPerformanceCache,
  reloadLlmCacheFromBackend,
  estimateTranscribeTime,
  estimateLlmTime,
  logOverallPerformance,
  getAllStats,
} from './services/performance';
import { typeTextSafe } from './services/keyboard';
import { showFloatPanel, hideFloatPanel } from './services/floatPanel';
import { addHistoryRecord, loadHistory, clearHistory } from './services/history';
import { checkModelExists } from './services/downloader';
import { processTextForSceneWithProgress, getLlmProfile } from './services/llm';
import { preinitAudioCapture, checkMicrophonePermission, requestMicrophonePermission } from './services/audio';
import { createLogger } from './services/log';
import { translateSceneName, countWords } from './utils/i18n';
import { checkForUpdates, getUpdateState } from './services/updater';
import UpdateDialog from './components/UpdateDialog';
import PermissionModal from './components/PermissionModal';
import DownloadErrorDialog from './components/DownloadErrorDialog';
import type { RemoteVersionInfo } from './types/updater';
import { eventManager } from './services/eventManager';

// 创建日志记录器
const log = createLogger('App');

// 初始化性能缓存（从后端加载）
initPerformanceCache().catch((e) => log.error(`Failed to init performance cache: ${e}`));
initLlmPerformanceCache().catch((e) => log.error(`Failed to init LLM performance cache: ${e}`));

// Logo Component
const LogoIcon = ({ className = 'w-7 h-7' }: { className?: string }) => (
  <img src="/logo.png" alt="Voconly" className={className} />
);

// Navigation icons
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const MemoryIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3.5v3m6-3v3M4 9h3m10 0h3M9 17.5v3m6-3v3M4 15h3m10 0h3M9 12h.01M15 12h.01M12 9h.01M12 15h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
  </svg>
);

const ModelIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const DictionaryIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

type NavItem = {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  { id: 'home', labelKey: 'nav.home', icon: <HomeIcon /> },
  { id: 'memory', labelKey: 'nav.memory', icon: <MemoryIcon /> },
  { id: 'models', labelKey: 'nav.models', icon: <ModelIcon /> },
  { id: 'dictionary', labelKey: 'nav.dictionary', icon: <DictionaryIcon /> },
  { id: 'settings', labelKey: 'nav.settings', icon: <SettingsIcon /> },
];

type SettingsTab = 'shortcut' | 'system' | 'about';

function App() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [activeNav, setActiveNav] = useState('home');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('shortcut');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // Model download dialog state
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [pendingModelName, setPendingModelName] = useState<string>('');

  // Global download state (persists across tab switches)
  const [downloadStates, setDownloadStates] = useState<Record<string, { downloading: boolean; progress?: DownloadProgress }>>({});

  // Update dialog state
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateVersionInfo, setUpdateVersionInfo] = useState<RemoteVersionInfo | null>(null);

  // Permission modal state
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);

  // Download error dialog state
  const [showDownloadErrorDialog, setShowDownloadErrorDialog] = useState(false);
  const [downloadErrorInfo, setDownloadErrorInfo] = useState<{ modelId: string; modelName: string; error: string } | null>(null);

  // Memory error dialog state
  const [memoryError, setMemoryError] = useState<{
    visible: boolean;
    modelName: string;
    requiredMemory: string;
    availableMemory: string;
  }>({
    visible: false,
    modelName: '',
    requiredMemory: '',
    availableMemory: '',
  });

  // Trigger model selection from App.tsx (used when download fails and user wants to select other model)
  const [triggerSelectModelSceneId, setTriggerSelectModelSceneId] = useState<string | null>(null);

  // Check microphone permission - called after tutorial is complete or if tutorial was already completed
  const checkMicPermission = useCallback(async () => {
    if (permissionChecked) return; // Already checked

    try {
      const state = await checkMicrophonePermission();
      log.info(`Microphone permission state: ${state}`);

      if (state === 'prompt') {
        // First time - request permission directly (system will show its own dialog)
        const granted = await requestMicrophonePermission();
        if (!granted) {
          // User denied - show our guidance modal
          setShowPermissionModal(true);
        }
      } else if (state === 'denied') {
        // Previously denied - show guidance modal
        setShowPermissionModal(true);
      }
      // 'granted' - nothing to do
      setPermissionChecked(true);
    } catch (error) {
      log.error(`Permission check failed: ${error}`);
    }
  }, [permissionChecked]);

  // Check permission when config is loaded and tutorial is already completed
  useEffect(() => {
    if (config?.tutorialCompleted === true && !permissionChecked) {
      // Tutorial was already completed, check permission now
      checkMicPermission();
    }
  }, [config?.tutorialCompleted, permissionChecked, checkMicPermission]);

  // Check for updates on startup
  useEffect(() => {
    const checkUpdatesOnStartup = async () => {
      try {
        // Delay 3 seconds to not block startup
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check user's setting
        const appConfig = await loadConfig();
        if (!appConfig.checkUpdates) {
          return;
        }

        // Check remind limit
        const state = await getUpdateState();
        const today = new Date().toISOString().split('T')[0];
        if (state.lastCheckDate === today && state.remindCountToday >= 3) {
          return;
        }

        // Check for updates
        const result = await checkForUpdates();

        if (result.hasUpdate && result.versionInfo) {
          setUpdateVersionInfo(result.versionInfo);
          setHasUpdate(true);
        }

        // If there's a pending downloaded update, mark as has update
        if (state.downloadComplete && state.downloadedFile) {
          const result = await checkForUpdates();
          if (result.versionInfo) {
            setUpdateVersionInfo(result.versionInfo);
            setHasUpdate(true);
          }
        }
      } catch (error) {
        // Silent fail on startup check
        log.error('Startup update check failed: ' + String(error));
      }
    };

    checkUpdatesOnStartup();
  }, []);

  // Keep a ref to the recorder for use in callbacks (avoids closure stale state)
  const recorderRef = useRef<ReturnType<typeof useRecorder> | null>(null);

  // Keep currentScene in a ref for use in callbacks
  const currentSceneRef = useRef<Scene | null>(null);
  // 双击跳过 LLM 标记
  const skipLlmRef = useRef<boolean>(false);

  // Listen for tray navigation events
  useEffect(() => {
    const unlistenRef = { current: null as (() => void) | null };
    let mounted = true;

    import('@tauri-apps/api/event').then(({ listen }) => {
      if (!mounted) return;
      listen<string>('navigate-to', (event) => {
        const target = event.payload;
        if (target === 'settings') {
          setActiveNav('settings');
          setSettingsTab('shortcut');
        }
      }).then(fn => {
        if (mounted) {
          unlistenRef.current = fn;
        } else {
          fn(); // 如果已 unmount，立即取消监听
        }
      });
    });

    return () => {
      mounted = false;
      unlistenRef.current?.();
    };
  }, []);

  // Listen for recording cancelled event from float panel
  useEffect(() => {
    const unlistenRef = { current: null as (() => void) | null };
    let mounted = true;

    import('@tauri-apps/api/event').then(({ listen }) => {
      if (!mounted) return;
      listen<void>('recording-cancelled', () => {
        log.debug('Recording cancelled event received from float panel');
        // Reset recorder state to idle
        if (recorderRef.current) {
          recorderRef.current.cancel();
          log.debug('Recorder state reset via cancel()');
        }
        // Also reset the shortcut processing flag
        isProcessingShortcutRef.current = false;
        // 清空分段转录相关的缓存
        isSegmentTranscribeActiveRef.current = false;
        streamingTextRef.current = '';
        log.debug('Cleared segment transcription buffers on cancel');
        // 注：ESC 取消快捷键在 esc-cancel-triggered 监听器中统一注销，此处不再重复调用
      }).then(fn => {
        if (mounted) {
          unlistenRef.current = fn;
        } else {
          fn(); // 如果已 unmount，立即取消监听
        }
      });
    });

    return () => {
      mounted = false;
      unlistenRef.current?.();
    };
  }, []);

  // Listen for ESC cancel triggered event (global shortcut)
  useEffect(() => {
    const unlistenRef = { current: null as (() => void) | null };
    let mounted = true;

    import('@tauri-apps/api/event').then(({ listen }) => {
      if (!mounted) return;
      listen<void>('esc-cancel-triggered', async () => {
        log.debug('[ESC] ESC cancel triggered event received');
        // 调用后端取消录音
        try {
          await invoke('cancel_recording');
          log.debug('[ESC] Backend cancel_recording called successfully');
        } catch (err) {
          log.error(`[ESC] Failed to cancel recording: ${err}`);
        }
        // 重置 recorder 状态
        if (recorderRef.current) {
          recorderRef.current.cancel();
          log.debug('[ESC] Recorder state reset');
        }
        // 重置快捷键处理标记
        isProcessingShortcutRef.current = false;
        // 清空分段转录缓存
        isSegmentTranscribeActiveRef.current = false;
        streamingTextRef.current = '';
        log.debug('[ESC] Cleared segment transcription buffers');
        // 隐藏 float panel
        try {
          await hideFloatPanel('esc-cancel');
          log.debug('[ESC] Float panel hidden');
        } catch (err) {
          log.error(`[ESC] Failed to hide float panel: ${err}`);
        }
        // 注销 ESC 取消快捷键（录音已取消，不再需要监听）
        // 使用 await 确保注销完成，避免与 workflow 的 finally 块并发冲突
        try {
          await invoke('unregister_esc_cancel');
          log.debug('[ESC] ESC cancel shortcut unregistered');
        } catch (err) {
          log.error(`[ESC] Failed to unregister ESC cancel: ${err}`);
        }
      }).then(fn => {
        if (mounted) {
          unlistenRef.current = fn;
        } else {
          fn(); // 如果已 unmount，立即取消监听
        }
      });
    });

    return () => {
      mounted = false;
      unlistenRef.current?.();
    };
  }, [hideFloatPanel]);

  // Reload config when switching to models page to refresh download status
  useEffect(() => {
    if (activeNav === 'models' || activeNav === 'home') {
      loadConfig()
        .then(cfg => setConfig(cfg))
        .catch(err => log.error(`Failed to reload config: ${err}`));
    }
  }, [activeNav]);

  // Subscribe to download events globally (persists across tab switches)
  useEffect(() => {
    let mounted = true;

    const unlistenProgress = subscribeToDownloadProgress((progress) => {
      if (!mounted) return;
      setDownloadStates(prev => ({
        ...prev,
        [progress.modelId]: { downloading: true, progress }
      }));
    });

    const unlistenComplete = subscribeToDownloadComplete((event) => {
      if (!mounted) return;
      setDownloadStates(prev => {
        const next = { ...prev };
        delete next[event.modelId];
        return next;
      });
      // Reload config to update downloaded status
      loadConfig()
        .then(cfg => setConfig(cfg))
        .catch(err => log.error(`Failed to reload config: ${err}`));
    });

    const unlistenError = subscribeToDownloadError((event) => {
      if (!mounted) return;
      log.error(`Download failed for model ${event.modelId}: ${event.error}`);
      // Clear download state
      setDownloadStates(prev => {
        const next = { ...prev };
        delete next[event.modelId];
        return next;
      });
      // Show error dialog
      const modelName = config?.models?.find(m => m.id === event.modelId)?.name || event.modelId;
      setDownloadErrorInfo({ modelId: event.modelId, modelName, error: event.error });
      setShowDownloadErrorDialog(true);
    });

    const unlistenCancelled = subscribeToDownloadCancelled((event) => {
      if (!mounted) return;
      log.info(`Download cancelled for model ${event.modelId}`);
      // Clear download state
      setDownloadStates(prev => {
        const next = { ...prev };
        delete next[event.modelId];
        return next;
      });
    });

    return () => {
      mounted = false;
      unlistenProgress.then(fn => fn());
      unlistenComplete.then(fn => fn());
      unlistenError.then(fn => fn());
      unlistenCancelled.then(fn => fn());
    };
  }, [config?.models]);

  useEffect(() => {
    // Load config and history, start whisper server in background
    Promise.all([
      loadConfig(),
      loadHistory()
    ])
      .then(async ([cfg, historyData]) => {
        log.info('[启动] loadConfig + loadHistory 完成，进入 .then 回调');
        setConfig(cfg);
        setHistory(historyData);

        // Update tray menu with current scenes (非关键操作，失败不影响主流程)
        try {
          await updateTrayMenu(cfg.scenes);
          log.info('[启动] Tray menu 更新成功');
        } catch (err) {
          log.warn(`[启动] Tray menu 更新失败（非关键错误）: ${err}`);
        }
      })
      .catch((err) => {
        log.error(`Failed to load config: ${err}`);
      })
      .finally(() => {
        setLoading(false);
      });

    // Cleanup on unmount
    return () => {
      // No cleanup needed - model management is handled by Rust ModelManager
    };
  }, []);

  // Recorder hook - must be defined before runVoiceWorkflow
  const recorder = useRecorder({
    maxDuration: config?.maxRecordingDuration ?? 180, // 使用配置中的值，默认为180秒（3分钟）
    deviceId: config?.defaultMicrophone,
    onRecordingStarted: () => {
      // Float panel is already shown by handleShortcutTriggered (optimistic UI)
      // This callback just confirms recording actually started
      log.debug('Recording actually started');
    },
    onRecordingStopped: async (audioData) => {
      log.debug(`onRecordingStopped callback triggered, audioData duration: ${audioData?.duration}`);
      // Recording stopped, now run the transcription workflow
      const scene = currentSceneRef.current;
      log.debug(`currentSceneRef: ${scene ? scene.name : 'null'}`);
      if (scene) {
        await runVoiceWorkflow(scene, audioData);
      } else {
        log.warn('No current scene, skipping workflow');
      }
    },
    onError: (error) => {
      log.error(`Recorder error: ${error}`);
      hideFloatPanelStatus('recorder-error');
    },
  });

  // Keep recorder ref updated for use in callbacks
  recorderRef.current = recorder;

  // Debug: log when recorder state changes
  useEffect(() => {
    log.debug(`Recorder isRecording changed: ${recorder.isRecording}`);
  }, [recorder.isRecording]);

  // Streaming transcription state
  const streamingTextRef = useRef<string>('');
  const isSegmentTranscribeActiveRef = useRef(false); // 分段转录激活状态（录音时为 true）
  const pendingTranscribeDurationRef = useRef<number>(0); // 后端待转录时长（用于进度条预估）

  // 后端分段转录始终开启，无需前端设置 streaming mode

  // Pre-initialize audio capture on app startup to reduce first recording latency
  useEffect(() => {
    if (config !== null) {
      // Pre-initialize audio capture in background after config is loaded
      preinitAudioCapture()
        .then((success) => {
          if (success) {
            log.info('Audio capture pre-initialized, first recording will be faster');
          } else {
            log.warn('Audio capture pre-initialization failed, first recording may have latency');
          }
        })
        .catch((err) => log.error(`Audio capture pre-init error: ${err}`));
    }
  }, [config]);

  // Listen for transcription results (backend handles transcription now)
  useEffect(() => {
    let unlistenResult: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setupListeners = async () => {
      // Listen for transcription results (multiple events)
      unlistenResult = await listen<{ text: string; duration: number }>(
        'transcription-result',
        async (event) => {
          const { text } = event.payload;
          if (text && text.trim()) {
            log.info(`[Streaming] Received transcription: ${text.length} chars`);
            // 文本已在后端追加到 preview_text，前端无需再调用 append_preview_text
          }
        }
      );

      // Listen for transcription errors
      unlistenError = await listen<{ error: string }>(
        'transcription-error',
        async (event) => {
          log.error(`[Streaming] Transcription error: ${event.payload.error}`);
          // 可选：显示错误提示
        }
      );

      // Listen for streaming recording stopped (with pending duration for progress estimation)
      await eventManager.ensureOnce<{ pendingDurationSecs: number }>('streaming-recording-stopped', (event) => {
        log.debug(`Streaming recording stopped, pending_duration: ${event.payload.pendingDurationSecs}s`);
        isSegmentTranscribeActiveRef.current = false;
        pendingTranscribeDurationRef.current = event.payload.pendingDurationSecs;
      });

      log.info('[Streaming] Event listeners registered successfully');
    };

    setupListeners().catch((err) => log.error(`Failed to setup streaming listeners: ${err}`));

    return () => {
      if (unlistenResult) unlistenResult();
      if (unlistenError) unlistenError();
      eventManager.off('streaming-recording-stopped');
    };
  }, []);

  // Show/hide float panel (using global float window)
  const showFloatPanelStatus = useCallback(async (
    status: FloatPanelState['status'],
    sceneName?: string,
    text?: string,
    progressInfo?: Partial<{
      modelId: string;
      device: 'CPU' | 'GPU';
      audioDuration: number;
      isTranscribing: boolean;
      // LLM 进度相关
      llmModelId?: string;
      hasLlmProfile?: boolean;
      textLen?: number;
      // 双击跳过 LLM 标记
      skipLlm?: boolean;
      // 分段转录开关
      segmentTranscribe?: boolean;
    }>
  ) => {
    // Show the global float window
    try {
      // 【关键日志】发送状态到 float panel
      log.debug(`[SEND] status="${status}", isTranscribing=${progressInfo?.isTranscribing}, progressInfo=${JSON.stringify(progressInfo)}`);
      console.trace('[SEND] showFloatPanelStatus call stack');
      await showFloatPanel({
        status,
        sceneName: sceneName,
        text,
        ...progressInfo,
      });
    } catch (err) {
      log.error(`Failed to show float panel: ${err}`);
    }
  }, []);

  const hideFloatPanelStatus = useCallback(async (reason: string = 'unknown') => {
    // Hide the global float window
    try {
      log.debug(`[HIDE] hideFloatPanelStatus called, reason: ${reason}`);
      console.trace('[HIDE] hideFloatPanelStatus call stack');
      await hideFloatPanel(reason);
    } catch (err) {
      log.error(`Failed to hide float panel: ${err}`);
    }
  }, []);

  // Keep track of workflow running state to prevent duplicate runs
  const isWorkflowRunningRef = useRef(false);

  // Complete Talk Free workflow: recording -> transcription -> typing
  const runVoiceWorkflow = useCallback(async (scene: Scene, audioData?: { duration: number } | null) => {
    // Prevent duplicate workflow runs
    if (isWorkflowRunningRef.current) {
      log.debug('VoiceWorkflow already running, skipping duplicate');
      return;
    }
    isWorkflowRunningRef.current = true;
    log.debug(`Starting workflow for scene: ${scene.name}`);

    const sceneName = scene.name;
    let recognizedText = '';

    // Time tracking
    const timings: { step: string; duration: number }[] = [];
    const recordTime = (step: string, startTime: number) => {
      const duration = Date.now() - startTime;
      timings.push({ step, duration });
      log.info(`Timing - ${step}: ${duration}ms`);
      return Date.now();
    };
    let totalStart = Date.now();

    try {
      // Use ref to get current recorder
      const currentRecorder = recorderRef.current;
      log.debug(`Got recorder ref: ${currentRecorder ? 'exists' : 'null'}`);
      log.debug(`audioData from callback: ${JSON.stringify(audioData)}`);

      // Get audio duration for progress estimation
      // 使用后端传递的待转录时长（只预估未完成的部分，而非总时长）
      const audioDuration = pendingTranscribeDurationRef.current || audioData?.duration || 0;
      log.debug(`audioDuration: ${audioDuration} (pendingTranscribe: ${pendingTranscribeDurationRef.current}s)`);
      pendingTranscribeDurationRef.current = 0; // 重置，避免影响下次录音
      const device: 'CPU' | 'GPU' = 'GPU'; // 简化处理，默认使用 GPU

      // 预先检查 LLM profile（用于进度条预估）
      const llmProfile = await getLlmProfile(scene.id);
      const hasLlmProfile = llmProfile !== null && llmProfile.enabled;
      const llmModelId = llmProfile?.model;

      // 获取 skipLlm 标记（双击跳过 LLM）
      const skipLlm = skipLlmRef.current;

      // 【进度条日志】打印用于预估的音频时长
      log.info(`[进度条] audioDuration=${audioDuration}s (pendingTranscribe: ${pendingTranscribeDurationRef.current}s, audioData: ${audioData?.duration}s)`);
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  📊 进度条预估 - 音频时长`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`  待转录时长: ${audioDuration}s`);
      console.log(`${'─'.repeat(60)}`);

      // Step 1: Show "识别中" with spinner and progress info
      const fullModelId = scene.model?.modelId ? getFullModelId(scene.model) : '';
      await showFloatPanelStatus('transcribing', sceneName, undefined, {
        modelId: fullModelId,
        device,
        audioDuration: audioDuration,
        isTranscribing: true,
        hasLlmProfile: hasLlmProfile,
        llmModelId: llmModelId,
        skipLlm: skipLlm,
      });

      // 后端在录音期间已实时处理转录，直接获取预览文本
      let stepStart = Date.now();
      log.info('[Streaming] Getting preview text from backend');

      // 从后端获取预览文本（已在录音期间实时生成）
      recognizedText = await invoke<string>('get_preview_text');
      log.info(`[Streaming] Got preview text from backend, length: ${recognizedText.length}`);

      // 清空追踪数据
      streamingTextRef.current = '';

      stepStart = recordTime('语音识别', stepStart);

      const transcribeTime = (Date.now() - stepStart) / 1000;

      // 收集 ASR 性能数据（用于综合日志）
      const asrStats = getAllStats();
      const asrKey = `${fullModelId}_${device}`;
      const asrEntry = asrStats[asrKey];
      const asrEstimate = estimateTranscribeTime(fullModelId, device, audioDuration);

      // ASR 性能数据
      const performanceData = {
        asrModelId: fullModelId,
        asrDevice: device,
        asrEstimatedTime: asrEstimate.estimatedTime,
        asrActualTime: transcribeTime,
        asrSamples: asrEntry?.samples || 0,
        asrAvgRtf: asrEntry?.avgRtf || asrEstimate.avgRtf,
      };

      // 记录性能数据（更新缓存）
      if (audioDuration > 0 && transcribeTime > 0) {
        recordPerformance(fullModelId, device, audioDuration, transcribeTime);
      }

      if (!recognizedText || recognizedText.trim() === '') {
        log.info('No text recognized');
        await hideFloatPanelStatus('empty-recognition');
        return;
      }

      log.info(`Recognized text: ${recognizedText}`);

      // ASR 完成，如果有 LLM 配置且未双击跳过，发送更新事件通知 FloatPanel
      // 此时 text_len 已确定，可重新精确预估 LLM 时间
      // 双击跳过 LLM 时，不发送此更新（保持"识别中（跳过LLM）"显示）
      if (hasLlmProfile && !skipLlm) {
        const actualTextLen = recognizedText.length;
        log.debug(`[ASR Complete] Sending updated text_len=${actualTextLen} to FloatPanel for LLM time re-estimation`);
        await showFloatPanelStatus('transcribing', sceneName, undefined, {
          modelId: fullModelId,
          device,
          audioDuration: audioDuration,
          isTranscribing: true,
          hasLlmProfile: hasLlmProfile,
          llmModelId: llmModelId,
          textLen: actualTextLen,
          skipLlm: skipLlm,
        });
      }

      // Step 3: Check if LLM is enabled for this scene and process text
      log.debug(`Checking LLM profile for scene: ${scene.id}`);
      stepStart = Date.now();
      const llmStartTime = Date.now();
      // llmProfile 已在上面预先获取
      // 使用带进度版本的命令，进度事件会在 FloatPanelApp 中监听
      let llmResult = { processed: false, text: recognizedText };
      let llmFailed = false; // 标记 LLM 是否失败（API错误等）
      let llmFailedTextTooLong = false; // 标记 LLM 是否因文本过长而跳过

      // 检查是否双击跳过 LLM（skipLlm 已在上面获取）
      const shouldSkipLlm = skipLlm;
      if (shouldSkipLlm) {
        log.info('Double-tap detected, skipping LLM processing');
        // 重置标记
        skipLlmRef.current = false;
      }

      // 只有配置了 LLM 且未双击跳过才调用处理流程
      if (hasLlmProfile && !shouldSkipLlm) {
        try {
          const response = await processTextForSceneWithProgress(scene.id, recognizedText);
          if (response.success) {
            llmResult = { processed: true, text: response.text };
          } else {
            // 检查是否是"文本过长"的特殊错误
            const errorMsg = response.error || '';

            if (errorMsg.startsWith('CONTEXT_TOO_LONG:')) {
              // 提取信息（用于日志）
              const parts = errorMsg.split(':');
              const charCount = parts[1] || 'unknown';
              const maxChars = parts[2] || 'unknown';
              log.info(`LLM skipped: ${charCount} chars > ${maxChars} max_chars`);

              // 标记为文本过长错误
              llmFailedTextTooLong = true;

              // 发送 LLM 跳过事件到 float-panel，让用户知道
              emitTo<LlmErrorPayload>('float-panel', 'llm-error', {
                error: 'CONTEXT_TOO_LONG',
                originalTextOutput: true,
              }).catch((e) => log.error(`Failed to emit llm-error event: ${e}`));

              // 使用后端返回的原文
              llmResult = { processed: false, text: response.text };
            } else {
              // 其他错误，发送错误事件到 float-panel，让用户确认
              log.warn(`LLM not successful: ${errorMsg}`);
              llmFailed = true;

              // 发送 LLM 错误事件到 float-panel 窗口
              emitTo<LlmErrorPayload>('float-panel', 'llm-error', {
                error: errorMsg,
                originalTextOutput: true,
              }).catch((e) => log.error(`Failed to emit llm-error event: ${e}`));

              llmResult = { processed: false, text: recognizedText };
            }
          }
        } catch (error) {
          log.error(`processTextForSceneWithProgress error: ${error}`);
          llmFailed = true;

          // 发送 LLM 错误事件到 float-panel 窗口
          emitTo<LlmErrorPayload>('float-panel', 'llm-error', {
            error: String(error),
            originalTextOutput: true,
          }).catch((e) => log.error(`Failed to emit llm-error event: ${e}`));

          llmResult = { processed: false, text: recognizedText };
        }
      } else {
        // 没有 LLM 配置或双击跳过，使用原文
        if (shouldSkipLlm) {
          log.info('LLM skipped due to double-tap');
        } else {
          log.info('LLM not configured for this scene, skipping');
        }
      }
      let llmPerformanceData: {
        modelId?: string;
        estimatedTime?: number;
        actualTime?: number;
        samples?: number;
        avgTimePerChar?: number;
      } = {};

      if (llmResult.processed) {
        const llmActualTime = (Date.now() - llmStartTime) / 1000;
        log.debug(`LLM processed text: ${llmResult.text}`);
        recognizedText = llmResult.text;
        stepStart = recordTime('LLM 后处理', stepStart);

        // 收集 LLM 性能数据
        if (llmProfile?.model) {
          const textLen = recognizedText.length;
          const llmEstimate = estimateLlmTime(llmProfile.model, textLen);

          llmPerformanceData = {
            modelId: llmProfile.model,
            estimatedTime: llmEstimate.estimatedTime,
            actualTime: llmActualTime,
            samples: llmEstimate.samples,  // 使用预估返回的 samples
            avgTimePerChar: llmEstimate.avgTimeMs / 1000,  // 转换为秒
          };
        }

        // LLM 处理完成后，重新加载前端缓存以获取最新的性能数据
        reloadLlmCacheFromBackend().catch((e) => log.error(`Failed to reload LLM cache: ${e}`));
      } else {
        log.debug('LLM not processed, using original text');
      }

      // 打印综合性能对比日志
      logOverallPerformance({
        ...performanceData,
        llmModelId: llmPerformanceData.modelId,
        llmEstimatedTime: llmPerformanceData.estimatedTime,
        llmActualTime: llmPerformanceData.actualTime,
        llmSamples: llmPerformanceData.samples,
        llmAvgTimePerChar: llmPerformanceData.avgTimePerChar,
      });

      // Step 4: Hide pill panel (only if LLM succeeded or was not enabled)
      // 如果 LLM 失败或文本过长，药丸会显示错误状态等待用户确认，这里不隐藏
      if (!llmFailed && !llmFailedTextTooLong) {
        // 等待进度条动画完成（让用户看到100%后再隐藏，动画时长200ms + 缓冲）
        await new Promise(resolve => setTimeout(resolve, 250));
        await hideFloatPanelStatus('workflow-complete');
      }

      // 如果 LLM 失败或文本过长，先输出原文，药丸保持显示错误状态等待用户确认
      if (llmFailed || llmFailedTextTooLong) {
        // 输出原文（fallback）
        const result = await typeTextSafe(recognizedText);
        if (result.success) {
          log.info('[LLM Failed] Original text inserted successfully');
        } else {
          log.error(`[LLM Failed] Text insertion failed: ${result.error}`);
        }

        // 历史记录保存
        const currentRecorder = recorderRef.current;
        const duration = currentRecorder?.lastAudioData?.duration || 0;
        const wordCount = countWords(recognizedText);  // 智能统计：中文按字，英文按词
        const newRecord = await addHistoryRecord({
          timestamp: Date.now(),
          content: recognizedText,
          duration: Math.round(duration),
          wordCount,
        });
        setHistory(prev => [newRecord, ...prev]);
        log.debug(`Saved to history: ${JSON.stringify(newRecord)}`);

        // 结束处理流程，药丸保持显示错误状态
        return;
      }

      // Small delay to ensure panel is hidden before showing text
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 5: Type the text using keyboard simulation
      // 分段转录模式：从预览窗口获取累积文字
      stepStart = Date.now();

      // 从后端获取累积的预览文字
      log.info('[Segment Transcribe] Getting preview text from backend...');
      const previewText = await invoke<string>('get_preview_text');
      log.info(`[Segment Transcribe] Got preview text: ${previewText.length} chars`);

      // 清空预览窗口
      await invoke('clear_preview_text');

      // 使用预览文字作为 recognizedText（用于历史记录）
      recognizedText = previewText;

      if (llmResult.processed && llmResult.text) {
        // 有 LLM：仅输出 LLM 结果（不输出预览原文）
        log.info(`[Segment Transcribe] LLM processed, outputting only LLM result: "${llmResult.text}"`);
        const result = await typeTextSafe(llmResult.text);
        if (result.success) {
          log.info('[Segment Transcribe] LLM text inserted successfully');
        } else {
          log.error(`[Segment Transcribe] LLM text insertion failed: ${result.error}`);
          // LLM 失败时 fallback：输出预览原文
          log.info('[Segment Transcribe] Fallback: outputting preview text instead');
          const fallbackResult = await typeTextSafe(previewText);
          if (!fallbackResult.success) {
            log.error(`[Segment Transcribe] Fallback insertion also failed: ${fallbackResult.error}`);
          }
        }
      } else {
        // 无 LLM：直接输出预览原文
        log.info(`[Segment Transcribe] No LLM, outputting preview text: "${previewText}"`);
        const result = await typeTextSafe(previewText);
        if (result.success) {
          log.info('[Segment Transcribe] Preview text inserted successfully');
        } else {
          log.error(`[Segment Transcribe] Preview text insertion failed: ${result.error}`);
        }
      }

      // 历史记录保存（根据是否有 LLM 处理决定保存内容）
      const duration = recorderRef.current?.lastAudioData?.duration || 0;
      // 如果 LLM 处理成功，保存 LLM 结果；否则保存原始识别文本
      const historyContent = llmResult.processed && llmResult.text ? llmResult.text : previewText;
      const wordCount = countWords(historyContent);  // 智能统计：中文按字，英文按词
      const newRecord = await addHistoryRecord({
        timestamp: Date.now(),
        content: historyContent,
        duration: Math.round(duration),
        wordCount,
      });
      stepStart = recordTime('历史记录保存', stepStart);
      setHistory(prev => [newRecord, ...prev]);
      log.debug(`Saved to history: ${JSON.stringify(newRecord)}`);

      // Print timing summary
      const totalDuration = Date.now() - totalStart;
      log.info('===== 性能统计 =====');
      timings.forEach(t => log.info(`  ${t.step}: ${t.duration}ms`));
      log.info(`总耗时: ${totalDuration}ms`);
      log.info('====================');

    } catch (error) {
      const errorMsg = String(error);
      log.error(`Voice workflow error: ${error}`);

      // 检查是否是内存不足错误
      if (errorMsg.includes('MEMORY_INSUFFICIENT')) {
        const scene = currentSceneRef.current;
        if (scene) {
          const model = config?.models?.find(m => m.id === scene.model?.modelId);
          const modelName = model?.name || scene.model?.modelId || '';
          const memoryMatch = errorMsg.match(/需要约 (\d+MB).*可用 (\d+MB)/);
          const requiredMemory = memoryMatch?.[1] || '未知';
          const availableMemory = memoryMatch?.[2] || '未知';

          setMemoryError({
            visible: true,
            modelName,
            requiredMemory,
            availableMemory,
          });
        }
      }

      await hideFloatPanelStatus('workflow-error');
    } finally {
      // 注销 ESC 取消快捷键（录音流程结束）
      // 作为兜底，如果 ESC 监听器已注销，后端会跳过
      try {
        await invoke('unregister_esc_cancel');
        log.debug('ESC cancel shortcut unregistered after workflow');
      } catch (err) {
        log.error(`Failed to unregister ESC cancel after workflow: ${err}`);
      }
      isWorkflowRunningRef.current = false;
      log.debug('Workflow completed');
    }
  }, [showFloatPanelStatus, hideFloatPanelStatus, config]);

  // Keep track of shortcut processing state
  const isProcessingShortcutRef = useRef(false);

  // Handle shortcut triggered - start/stop recording
  const handleShortcutTriggered = useCallback(async (sceneId: string, skipLlm: boolean) => {
    // Prevent duplicate shortcut processing
    if (isProcessingShortcutRef.current) {
      log.warn('[HANDLE_SHORTCUT] Shortcut already processing, ignoring duplicate');
      return;
    }
    isProcessingShortcutRef.current = true;

    log.info(`[HANDLE_SHORTCUT] Processing shortcut, sceneId: ${sceneId}, skipLlm: ${skipLlm}`);

    const scene = config?.scenes.find(s => s.id === sceneId);
    if (!scene) {
      log.error(`Scene not found: ${sceneId}`);
      isProcessingShortcutRef.current = false;
      return;
    }

    const fullModelId = scene.model?.modelId ? getFullModelId(scene.model) : '';
    const model = config?.models?.find(m => m.id === scene.model?.modelId);

    // Check if model is currently downloading
    if (downloadStates[fullModelId]?.downloading) {
      showToast({
        type: 'info',
        title: t('toast.modelDownloading', { name: model?.name || scene.model?.modelId }),
      });
      isProcessingShortcutRef.current = false;
      return;
    }

    // Check if model is downloaded
    const modelDownloaded = await checkModelExists(fullModelId);
    if (!modelDownloaded) {
      // Show dialog asking user if they want to download
      setPendingModelId(scene.model?.modelId ?? '');
      setPendingModelName(model?.name || scene.model?.modelId || '');
      setShowModelDialog(true);
      isProcessingShortcutRef.current = false;
      return;
    }

    // Update ref for use in callbacks
    currentSceneRef.current = scene;
    // 存储 skipLlm 标记，用于 workflow 中判断
    skipLlmRef.current = skipLlm;

    // Use ref to get current recorder state (avoids closure stale state)
    const currentRecorder = recorderRef.current;
    if (!currentRecorder) {
      log.error('[HANDLE_SHORTCUT] recorderRef.current is null');
      isProcessingShortcutRef.current = false;
      return;
    }

    log.info(`[HANDLE_SHORTCUT] currentRecorder.isRecording: ${currentRecorder.isRecording}`);

    // Toggle recording: if not recording, start; if recording, stop
    if (currentRecorder.isRecording) {
      log.info('[HANDLE_SHORTCUT] Stopping recording with optimistic UI...');
      // 1. Immediately show "transcribing" UI (Optimistic UI)
      // 传入基本的 progressInfo 确保进度条能正确初始化，后续 workflow 会更新精确预估
      showFloatPanelStatus('transcribing', translateSceneName(scene.name, t), undefined, {
        modelId: fullModelId,
        device: 'GPU',
        audioDuration: 0,
        isTranscribing: true,
        skipLlm: skipLlm,
      });

      // 2. Then async stop recording (workflow will update detailed progress info)
      // Note: 防抖定时器(<100ms)的同步可能未完成，接受此风险
      log.info('[HANDLE_SHORTCUT] About to call currentRecorder.stop()...');
      try {
        await currentRecorder.stop();
        log.info('[HANDLE_SHORTCUT] stop() completed successfully');
      } catch (error) {
        log.error(`[HANDLE_SHORTCUT] stop() failed with error: ${error}`);
      }
    } else {
      log.info('[HANDLE_SHORTCUT] Starting recording with optimistic UI...');
      // 1. Immediately show float panel (Optimistic UI)
      // 【修复】传入配置中的 segment_transcribe 值,确保状态指示器正确显示
      showFloatPanelStatus('recording', translateSceneName(scene.name, t), undefined, {
        segmentTranscribe: config?.segmentTranscribe ?? true,  // 使用配置值,默认 true
      });

      // 分段转录始终开启：初始化分段转录状态
      isSegmentTranscribeActiveRef.current = true;
      streamingTextRef.current = '';
      // 开始录音时重置 skipLlm 标记
      skipLlmRef.current = false;
      log.info('[Streaming] Segment transcription ENABLED for this session (always active)');

      // 2. Then start recording
      const success = await currentRecorder.start(scene.id);
      if (success) {
        // 3. 注册 ESC 取消快捷键（录音成功后）
        invoke('register_esc_cancel')
          .then(() => log.debug('ESC cancel shortcut registered'))
          .catch((err) => log.error(`Failed to register ESC cancel: ${err}`));
      } else {
        // 录音失败，隐藏面板
        log.error('Failed to start recording');
        hideFloatPanelStatus('recording-start-failed');
      }
    }

    log.debug('Resetting isProcessingShortcutRef to false');
    isProcessingShortcutRef.current = false;
  }, [config?.scenes, config?.models, downloadStates, showToast, t, showFloatPanelStatus, hideFloatPanelStatus]); // 分段转录始终开启，不依赖配置

  // Register shortcuts for all scenes
  const { registerShortcutWithResult } = useSceneShortcuts(config?.scenes || [], handleShortcutTriggered);

  // Check for shortcut conflict with existing scenes
  const checkShortcutConflict = useCallback((shortcut: string, excludeSceneId?: string): string | null => {
    if (!config?.scenes) return null;

    const scenes = config.scenes;
    const conflict = scenes.find(
      (s) => s.shortcut === shortcut && s.id !== excludeSceneId && s.enabled
    );

    if (conflict) {
      return t('home.shortcutConflict', { shortcut, scene: conflict.name });
    }
    return null;
  }, [config?.scenes]);

  const handleDownload = async (model: Model) => {
    log.debug(`Download model: ${model.id}, type: ${model.modelType}`);
    // Start download state
    setDownloadStates(prev => ({
      ...prev,
      [model.id]: { downloading: true, progress: undefined }
    }));

    // Trigger download via service - unified for both ASR and LLM
    try {
      const { downloadModelWithSource, isChineseLanguage } = await import('./services/downloader');

      if (model.downloadUrls && model.downloadUrls.length > 0) {
        // Unified download - backend automatically detects path based on model_id/URL
        const preferChina = isChineseLanguage();
        log.info(`Downloading ${model.id}, preferChina: ${preferChina}, sources: ${JSON.stringify(model.downloadUrls)}`);
        await downloadModelWithSource(model.id, model.downloadUrls, undefined, preferChina);
      } else {
        // Fallback to old method for models without downloadUrls
        const { downloadModel } = await import('./services/downloader');
        await downloadModel(model.id);
      }
    } catch (err) {
      log.error(`Download failed: ${err}`);
      setDownloadStates(prev => {
        const next = { ...prev };
        delete next[model.id];
        return next;
      });
    }
  };

  const handleSaveScenes = async (scenes: Scene[]) => {
    // 先重新加载配置，确保 user_dictionary 等独立保存的数据是最新的
    const latestConfig = await loadConfig();
    const newConfig = { ...latestConfig, scenes };
    setConfig(newConfig);
    await saveConfig(newConfig);
    log.debug('Config saved');
    // Update tray menu with new scenes
    await updateTrayMenu(scenes);
  };

  // Handle LLM profile save - update local config state
  const handleLlmProfileSave = (profile: LlmProfile) => {
    if (!config) return;
    log.debug(`LLM profile saved: ${JSON.stringify(profile, null, 2)}`);

    // Update llm_profiles in config
    const existingIndex = config.llmProfiles?.findIndex(p => p.sceneId === profile.sceneId) ?? -1;
    let newProfiles: LlmProfile[];

    if (existingIndex >= 0 && config.llmProfiles) {
      // Update existing profile
      newProfiles = [...config.llmProfiles];
      newProfiles[existingIndex] = profile;
    } else {
      // Add new profile
      newProfiles = [...(config.llmProfiles || []), profile];
    }

    const newConfig = { ...config, llmProfiles: newProfiles };
    setConfig(newConfig);
  };

  // Handle models change - update local config state
  const handleModelsChange = (models: Model[]) => {
    if (!config) return;
    const newConfig = { ...config, models };
    setConfig(newConfig);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex">
        {/* Sidebar */}
        <aside className="w-[180px] bg-white border-r border-gray-100 flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center px-5">
            <div className="mr-2.5">
              <LogoIcon />
            </div>
            <span className="font-semibold text-gray-900">Voconly</span>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500">{t('app.loading')}</p>
          </div>
        </main>
      </div>
    );
  }

  // TitleBar Component
  const TitleBar = () => {
    const handleMinimize = async () => {
      const window = getCurrentWindow();
      await window.minimize();
    };

    const handleMaximize = async () => {
      const window = getCurrentWindow();
      const isMaximized = await window.isMaximized();
      if (isMaximized) {
        await window.unmaximize();
      } else {
        await window.maximize();
      }
    };

    const handleClose = async () => {
      const window = getCurrentWindow();
      await window.close();
    };

    return (
      <div
        className="h-9 bg-[#F5F5F7] flex items-center justify-between select-none"
        data-tauri-drag-region
      >
        <div className="flex-1 flex items-center gap-2 px-4" data-tauri-drag-region>
          <LogoIcon className="w-5 h-5 text-gray-700" />
          <span className="text-sm text-gray-700 font-medium">Voconly</span>
          {/* Update indicator */}
          {hasUpdate && (
            <button
              onClick={() => setShowUpdateDialog(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
              title={t('update.newVersionAvailable')}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs text-emerald-600 font-medium">{t('update.newVersionBadge')}</span>
            </button>
          )}
        </div>
        <div className="flex items-center">
          <button
            onClick={handleMinimize}
            className="w-12 h-9 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={handleMaximize}
            className="w-12 h-9 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button
            onClick={handleClose}
            className="w-12 h-9 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  // Render sidebar navigation
  const renderSidebar = () => (
    <aside className="w-[180px] bg-[#F5F5F7] flex flex-col overflow-hidden">
      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeNav === item.id
                ? 'bg-gray-200 text-gray-900'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className={activeNav === item.id ? 'text-gray-900' : 'text-gray-500'}>
              {item.icon}
            </span>
            {t(item.labelKey)}
          </button>
        ))}
      </nav>

      {/* User Menu */}
      <div className="p-3 border-t border-gray-100">
        <AboutMenu />
      </div>
    </aside>
  );

  // Render settings tabs
  const renderSettingsTabs = () => {
    const tabs: { id: SettingsTab; labelKey: string }[] = [
      { id: 'shortcut', labelKey: 'settings.tabs.shortcut' },
      { id: 'system', labelKey: 'settings.tabs.system' },
      { id: 'about', labelKey: 'settings.tabs.about' },
    ];

    return (
      <div className="flex justify-center mb-8">
        <div className="inline-flex bg-gray-100/80 p-1 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSettingsTab(tab.id)}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                settingsTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-[#F5F5F7] flex flex-col overflow-hidden">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {renderSidebar()}

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="w-full h-full">
          {/* Settings Tabs */}
          {activeNav === 'settings' && renderSettingsTabs()}

          {/* Content Area */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-fade-in">
            {activeNav === 'models' && (
              <ModelConfigPanel
                downloadStates={downloadStates}
                onDownload={handleDownload}
                onDownloadCancel={(modelId) => {
                  log.info(`Download cancel requested for ${modelId}`);
                  // The actual cancellation is handled by the component
                  // This callback is for any additional cleanup if needed
                }}
                onAsrModelSelect={(modelId) => {
                  log.info(`Selected ASR model: ${modelId}`);
                }}
                onConfigUpdate={async () => {
                  // Reload config from file to sync custom_asr_model_dirs
                  const latestConfig = await loadConfig();
                  setConfig(latestConfig);
                  log.info('Config reloaded after custom dir update');
                }}
              />
            )}
            {activeNav === 'settings' && settingsTab === 'shortcut' && (
              <SettingsShortcut
                scenes={config?.scenes || []}
                models={config?.models || []}
                llmProfiles={config?.llmProfiles || []}
                onSave={handleSaveScenes}
                checkConflict={checkShortcutConflict}
                tryRegisterShortcut={registerShortcutWithResult}
                downloadStates={downloadStates}
                onDownload={handleDownload}
                onDownloadCancel={(modelId) => {
                  log.info(`Cancel download: ${modelId}`);
                  cancelModelDownload(modelId);
                  setDownloadStates(prev => {
                    const next = { ...prev };
                    delete next[modelId];
                    return next;
                  });
                }}
              />
            )}
            {activeNav === 'settings' && settingsTab === 'system' && config && (
              <SettingsSystem
                config={config}
                onSave={async (newConfig) => {
                  // 先重新加载配置，确保 user_dictionary 等独立保存的数据是最新的
                  const latestConfig = await loadConfig();
                  const mergedConfig = { ...latestConfig, ...newConfig };
                  setConfig(mergedConfig);
                  await saveConfig(mergedConfig);
                }}
              />
            )}
            {activeNav === 'settings' && settingsTab === 'about' && (
              <SettingsAbout
                onUpdateAvailable={(versionInfo) => {
                  setUpdateVersionInfo(versionInfo);
                  setHasUpdate(true);
                }}
              />
            )}
            {activeNav === 'dictionary' && (
              <SettingsDictionary />
            )}
            {/* Keep HomePanel always mounted to preserve state on tab switch */}
            <div className={activeNav === 'home' ? '' : 'hidden'}>
              <HomePanel
                scenes={config?.scenes || []}
                models={config?.models || []}
                llmProfiles={config?.llmProfiles || []}
                modelLanguagePrefs={config?.modelLanguagePrefs || {}}
                downloadStates={downloadStates}
                onDownload={handleDownload}
                onSave={handleSaveScenes}
                onModelsChange={handleModelsChange}
                onModelLanguagePrefsChange={(prefs) => {
                  // 【修复】重新加载配置，确保使用最新的 scenes 数据
                  // 原因：config 状态可能是旧的（React 状态更新是异步的）
                  loadConfig()
                    .then((latestConfig) => {
                      const newConfig = { ...latestConfig, modelLanguagePrefs: prefs };
                      setConfig(newConfig);
                      saveConfig(newConfig);
                    })
                    .catch((err) => log.error(`Failed to reload config: ${err}`));
                }}
                onLlmProfileSave={handleLlmProfileSave}
                tutorialCompleted={config?.tutorialCompleted}
                onTutorialComplete={async () => {
                  if (config) {
                    const newConfig = { ...config, tutorialCompleted: true };
                    setConfig(newConfig);
                    await saveConfig(newConfig);
                    // After tutorial completes, check microphone permission
                    checkMicPermission();
                  }
                }}
                tryRegisterShortcut={registerShortcutWithResult}
                triggerSelectModelSceneId={triggerSelectModelSceneId}
                onTriggerSelectModelCleared={() => setTriggerSelectModelSceneId(null)}
              />
            </div>
            {activeNav === 'memory' && (
              <MemoryPanel
                records={history}
                onClear={async () => {
                  await clearHistory();
                  setHistory([]);
                }}
              />
            )}
          </div>
        </div>
      </main>

      {/* Model download confirmation dialog */}
      {showModelDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[360px]">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('dialog.modelNotDownloaded')}</h3>
            <p className="text-sm text-gray-600 mb-6">
              {t('dialog.modelNotDownloadedDesc', { name: pendingModelName })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModelDialog(false);
                  setPendingModelId(null);
                  setPendingModelName('');
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {t('dialog.cancel')}
              </button>
              <button
                onClick={() => {
                  // Find model info and trigger download directly
                  const model = config?.models?.find(m => m.id === pendingModelId);
                  if (model && model.downloadUrls && model.downloadUrls.length > 0) {
                    handleDownload(model);
                  }
                  setShowModelDialog(false);
                  setPendingModelId(null);
                  setPendingModelName('');
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
              >
                {t('dialog.download')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Dialog */}
      {showUpdateDialog && updateVersionInfo && (
        <UpdateDialog
          isOpen={showUpdateDialog}
          onClose={() => setShowUpdateDialog(false)}
          versionInfo={updateVersionInfo}
        />
      )}

      {/* Permission Modal */}
      <PermissionModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onGranted={() => {
          log.info('Permission granted via modal');
          setShowPermissionModal(false);
        }}
      />

      {/* Download Error Dialog */}
      <DownloadErrorDialog
        visible={showDownloadErrorDialog && downloadErrorInfo !== null}
        modelName={downloadErrorInfo?.modelName || ''}
        onRetry={() => {
          const model = config?.models?.find(m => m.id === downloadErrorInfo?.modelId);
          if (model) handleDownload(model);
        }}
        onSelectOther={() => {
          // Find the scene that uses this model and trigger model selection dialog
          const scene = config?.scenes?.find(s => s.model?.modelId === downloadErrorInfo?.modelId);
          if (scene) {
            // Switch to home tab first, then trigger model selection
            setActiveNav('home');
            setTriggerSelectModelSceneId(scene.id);
          } else {
            // No scene uses this model, go to models tab
            setActiveNav('models');
          }
        }}
        onClose={() => {
          setShowDownloadErrorDialog(false);
          setDownloadErrorInfo(null);
        }}
      />

      {/* Memory Error Dialog */}
      <MemoryErrorDialog
        visible={memoryError.visible}
        modelName={memoryError.modelName}
        requiredMemory={memoryError.requiredMemory}
        availableMemory={memoryError.availableMemory}
        onClose={() => {
          setMemoryError(prev => ({ ...prev, visible: false }));
        }}
      />
      </div>
    </div>
  );
}

export default App