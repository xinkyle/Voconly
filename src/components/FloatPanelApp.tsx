import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { listen, invoke } from '../utils/tauri';
import { subscribeToLlmProgress } from '../services/llm';
import { estimateTranscribeTime, estimateLlmTime, initPerformanceCache, initLlmPerformanceCache } from '../services/performance';
import { createLogger } from '../services/log';
import { countWords } from '../utils/i18n';  // 导入智能统计函数
import type { LlmErrorPayload } from '../types';
import { getCurrentWindow } from '@tauri-apps/api/window';

// 创建日志记录器
const log = createLogger('FloatPanel');

type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'typing';

interface FloatPanelState {
  visible: boolean;
  status: RecorderStatus;
  sceneName?: string;
  text?: string;
  modelId?: string;
  device?: 'CPU' | 'GPU';
  audioDuration?: number;
  isTranscribing?: boolean;
  // LLM 进度相关字段
  llmModelId?: string;
  hasLlmProfile?: boolean;
  textLen?: number;
  // 双击跳过 LLM 标记
  skipLlm?: boolean;
  // 分段转录开关（用于控制 VAD 停顿时的状态指示器）
  segmentTranscribe?: boolean;
}

interface VadStatus {
  isVoice: boolean;
}

interface AudioBufferStatus {
  hasPendingAudio: boolean;
  pendingDurationSecs: number;
}

// Get status display config
function getStatusConfig(status: RecorderStatus, t: (key: string) => string, skipLlm?: boolean, isBuffered?: boolean): { text: string; dotClass: string } {
  // 缓存状态优先级最高，但只在录音状态(recording)时显示
  // 一旦进入转录(transcribing)或输入(typing)状态，显示对应的状态
  if (isBuffered && status === 'recording') {
    return { text: t('transcribe.status.buffered'), dotClass: 'buffered' };
  }
  switch (status) {
    case 'recording':
      return { text: t('transcribe.status.recording'), dotClass: 'recording' };
    case 'transcribing':
      // 如果双击跳过 LLM，显示"识别中（跳过LLM）"
      if (skipLlm) {
        return { text: t('transcribe.status.transcribingSkipLlm'), dotClass: 'transcribing' };
      }
      return { text: t('transcribe.status.transcribing'), dotClass: 'transcribing' };
    case 'typing':
      return { text: t('transcribe.status.typing'), dotClass: 'typing' };
    default:
      return { text: t('transcribe.status.idle'), dotClass: 'idle' };
  }
}

// Simple waveform component - inline
function Waveform({ isActive }: { isActive: boolean }) {
  return (
    <div className="waveform-container">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`wave-bar ${isActive ? 'active' : ''}`} />
      ))}
    </div>
  );
}

/**
 * 计算进度 - 时间驱动，95%后减速，最大100%
 */
function calculateProgress(elapsed: number, estimatedTime: number): number {
  if (estimatedTime <= 0) {
    // 没有预估时间，缓慢增长到95%
    return Math.min(95, elapsed / 100);
  }

  const ratio = elapsed / estimatedTime;
  const baseProgress = ratio * 100;

  // 95%之后减速前进（1%速度），避免"卡住"的感觉
  if (baseProgress >= 95) {
    // 最大限制为100%，防止进度无限增长
    return Math.min(100, 95 + (baseProgress - 95) * 0.01);
  }

  return baseProgress;
}

interface PreviewTextPayload {
  fullText: string;
  segmentText: string;
}

interface StreamingTextEvent {
  displayText: string;
  delta: string;
  isFinal: boolean;
}

interface StreamingErrorEvent {
  error: string;
  savedText: string;
}

interface StreamingPartialEvent {
  segmentIndex: number;
  version: number;
  text: string;
  startMs: number;
  endMs: number;
}

interface StreamingFinalEvent {
  segmentIndex: number;
  version: number;
  text: string;
  startMs: number;
  endMs: number;
}

interface LlmErrorState {
  visible: boolean;
  error: string;
  originalTextOutput: boolean;
}

export default function FloatPanelApp() {
  log.debug('Component rendering...');

  const { t } = useTranslation();

  const [state, setState] = useState<FloatPanelState>({
    visible: false,
    status: 'idle',
  });

  // 追踪当前状态（用于事件处理器中检查，避免 closure 问题）
  const statusRef = useRef<RecorderStatus>('idle');

  // 分段转录开关（用于控制 VAD 停顿时的状态指示器，默认 true）
  const segmentTranscribeEnabledRef = useRef(true);

  // 音频缓存状态：true 表示有音频在 pending_buffer 中（显示橙点）
  const [isAudioBuffered, setIsAudioBuffered] = useState(false);
  const isAudioBufferedRef = useRef(false);

  const [isHiding, setIsHiding] = useState(false);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [isCacheReady, setIsCacheReady] = useState(false);
  const prevVoiceDetectedRef = useRef(false); // 追踪上一次的语音检测状态

  // 预览窗口折叠状态（用户偏好，存储在 localStorage）
  // 默认展开（false = 不折叠，true = 折叠）
  const [previewCollapsed, setPreviewCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('voconly-preview-collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  // 预览窗口高度档位（用户偏好，存储在 localStorage）
  // 默认 medium，每次渲染时从 localStorage 读取最新值
  const getPreviewHeight = (): 'high' | 'medium' | 'low' => {
    try {
      const stored = localStorage.getItem('voconly-preview-height');
      //log.info(`[预览高度] 从 localStorage 读取到: "${stored}"`);
      if (stored === 'high' || stored === 'medium' || stored === 'low') {
        //log.info(`[预览高度] 返回值: ${stored}`);
        return stored;
      }
    } catch (e) {
      log.error(`[预览高度] 读取失败: ${e}`);
    }
    //log.info(`[预览高度] 返回默认值: medium`);
    return 'medium';
  };

  // 切换折叠状态并保存到 localStorage
  // 折叠：先隐藏文字 → 空预览区占位 → 窗口变小 → 隐藏预览区
  // 展开：先显示空预览区占位 → 窗口变大 → 显示文字
  const togglePreviewCollapsed = useCallback(() => {
    const newValue = !previewCollapsed;

    try {
      localStorage.setItem('voconly-preview-collapsed', String(newValue));
      log.debug(`[预览折叠] 用户偏好已保存: ${newValue ? '折叠' : '展开'}`);
    } catch (e) {
      log.error(`[预览折叠] 无法保存到 localStorage: ${e}`);
    }

    if (newValue) {
      // 折叠：先隐藏文字（预览区空占位还在），等渲染完成，再调窗口变小，最后隐藏预览区
      // 状态栏始终在底部（expanded-mode），不会在大窗口居中闪现
      setShouldShowPreviewText(false);  // 隐藏文字，预览区空占位保持
      log.debug(`[预览折叠] 文字已隐藏，准备收缩窗口`);

      // 延迟调窗口（等 React 渲染完成，文字已从 DOM 消失）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          invoke('set_float_panel_height', { expanded: false, previewHeight: null })
            .then(() => {
              log.debug(`[窗口高度] 窗口已变小，现在隐藏预览区`);
              setPreviewCollapsed(true);     // 隐藏预览区
              setShouldShowPreviewText(true); // 恢复文字显示状态（下次展开时可用）
            })
            .catch((e) => {
              log.error(`[窗口高度] 切换失败: ${e}`);
              // 失败时也恢复状态
              setPreviewCollapsed(true);
              setShouldShowPreviewText(true);
            });
        });
      });
    } else {
      // 展开：先显示空预览区占位，调窗口变大，再显示文字
      setShouldShowPreviewText(false);  // 隐藏文字
      setIsExpandingWindow(true);       // 显示空预览区占位

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          invoke('set_float_panel_height', { expanded: true, previewHeight: getPreviewHeight() })
            .then(() => {
              log.debug(`[窗口高度] 切换为展开模式`);
              // 窗口变大后，显示文字并取消展开状态
              setPreviewCollapsed(false);
              setIsExpandingWindow(false);
              setShouldShowPreviewText(true);
            })
            .catch((e) => {
              log.error(`[窗口高度] 切换失败: ${e}`);
              // 失败时也恢复状态
              setPreviewCollapsed(false);
              setIsExpandingWindow(false);
              setShouldShowPreviewText(true);
            });
        });
      });
    }
  }, [previewCollapsed]);

  // 更新显示文本（从 segments Map 合并）
  // 注意：这个函数用于 Final 事件更新，Partial 事件有自己的展开逻辑
  const updateDisplayText = useCallback(() => {
    const segments = segmentsRef.current;
    const sortedIndexes = Array.from(segments.keys()).sort((a, b) => a - b);
    const texts = sortedIndexes.map(idx => segments.get(idx)?.text || '').filter(t => t);
    const displayText = texts.join(' ');
    setPreviewText(displayText);
    setPreviewVisible(displayText.length > 0);
  }, []);

  // LLM 错误状态
  const [llmError, setLlmError] = useState<LlmErrorState>({
    visible: false,
    error: '',
    originalTextOutput: false,
  });

  // 追踪转录状态：用户停顿后开始转录，文本出来后结束
  const [isAwaitingTranscribe, setIsAwaitingTranscribe] = useState(false);

  // 预览文字状态
  const [previewText, setPreviewText] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const previewTextRef = useRef<HTMLDivElement>(null);

  // 追踪预览可见状态的 ref（用于事件处理器中判断药丸是否已展开）
  const previewVisibleRef = useRef(false);

  // 同步 previewVisible 到 ref
  useEffect(() => {
    previewVisibleRef.current = previewVisible;
  }, [previewVisible]);

  // 窗口展开状态：表示"正在展开窗口，预览区准备中"
  // 用于先渲染空预览区占位，再调窗口变大，避免状态栏闪现
  const [isExpandingWindow, setIsExpandingWindow] = useState(false);

  // 待填充文字：窗口展开过程中暂存文字，等窗口变大后再渲染
  const pendingTextRef = useRef<string>('');

  // 是否应该显示预览文字（展开过程中延迟显示，避免文字在小窗口闪现）
  const [shouldShowPreviewText, setShouldShowPreviewText] = useState(true);

  // 是否隐藏状态栏（在调整窗口过程中隐藏，避免位置跳动）
  const [hideStatusBar, setHideStatusBar] = useState(false);

  // 追踪是否已自动展开窗口（首次收到文字时）
  const hasAutoExpandedRef = useRef(false);

  // 编辑状态标记
  const isEditingRef = useRef(false);
  // 用户是否编辑过（决定追加还是替换）
  const hasUserEditedRef = useRef(false);
  // 防抖同步定时器
  const syncTimeoutRef = useRef<number | null>(null);

  // 存储片段结果: segment_index -> { text, isFinal, version }
  const segmentsRef = useRef<Map<number, { text: string; isFinal: boolean; version: number }>>(new Map());

  // 同步 previewText 到 contentEditable div 的 innerHTML
  useEffect(() => {
    // LLM 错误状态下禁止更新 DOM，防止文本泄露到错误药丸
    if (llmError.visible) {
      return;
    }
    // 如果用户正在编辑，不覆盖 DOM，避免光标跳动
    if (isEditingRef.current || document.activeElement === previewTextRef.current) {
      return;
    }
    // 展开过程中延迟显示文字，避免在小窗口闪现
    const textToShow = shouldShowPreviewText ? previewText : '';
    // 仅当 DOM 和预期内容不一致时才同步
    if (previewTextRef.current && previewTextRef.current.textContent !== textToShow) {
      previewTextRef.current.textContent = textToShow;
    }
  }, [previewText, previewCollapsed, llmError.visible, shouldShowPreviewText]); // 当折叠状态或文字显示状态变化时也同步

  // 监听 VAD 状态变化：用户停顿时开始转录等待状态
  useEffect(() => {
    const wasVoiceDetected = prevVoiceDetectedRef.current;
    log.info(`[VAD追踪] voiceDetected=${voiceDetected}, wasVoiceDetected=${wasVoiceDetected}, status=${state.status}, isAwaitingTranscribe=${isAwaitingTranscribe}`);

    if (state.status === 'recording') {
      // voiceDetected 从 true 变为 false：用户停顿，音频送去转录
      if (wasVoiceDetected && !voiceDetected) {
        log.info(`[VAD追踪] ⚠️ 停顿检测触发！设置 isAwaitingTranscribe=true (之前 wasVoiceDetected=${wasVoiceDetected}, 现在 voiceDetected=${voiceDetected})`);
        setIsAwaitingTranscribe(true);
      }
    }
    // 更新 ref 以追踪下一次变化
    prevVoiceDetectedRef.current = voiceDetected;
  }, [voiceDetected, state.status]);

  // 进度状态（统一进度条，不分阶段）- 使用 Session ID 模式
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0); // 用于平滑动画获取当前进度

  // Session ID 模式：用一个对象管理整个进度追踪会话
  // 解决竞态问题：旧动画发现自己会话过期，自动停止
  interface ProgressSession {
    id: number;
    startTime: number;
    estimated: number;
  }
  const sessionRef = useRef<ProgressSession | null>(null);
  const estimatedTimeRef = useRef(0); // 总预估时间（转录 + LLM）

  // 结束时平滑过渡到100%
  const smoothAnimationRef = useRef<number | null>(null);

  // LLM 结束信号追踪
  const hasLlmConfigRef = useRef(false); // 是否有 LLM 配置且开关打开
  const llmCompleteReceivedRef = useRef(false); // 是否收到 LLM complete 事件

  // 同步 progress 到 ref
  useEffect(() => {
    progressRef.current = progress;
    log.debug(`[ProgressSync] progress=${progress.toFixed(2)}%`);
  }, [progress]);

  // 同步 status 到 ref（用于事件处理器中检查当前状态）
  useEffect(() => {
    statusRef.current = state.status;
    log.debug(`[StatusRef] Status updated: ${state.status}`);
  }, [state.status]);

  // 平滑过渡到完成状态（200ms ease-out）
  const smoothProgressToComplete = () => {
    const startProgress = progressRef.current;
    const duration = 200;
    const startTime = Date.now();

    log.debug(`[SMOOTH] Starting smooth animation: ${startProgress.toFixed(2)}% → 100%, duration=${duration}ms, startTime=${startTime}`);

    // 清除之前的动画帧
    if (smoothAnimationRef.current) {
      log.debug(`[SMOOTH] Cancelling previous smooth animation: ${smoothAnimationRef.current}`);
      cancelAnimationFrame(smoothAnimationRef.current);
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progressRatio = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progressRatio, 2); // ease-out
      const newProgress = startProgress + (100 - startProgress) * eased;

      log.debug(`[SMOOTH] animate: elapsed=${elapsed}ms, ratio=${progressRatio.toFixed(3)}, eased=${eased.toFixed(3)}, progress=${newProgress.toFixed(2)}%`);

      setProgress(newProgress);
      progressRef.current = newProgress;

      if (progressRatio < 1) {
        smoothAnimationRef.current = requestAnimationFrame(animate);
        log.debug(`[SMOOTH] Scheduled next frame: ${smoothAnimationRef.current}`);
      } else {
        setProgress(100);
        progressRef.current = 100;
        smoothAnimationRef.current = null;
        log.debug(`[SMOOTH] Animation complete, progress set to 100%`);
      }
    };
    smoothAnimationRef.current = requestAnimationFrame(animate);
    log.debug(`[SMOOTH] Initial frame scheduled: ${smoothAnimationRef.current}`);
  };

  // 初始化性能缓存
  useEffect(() => {
    log.debug('Initializing performance cache...');
    Promise.all([initPerformanceCache(), initLlmPerformanceCache()])
      .then(() => {
        log.debug('Performance cache initialized successfully');
        setIsCacheReady(true);
      })
      .catch((e) => {
        log.error(`Failed to initialize performance cache: ${e}`);
        setIsCacheReady(true); // 即使失败也继续，使用默认值
      });
  }, []);

  // 缓存就绪日志
  useEffect(() => {
    log.debug(`Cache ready status: ${isCacheReady}`);
  }, [isCacheReady]);

  // 事件监听
  useEffect(() => {
    log.debug('Setting up event listeners...');
    const unlistenPromises: Promise<(() => void)>[] = [];

    unlistenPromises.push(
      listen<FloatPanelState>('float-panel-update', (event) => {
        log.debug(`Received float-panel-update: ${JSON.stringify(event.payload)}`);
        const newState = event.payload;

        // 【调试】记录接收到的 status 值
        log.debug(`[StatusDebug] Received status: "${newState.status}" (type: ${typeof newState.status})`);
        log.debug(`[StatusDebug] Status === 'transcribing': ${newState.status === 'transcribing'}`);

        // 【进度条日志】打印接收到的音频时长
        if (newState.audioDuration !== undefined) {
          log.info(`[进度条] 收到 audioDuration=${newState.audioDuration}s`);
          console.log(`[进度条] FloatPanel 收到 audioDuration=${newState.audioDuration}s`);
        }

        // 更新分段转录开关状态（用于控制状态指示器）
        // 【修复】检查是否为布尔值,避免 null 被误用
        if (typeof newState.segmentTranscribe === 'boolean') {
          segmentTranscribeEnabledRef.current = newState.segmentTranscribe;
          log.debug(`[SegmentTranscribe] Updated: ${newState.segmentTranscribe}`);
        } else if (newState.segmentTranscribe === null || newState.segmentTranscribe === undefined) {
          // null 或 undefined 时使用默认值 true
          segmentTranscribeEnabledRef.current = true;
          log.debug(`[SegmentTranscribe] Using default value: true (received: ${newState.segmentTranscribe})`);
        }

        setState(prev => {
          log.debug(`[STATE] prev.status="${prev.status}", prev.isTranscribing=${prev.isTranscribing} → new.status="${newState.status}", new.isTranscribing=${newState.isTranscribing}`);
          if (newState.visible && !prev.visible) {
            setIsHiding(false);
            // 新录音开始时，清除所有旧状态，确保干净的初始状态
            setLlmError({ visible: false, error: '', originalTextOutput: false });
            setPreviewVisible(false);
            setPreviewText('');
            setIsExpandingWindow(false); // 重置窗口展开状态
            pendingTextRef.current = ''; // 清空待填充文字
            setShouldShowPreviewText(true); // 重置文字显示状态
            setProgress(0);
            progressRef.current = 0;
            // 【修复】取消平滑过渡动画帧，防止旧 RAF 污染新会话
            if (smoothAnimationRef.current) {
              cancelAnimationFrame(smoothAnimationRef.current);
              smoothAnimationRef.current = null;
            }
            // 重置编辑标记
            hasUserEditedRef.current = false;
            isEditingRef.current = false;
            // 重置自动展开标记，下次收到文字时可以自动展开
            hasAutoExpandedRef.current = false;
            // 【新增】重置音频缓存状态
            setIsAudioBuffered(false);
            isAudioBufferedRef.current = false;
            // 【修复】重置转录等待状态和语音检测追踪
            setIsAwaitingTranscribe(false);
            prevVoiceDetectedRef.current = false;
            setVoiceDetected(false);
            // 【Session ID 模式】结束当前会话，旧动画自动过期
            sessionRef.current = null;
            estimatedTimeRef.current = 0;
            llmCompleteReceivedRef.current = false;
            log.debug('[StateUpdate] 新录音开始，进度会话已结束，旧动画将自终止');
          }
          if (newState.status !== 'recording') {
            setVoiceDetected(false);
            setIsAwaitingTranscribe(false);
            prevVoiceDetectedRef.current = false;
          }
          // 只在真正开始新转录任务时重置进度（从其他状态变为 transcribing）
          // ASR完成后的更新事件不会触发重置，进度保持不变，仅更新预估时间
          if (prev.status !== 'transcribing' && newState.status === 'transcribing') {
            setProgress(0);
            progressRef.current = 0;
            llmCompleteReceivedRef.current = false;
          }
          // 【修复】状态合并而非替换，防止后端 null 值覆盖前端有效状态
          return { ...prev, ...newState };
        });
      }).catch((e) => {
        log.error(`Failed to listen float-panel-update: ${e}`);
        return () => {};
      })
    );

    unlistenPromises.push(
      listen<void>('float-panel-hide', () => {
        const currentProgress = progressRef.current;
        const currentSession = sessionRef.current;
        log.debug(`[HIDE-EVENT] Received float-panel-hide: currentProgress=${currentProgress.toFixed(2)}%, sessionId=${currentSession?.id || 'null'}, smoothAnimationRef=${smoothAnimationRef.current || 'null'}`);
        setIsHiding(true);
        // 【修复】立即取消平滑过渡动画帧，防止延迟清理期间的 RAF 泄漏
        if (smoothAnimationRef.current) {
          log.debug(`[HIDE-EVENT] Cancelling smooth animation: ${smoothAnimationRef.current}`);
          cancelAnimationFrame(smoothAnimationRef.current);
          smoothAnimationRef.current = null;
        } else {
          log.debug(`[HIDE-EVENT] No smooth animation to cancel`);
        }
        setTimeout(() => {
          log.debug(`[HIDE-EVENT] Executing hide timeout cleanup`);
          setState(prev => ({ ...prev, visible: false }));
          setIsHiding(false);
          // 隐藏时清除所有状态，确保下次是初始状态
          setLlmError({ visible: false, error: '', originalTextOutput: false });
          setProgress(0);
          progressRef.current = 0;
          // 【修复】重置转录等待状态和音频缓存状态
          setIsAwaitingTranscribe(false);
          setIsAudioBuffered(false);
          isAudioBufferedRef.current = false;
          prevVoiceDetectedRef.current = false;
          setVoiceDetected(false);
          log.debug('[HIDE-EVENT] 状态已完全重置');
        }, 100);
      }).catch((e) => {
        log.error(`Failed to listen float-panel-hide: ${e}`);
        return () => {};
      })
    );

    unlistenPromises.push(
      listen<VadStatus>('vad-status', (event) => {
        log.debug(`Received vad-status: ${JSON.stringify(event.payload)}`);
        setVoiceDetected(event.payload.isVoice);
      }).catch((e) => {
        log.error(`Failed to listen vad-status: ${e}`);
        return () => {};
      })
    );

    // 监听音频缓存状态事件（短片段进入 pending_buffer）
    unlistenPromises.push(
      listen<AudioBufferStatus>('audio-buffered', (event) => {
        log.debug(`[AudioBuffer] Received audio-buffered: ${JSON.stringify(event.payload)}`);
        setIsAudioBuffered(true);
        isAudioBufferedRef.current = true;
      }).catch((e) => {
        log.error(`Failed to listen audio-buffered: ${e}`);
        return () => {};
      })
    );

    // 监听音频释放事件（pending_buffer 被合并并发送）
    unlistenPromises.push(
      listen<AudioBufferStatus>('audio-released', (event) => {
        log.debug(`[AudioBuffer] Received audio-released: ${JSON.stringify(event.payload)}`);
        setIsAudioBuffered(false);
        isAudioBufferedRef.current = false;
      }).catch((e) => {
        log.error(`Failed to listen audio-released: ${e}`);
        return () => {};
      })
    );

    // 【新增】监听转录结果事件（双重保险：确保绿点正确变回红色）
    // 后端 Worker 转录完成后发送此事件
    unlistenPromises.push(
      listen<{ text: string; duration: number }>('transcription-result', (event) => {
        log.debug(`[状态指示器] Received transcription-result: ${event.payload.text.length} chars, setting isAwaitingTranscribe=false`);
        // 转录完成，立即结束等待状态，绿点变回红色
        setIsAwaitingTranscribe(false);
      }).catch((e) => {
        log.error(`Failed to listen transcription-result: ${e}`);
        return () => {};
      })
    );

    // 监听 LLM 进度事件（只用于结束信号）
    unlistenPromises.push(
      subscribeToLlmProgress((event) => {
        log.debug(`Received llm-progress: stage=${event.stage}`);

        if (event.stage === 'complete') {
          // complete 阶段：标记收到结束信号，平滑过渡到 100%
          llmCompleteReceivedRef.current = true;
          log.debug(`LLM complete received, smoothing progress to 100%`);
          // Session ID 模式下，动画会自动检测 llmCompleteReceivedRef
          smoothProgressToComplete();
        }
      }).catch((e) => {
        log.error(`Failed to subscribe to llm-progress: ${e}`);
        return () => {};
      })
    );

    // 监听预览文字更新事件
    unlistenPromises.push(
      listen<PreviewTextPayload>('preview-text-update', (event) => {
        log.debug(`Received preview-text-update: ${event.payload.fullText.length} chars, current status: ${statusRef.current}, previewVisible: ${previewVisibleRef.current}`);

        // 如果当前状态是 transcribing，说明用户已停止录音正在等待输出
        // 此时收到的文本是"迟到"的尾部残留转录结果
        // 关键判断：如果药丸当前没有展开（previewVisibleRef = false），不应该撑开它
        // 只有药丸原本就是展开状态（previewVisibleRef = true），才需要展示文字
        if (statusRef.current === 'transcribing') {
          if (!previewVisibleRef.current) {
            log.debug(`[Preview] Ignoring late preview-text-update (status is transcribing, window not expanded)`);
            return;
          }
          log.debug(`[Preview] Processing late preview-text-update (status is transcribing, window already expanded)`);
        }

        // 首次收到文字时，自动展开窗口（如果用户未手动折叠）
        // 采用"占位先行"策略：先渲染空预览区，再调窗口变大，避免文字在小窗口中闪现
        if (!hasAutoExpandedRef.current && event.payload.fullText.length > 0) {
          hasAutoExpandedRef.current = true;
          const userCollapsed = localStorage.getItem('voconly-preview-collapsed') === 'true';
          if (!userCollapsed) {
            // 立即设置展开状态 → React 渲染空预览区占位（无文字）
            setIsExpandingWindow(true);
            setShouldShowPreviewText(false); // 隐藏文字，等窗口变大后再显示
            // 暂存文字，等窗口变大后再渲染
            pendingTextRef.current = event.payload.fullText;
            log.debug(`[窗口展开] 设置 isExpandingWindow=true，文字暂存: ${event.payload.fullText.length} chars`);

            // 【修复】立即结束转录等待状态，绿点变回红色
            // 不依赖异步回调，确保状态及时更新
            log.debug(`[状态指示器] 转录结果返回（首次展开），立即设置 isAwaitingTranscribe=false`);
            setIsAwaitingTranscribe(false);

            // 延迟调窗口（等 React 渲染完成，两帧确保 DOM 更新）
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                invoke('set_float_panel_height', { expanded: true, previewHeight: getPreviewHeight() })
                  .then(() => {
                    log.debug(`[窗口高度] 窗口已变大，现在填充文字`);
                    // 窗口变大后，从暂存区填充文字到 DOM
                    const pendingText = pendingTextRef.current;
                    if (pendingText) {
                      setPreviewText(pendingText);
                      setPreviewVisible(true);
                      pendingTextRef.current = ''; // 清空暂存
                    }
                    setIsExpandingWindow(false);
                    setShouldShowPreviewText(true); // 显示文字
                  })
                  .catch((e) => {
                    log.error(`[窗口高度] 自动展开失败: ${e}`);
                    // 失败时也填充文字（降级处理）
                    const pendingText = pendingTextRef.current;
                    if (pendingText) {
                      setPreviewText(pendingText);
                      setPreviewVisible(true);
                      pendingTextRef.current = '';
                    }
                    setIsExpandingWindow(false);
                    setShouldShowPreviewText(true); // 显示文字
                  });
              });
            });
            // 提前返回，等窗口变大后再处理文字
            return;
          } else {
            log.debug(`[窗口高度] 用户已折叠，不自动展开`);
          }
        }

        const domEl = previewTextRef.current;
        if (!domEl) {
          // DOM 不存在，直接设置 state
          setPreviewText(event.payload.fullText);
          setPreviewVisible(true);
          setIsAwaitingTranscribe(false);
          return;
        }

        // 检查预览区域当前是否有光标/焦点
        const selection = window.getSelection();
        const hasFocus = selection && selection.rangeCount > 0 && domEl.contains(selection.anchorNode);

        if (hasUserEditedRef.current) {
          // 用户编辑过：追加新 segment 到现有 DOM
          const newText = domEl.textContent + event.payload.segmentText;
          domEl.textContent = newText;
          setPreviewText(newText);
          log.debug(`[预览编辑] 用户已编辑，追加内容: ${event.payload.segmentText.length} chars`);
        } else {
          // 未编辑：完整替换
          domEl.textContent = event.payload.fullText;
          setPreviewText(event.payload.fullText);
        }
        setPreviewVisible(true);
        // 转录结果出来，结束等待状态
        log.debug(`[状态指示器] 转录结果返回，设置 isAwaitingTranscribe=false`);
        setIsAwaitingTranscribe(false);

        // 如果预览区域有光标，将光标移到文本末尾
        if (hasFocus && selection && domEl.firstChild) {
          const textLength = domEl.textContent?.length || 0;
          const newRange = document.createRange();
          newRange.setStart(domEl.firstChild, textLength);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }).catch((e) => {
        log.error(`Failed to listen preview-text-update: ${e}`);
        return () => {};
      })
    );

    // 监听预览窗口隐藏事件
    // 不做任何处理，保持当前展开状态
    // 下次录制开始时，float-panel-update 会自然重置为药丸模式
    unlistenPromises.push(
      listen<void>('preview-window-hide', () => {
        log.debug('Received preview-window-hide, keeping current state for progress display');
        // 不做任何处理，让进度条在当前界面走完
        // 下次 show_float_panel 会重置窗口为药丸高度
        // float-panel-update 会重置 previewVisible 和 previewText
      }).catch((e) => {
        log.error(`Failed to listen preview-window-hide: ${e}`);
        return () => {};
      })
    );

    // 监听 LLM 错误事件
    unlistenPromises.push(
      listen<LlmErrorPayload>('llm-error', (event) => {
        log.debug(`Received llm-error: ${event.payload.error}`);
        setLlmError({
          visible: true,
          error: event.payload.error,
          originalTextOutput: event.payload.originalTextOutput,
        });
      }).catch((e) => {
        log.error(`Failed to listen llm-error: ${e}`);
        return () => {};
      })
    );

    // 流式文本更新事件
    console.log('[STREAMING-DEBUG] 注册 streaming-text-update 事件监听器...');
    unlistenPromises.push(
      listen<StreamingTextEvent>('streaming-text-update', (event) => {
        // 使用 console.log 确保日志显示
        //console.log(`[STREAMING] ✅✅✅ Received streaming-text-update: ${JSON.stringify(event.payload)}`);
        //log.info(`[STREAMING] Received streaming-text-update: ${event.payload.displayText.length} chars, isFinal=${event.payload.isFinal}`);

        // 首次收到文字时，自动展开窗口（如果用户未手动折叠）
        const shouldAutoExpand = !hasAutoExpandedRef.current && event.payload.displayText.length > 0;
        console.log(`[STREAMING] shouldAutoExpand=${shouldAutoExpand}, hasAutoExpanded=${hasAutoExpandedRef.current}, textLen=${event.payload.displayText.length}`);

        if (shouldAutoExpand) {
          hasAutoExpandedRef.current = true;
          const userCollapsed = localStorage.getItem('voconly-preview-collapsed') === 'true';
          console.log(`[STREAMING] userCollapsed=${userCollapsed}`);

          if (!userCollapsed) {
            // 立即设置展开状态 → React 渲染空预览区占位（无文字）
            setIsExpandingWindow(true);
            setShouldShowPreviewText(false); // 隐藏文字，等窗口变大后再显示
            pendingTextRef.current = event.payload.displayText;
            log.info(`[STREAMING] 窗口展开开始，文字暂存: ${event.payload.displayText.length} chars`);

            // 延迟调窗口（等 React 渲染完成，两帧确保 DOM 更新）
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                invoke('set_float_panel_height', { expanded: true, previewHeight: getPreviewHeight() })
                  .then(() => {
                    log.info(`[STREAMING] 窗口已变大，现在填充文字`);
                    const pendingText = pendingTextRef.current;
                    if (pendingText) {
                      setPreviewText(pendingText);
                      setPreviewVisible(true);
                      pendingTextRef.current = '';
                    }
                    setIsExpandingWindow(false);
                    setShouldShowPreviewText(true);
                  })
                  .catch((e) => {
                    log.error(`[STREAMING] 自动展开失败: ${e}`);
                    const pendingText = pendingTextRef.current;
                    if (pendingText) {
                      setPreviewText(pendingText);
                      setPreviewVisible(true);
                      pendingTextRef.current = '';
                    }
                    setIsExpandingWindow(false);
                    setShouldShowPreviewText(true);
                  });
              });
            });
            return;
          }
        }

        // 已展开或用户手动折叠，直接更新文字
        console.log(`[STREAMING] 直接更新文字: ${event.payload.displayText.length} chars`);
        setPreviewText(event.payload.displayText);
        setPreviewVisible(true);
      }).catch((e) => {
        log.error(`Failed to listen streaming-text-update: ${e}`);
        return () => {};
      })
    );

    // 流式错误事件
    unlistenPromises.push(
      listen<StreamingErrorEvent>('streaming-error', (event) => {
        log.error(`Received streaming-error: ${event.payload.error}`);
        // 如果有保存的文本，显示它
        if (event.payload.savedText) {
          setPreviewText(event.payload.savedText);
        }
      }).catch((e) => {
        log.error(`Failed to listen streaming-error: ${e}`);
        return () => {};
      })
    );

    // Partial 识别结果事件（实时显示）
    unlistenPromises.push(
      listen<StreamingPartialEvent>('streaming-partial-update', (event) => {
        log.debug(`[Streaming] Partial update: index=${event.payload.segmentIndex}, version=${event.payload.version}, text="${event.payload.text}"`);

        // 版本号检查：只有更新的版本才覆盖
        const existing = segmentsRef.current.get(event.payload.segmentIndex);
        if (existing && existing.version > event.payload.version) {
          log.debug(`[Streaming] Ignoring outdated Partial: existing version=${existing.version}, new version=${event.payload.version}`);
          return;
        }

        segmentsRef.current.set(event.payload.segmentIndex, {
          text: event.payload.text,
          isFinal: false,
          version: event.payload.version,
        });

        // 【关键修复】第一个 Partial 结果到达时，立即展开药丸
        const segments = segmentsRef.current;
        const sortedIndexes = Array.from(segments.keys()).sort((a, b) => a - b);
        const texts = sortedIndexes.map(idx => segments.get(idx)?.text || '').filter(t => t);
        const displayText = texts.join(' ');

        if (displayText.length > 0) {
          // 首次收到文字时，自动展开窗口（如果用户未手动折叠）
          if (!hasAutoExpandedRef.current) {
            hasAutoExpandedRef.current = true;
            const userCollapsed = localStorage.getItem('voconly-preview-collapsed') === 'true';
            if (!userCollapsed) {
              log.debug(`[Streaming] 首次 Partial 结果，展开药丸: ${displayText.length} chars`);

              // 【关键】在调整窗口过程中，隐藏状态栏，避免位置跳动
              setHideStatusBar(true);
              setIsExpandingWindow(true);
              setShouldShowPreviewText(false);
              pendingTextRef.current = displayText;

              // 延迟调窗口（等 React 渲染完成，两帧确保 DOM 更新）
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  invoke('set_float_panel_height', { expanded: true, previewHeight: getPreviewHeight() })
                    .then(() => {
                      log.debug(`[Streaming] 窗口已变大，现在填充文字并显示状态栏`);
                      const pendingText = pendingTextRef.current;
                      if (pendingText) {
                        setPreviewText(pendingText);
                        setPreviewVisible(true);
                        pendingTextRef.current = '';
                      }
                      setIsExpandingWindow(false);
                      setShouldShowPreviewText(true);
                      // 窗口调整完成，显示状态栏
                      setHideStatusBar(false);
                    })
                    .catch((e) => {
                      log.error(`[Streaming] 自动展开失败: ${e}`);
                      // 失败时也要显示状态栏
                      setHideStatusBar(false);
                    });
                });
              });
            }
          } else {
            // 药丸已展开，直接更新文字
            setPreviewText(displayText);
            setPreviewVisible(true);
          }
        }
      }).catch((e) => {
        log.error(`Failed to listen streaming-partial-update: ${e}`);
        return () => {};
      })
    );

    // Final 识别结果事件（替代同 index 的 Partial）
    unlistenPromises.push(
      listen<StreamingFinalEvent>('streaming-final-update', (event) => {
        log.debug(`[Streaming] Final update: index=${event.payload.segmentIndex}, version=${event.payload.version}, text="${event.payload.text}"`);

        // 版本号检查：只有更新的版本才覆盖
        const existing = segmentsRef.current.get(event.payload.segmentIndex);
        if (existing && existing.version > event.payload.version) {
          log.debug(`[Streaming] Ignoring outdated Final: existing version=${existing.version}, new version=${event.payload.version}`);
          return;
        }

        segmentsRef.current.set(event.payload.segmentIndex, {
          text: event.payload.text,
          isFinal: true,
          version: event.payload.version,
        });
        updateDisplayText();
      }).catch((e) => {
        log.error(`Failed to listen streaming-final-update: ${e}`);
        return () => {};
      })
    );

    // 录音停止时清空 segments
    unlistenPromises.push(
      listen<void>('streaming-recording-stopped', () => {
        log.debug(`[Streaming] Recording stopped, clearing segments`);
        segmentsRef.current.clear();
      }).catch((e) => {
        log.error(`Failed to listen streaming-recording-stopped: ${e}`);
        return () => {};
      })
    );

    // 清理函数：组件卸载或effect重新运行时清除 RAF
    return () => {
      log.debug('Cleaning up event listeners...');
      // 清除防抖同步定时器
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      // 清除平滑过渡动画帧
      if (smoothAnimationRef.current) {
        cancelAnimationFrame(smoothAnimationRef.current);
        smoothAnimationRef.current = null;
      }
      // 【Session ID 模式】结束所有会话，旧动画自动过期
      sessionRef.current = null;
      Promise.all(unlistenPromises).then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, []);

  // 计算预估时间 - 当 state 变化时更新（确保始终有值）
  useEffect(() => {
    log.debug(`[ESTIMATE] state changed: modelId=${state.modelId}, device=${state.device}, audioDuration=${state.audioDuration}, status=${state.status}, isTranscribing=${state.isTranscribing}, textLen=${state.textLen}, skipLlm=${state.skipLlm}`);

    if (state.modelId && state.device && state.audioDuration && state.audioDuration > 0) {
      const transcribeInfo = estimateTranscribeTime(state.modelId, state.device, state.audioDuration);
      let totalTime = transcribeInfo.estimatedTime;

      // 【进度条日志】打印预估计算
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  📊 进度条预估计算`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`  音频时长: ${state.audioDuration}s`);
      console.log(`  ASR模型: ${state.modelId}`);
      console.log(`  设备: ${state.device}`);
      console.log(`  RTF: ${transcribeInfo.avgRtf}`);
      console.log(`  ASR预估: ${transcribeInfo.estimatedTime}s`);
      console.log(`${'─'.repeat(60)}`);

      log.debug(`[ESTIMATE] ASR estimate: model=${state.modelId}, device=${state.device}, audio=${state.audioDuration}s, rtf=${transcribeInfo.avgRtf}, estimated=${transcribeInfo.estimatedTime}s`);

      // 如果有 LLM profile 且未双击跳过，加上 LLM 预估时间
      if (state.hasLlmProfile && state.llmModelId && !state.skipLlm) {
        const textLen = state.textLen || Math.round(state.audioDuration * 15);
        const llmInfo = estimateLlmTime(state.llmModelId, textLen);
        totalTime += llmInfo.estimatedTime;
        hasLlmConfigRef.current = true;

        console.log(`  LLM模型: ${state.llmModelId}`);
        console.log(`  文本长度: ${textLen}`);
        console.log(`  LLM预估: ${llmInfo.estimatedTime}s`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`  总预估: ${totalTime}s`);
        console.log(`${'═'.repeat(60)}\n`);

        log.debug(`[ESTIMATE] LLM estimate: model=${state.llmModelId}, textLen=${textLen}, estimated=${llmInfo.estimatedTime}s`);
        log.debug(`[ESTIMATE] Total estimated time: ${totalTime}s (transcribe: ${transcribeInfo.estimatedTime}s, LLM: ${llmInfo.estimatedTime}s)`);
      } else {
        hasLlmConfigRef.current = false;
        console.log(`  总预估: ${totalTime}s (仅ASR, skipLlm=${state.skipLlm})`);
        console.log(`${'═'.repeat(60)}\n`);
        log.debug(`[ESTIMATE] Total estimated time: ${totalTime}s (transcribe only, skipLlm=${state.skipLlm})`);
      }

      const newEstimatedTime = totalTime * 1000;
      log.debug(`[ESTIMATE] Final estimated time: ${newEstimatedTime}ms (${totalTime}s)`);

      // 【Session ID 模式】如果会话存在，直接更新会话的预估时间
      // 旧动画会继续使用旧的 startTime，但新的预估时间会影响进度计算
      if (sessionRef.current) {
        const currentProgress = progressRef.current;
        const oldEstimated = sessionRef.current.estimated;
        if (currentProgress > 0) {
          // 调整虚拟 startTime，保持当前进度不变
          // 公式：startTime = now - (progress% × newEstimated)
          const virtualElapsed = (currentProgress / 100) * newEstimatedTime;
          const oldStartTime = sessionRef.current.startTime;
          sessionRef.current.startTime = Date.now() - virtualElapsed;
          log.debug(`[ESTIMATE-Session] Updating session ${sessionRef.current.id}: oldEstimated=${oldEstimated}ms, newEstimated=${newEstimatedTime}ms, progress=${currentProgress.toFixed(1)}%, adjusted startTime from ${oldStartTime} to ${sessionRef.current.startTime}`);
        }
        sessionRef.current.estimated = newEstimatedTime;
      }

      estimatedTimeRef.current = newEstimatedTime;
    } else if (state.status === 'transcribing') {
      // 使用默认值预估转录时间
      const defaultRtf = state.device === 'GPU' ? 0.4 : 2.5;
      const duration = state.audioDuration || 1;
      let totalTime = duration * defaultRtf;

      log.debug(`[ESTIMATE] Using defaults: device=${state.device}, defaultRtf=${defaultRtf}, duration=${duration}s, baseTime=${duration * defaultRtf}s`);

      // 加上 LLM 预估时间（仅当未双击跳过）
      if (state.hasLlmProfile && state.llmModelId && !state.skipLlm) {
        const textLen = state.textLen || Math.round(duration * 15);
        const llmInfo = estimateLlmTime(state.llmModelId, textLen);
        totalTime += llmInfo.estimatedTime;
        hasLlmConfigRef.current = true;
        log.debug(`[ESTIMATE] LLM added: model=${state.llmModelId}, textLen=${textLen}, llmTime=${llmInfo.estimatedTime}s, total=${totalTime}s`);
      } else {
        hasLlmConfigRef.current = false;
      }

      estimatedTimeRef.current = totalTime * 1000;
      log.debug(`[ESTIMATE] Final default estimated time: ${estimatedTimeRef.current}ms (total=${totalTime}s)`);
    }
  }, [state.modelId, state.device, state.audioDuration, state.status, state.hasLlmProfile, state.llmModelId, state.textLen]);

  // 进度追踪（Session ID 模式）
  useEffect(() => {
    // 药丸不可见时，不需要追踪进度
    if (!state.visible) {
      if (sessionRef.current) {
        log.debug(`[Session] Panel hidden, ending session: id=${sessionRef.current.id}`);
        sessionRef.current = null;
      }
      return;
    }

    const shouldTrack = state.status === 'transcribing' && state.isTranscribing;
    const hasSession = sessionRef.current !== null;

    // 【关键日志】进度追踪检查
    log.debug(`[TRACK] status="${state.status}", isTranscribing=${state.isTranscribing}, shouldTrack=${shouldTrack}, hasSession=${hasSession}`);

    if (shouldTrack && !hasSession) {
      // 【启动新会话】
      const session: ProgressSession = {
        id: Date.now(),
        startTime: Date.now(),
        estimated: estimatedTimeRef.current,
      };
      sessionRef.current = session;
      llmCompleteReceivedRef.current = false;
      log.debug(`[TRACK] START NEW SESSION: id=${session.id}, estimated=${session.estimated}ms`);

      // 启动动画
      const animate = () => {
        const currentSession = sessionRef.current;
        const now = Date.now();

        // 【核心】自我检查：我还是当前会话吗？
        if (!currentSession || currentSession.id !== session.id) {
          log.debug(`[RAF] Session ${session.id} expired at ${now}, self-terminating (currentSession=${currentSession?.id || 'null'})`);
          return; // 会话过期，自然死亡
        }

        // LLM 完成信号
        if (llmCompleteReceivedRef.current) {
          log.debug(`[RAF] Session ${session.id}: LLM complete received, stopping`);
          return;
        }

        // 【关键】进度达到100%后停止动画
        if (progressRef.current >= 100) {
          log.debug(`[RAF] Session ${session.id}: Progress already at ${progressRef.current.toFixed(2)}%, stopping`);
          return;
        }

        const elapsed = now - currentSession.startTime;
        const baseProgress = calculateProgress(elapsed, currentSession.estimated);

        // 进度只增不减
        if (baseProgress > progressRef.current) {
          const oldProgress = progressRef.current;
          setProgress(baseProgress);
          progressRef.current = baseProgress;
          if (Math.floor(baseProgress) !== Math.floor(oldProgress)) {
            log.debug(`[RAF] Session ${session.id}: progress updated ${oldProgress.toFixed(2)}% → ${baseProgress.toFixed(2)}%`);
          }
        }

        // 每500ms打印一次进度
        if (Math.floor(elapsed / 500) !== Math.floor((elapsed - 16) / 500)) {
          log.debug(`[RAF] Session ${session.id}: elapsed=${elapsed}ms, progress=${baseProgress.toFixed(2)}%, estimated=${currentSession.estimated}ms`);
        }

        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);

    } else if (shouldTrack && hasSession) {
      // 【会话已存在】继续追踪，无需操作
      log.debug(`[Session] Continuing existing session: id=${sessionRef.current?.id}`);

    } else if (state.status === 'transcribing' && !state.isTranscribing) {
      // 【警告】状态为 transcribing 但 isTranscribing 为 false/undefined
      log.debug(`[WARN] status="transcribing" BUT isTranscribing=${state.isTranscribing} - 进度条不会显示!`);

    } else if (!shouldTrack && hasSession) {
      // 【结束会话】旧动画会自动过期
      log.debug(`[Session] Ending session: id=${sessionRef.current?.id}`);
      sessionRef.current = null;

      // 检测是否需要平滑过渡到 100%
      if (!hasLlmConfigRef.current && !llmCompleteReceivedRef.current) {
        log.debug(`Transcribe complete (no LLM), smoothing progress to 100%`);
        smoothProgressToComplete();
      }

      // 打印时间对比日志（如果有预估时间）
      const estimated = estimatedTimeRef.current;
      if (estimated > 0) {
        // 估算实际用时（从开始到结束会话的时间）
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  📈 进度条时间对比`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`  预估时间: ${(estimated / 1000).toFixed(3)} 秒`);
        console.log(`${'─'.repeat(60)}`);
        console.log(`  ✅ 转录完成`);
        console.log(`${'═'.repeat(60)}\n`);
      }
    }

    // 清理函数：组件卸载时结束所有会话
    return () => {
      sessionRef.current = null;
    };
  }, [state.status, state.isTranscribing, state.visible]);

  // 取消录音处理
  const handleCancelRecording = useCallback(() => {
    log.debug('User cancelled recording');
    // 立即开始隐藏动画，不等待后端处理
    setIsHiding(true);
    setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
      setIsHiding(false);
    }, 50);

    // 异步调用后端取消命令，不阻塞 UI
    invoke('cancel_recording')
      .then(() => log.debug('Recording cancelled successfully'))
      .catch((e) => log.error(`Failed to cancel recording: ${e}`));

    // 调用后端隐藏窗口，确保 float_panel_shown 状态正确更新
    // 这样下次显示时会重置窗口高度为药丸模式
    invoke('hide_float_panel')
      .then(() => log.debug('Float panel hidden via hide_float_panel'))
      .catch((e) => log.error(`Failed to hide float panel: ${e}`));
  }, []);

  // 预览文字自动滚动到最新
  useEffect(() => {
    if (previewTextRef.current && previewText) {
      previewTextRef.current.scrollTop = previewTextRef.current.scrollHeight;
    }
  }, [previewText]);

  // 监听语言变化（主窗口切换语言时，浮动窗口需要同步）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // i18next 使用 'i18nextLng' 作为 localStorage key
      if (e.key === 'i18nextLng' && e.newValue) {
        log.debug(`[Language] Detected language change: ${e.newValue}`);
        i18n.changeLanguage(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [i18n]);

  // 监听 LLM 错误状态变化：当错误出现时，收缩窗口为药丸模式
  useEffect(() => {
    if (llmError.visible) {
      log.debug('[LLM Error] 收缩窗口为药丸模式');
      invoke('set_float_panel_height', { expanded: false, previewHeight: null })
        .then(() => log.debug('[LLM Error] 窗口已收缩为药丸模式'))
        .catch((e) => log.error(`[LLM Error] 收缩窗口失败: ${e}`));
    }
  }, [llmError.visible]);

  // LLM 错误自动消失定时器
  const llmErrorAutoHideRef = useRef<number | null>(null);

  // 确认 LLM 错误处理
  const handleConfirmLlmError = useCallback(() => {
    log.debug('User confirmed LLM error, hiding panel');
    // 清除自动消失定时器
    if (llmErrorAutoHideRef.current) {
      clearTimeout(llmErrorAutoHideRef.current);
      llmErrorAutoHideRef.current = null;
    }
    setIsHiding(true);
    setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
      setIsHiding(false);
      setLlmError({ visible: false, error: '', originalTextOutput: false });
      // 清除前端预览文字状态
      setPreviewVisible(false);
      setPreviewText('');
    }, 100);
    // 调用后端清除预览文字缓存
    invoke('clear_preview_text')
      .then(() => log.debug('Backend preview text cleared'))
      .catch((e) => log.error(`Failed to clear backend preview text: ${e}`));
  }, []);

  // LLM 错误自动消失：2秒后自动关闭
  useEffect(() => {
    if (llmError.visible) {
      log.debug('[LLM Error] 设置2秒后自动消失');
      llmErrorAutoHideRef.current = window.setTimeout(() => {
        log.debug('[LLM Error] 自动消失触发');
        handleConfirmLlmError();
      }, 2000);
    }
    return () => {
      if (llmErrorAutoHideRef.current) {
        clearTimeout(llmErrorAutoHideRef.current);
        llmErrorAutoHideRef.current = null;
      }
    };
  }, [llmError.visible, handleConfirmLlmError]);

  if (!state.visible && !llmError.visible) {
    return null;
  }

  const statusConfig = getStatusConfig(state.status, t, state.skipLlm, isAudioBuffered);
  const showWaveform = state.status === 'recording';
  const waveformActive = voiceDetected && state.status === 'recording';
  const showProgress = state.status === 'transcribing';
  const showCancelButton = state.status === 'recording';

  // 【关键日志】渲染状态检查
  log.debug(`[RENDER] status=${state.status}, isTranscribing=${state.isTranscribing}, showProgress=${showProgress}, progress=${progress}`);
  log.debug(`[RENDER] state.visible=${state.visible}, isHiding=${isHiding}, llmError.visible=${llmError.visible}`);

  // 是否显示融合面板
  // 条件1：用户未折叠，或者正在展开窗口（展开过程中即使折叠也显示占位）
  // 条件2：有预览文字，或者正在展开窗口（展开过程中显示空占位）
  const showFusedPanel = (!previewCollapsed || isExpandingWindow) && (previewVisible || isExpandingWindow);

  // 是否有预览内容（用于决定是否显示折叠按钮）
  const hasPreviewContent = previewVisible && previewText;

  // 是否显示转录等待动效：正在等待转录结果（仅分段转录模式）
  const showTranscribeIndicator = state.status === 'recording' && isAwaitingTranscribe && segmentTranscribeEnabledRef.current;

  // 状态圆点样式：
  // - 分段转录开启 + 录音中 + 说话中：绿点（正在实时转录）
  // - 分段转录开启 + 录音中 + 静音：红点（等待说话）
  // - 分段转录关闭 + 录音中：红点（等待结束后转录）
  // - 其他状态：按原状态
  const actualDotClass: string =
    segmentTranscribeEnabledRef.current && state.status === 'recording'
      ? (voiceDetected ? 'transcribing' : 'recording')  // 绿点/红点
      : statusConfig.dotClass;

  // 如果显示 LLM 错误状态，渲染错误状态 UI
  if (llmError.visible) {
    // 根据错误类型显示不同提示
    const errorText = llmError.error === 'CONTEXT_TOO_LONG'
      ? t('transcribe.status.llmSkippedTooLong')
      : t('transcribe.status.llmError');

    return (
      <div className="float-panel-container" key="llm-error-container">
        <div className={`float-panel-wrapper error-state ${isHiding ? 'animate-slide-out' : 'animate-slide-in'}`}>
          <div className="status-area error">
            <div className="float-panel-content">
              <div className="status-row" key="llm-error-status-row">
                <span className="status-dot error" />
                <span className="status-text">{errorText}</span>
                <button
                  onClick={handleConfirmLlmError}
                  className="confirm-button"
                  title={t('transcribe.confirmError')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 【关键日志】渲染状态汇总
  log.debug(`[RENDER_SUMMARY] showProgress=${showProgress}, progress=${progress}, shouldTrack=${state.status === 'transcribing' && state.isTranscribing}`);

  return (
    <div className="float-panel-container">
      <div
        className={`float-panel-wrapper ${showFusedPanel ? 'expanded-mode' : 'pill-mode'} ${isHiding ? 'animate-slide-out' : 'animate-slide-in'}`}
      >
        {/* 预览区域 - 融合在药丸上方 */}
        {showFusedPanel && (
          <div className="preview-area" key="normal-preview-area">
            <div
              className={`preview-text height-${getPreviewHeight()}`}
              ref={previewTextRef}
              contentEditable={true}
              suppressContentEditableWarning={true}
              onInput={() => {
                // 标记用户已编辑（任何输入操作）
                hasUserEditedRef.current = true;
                isEditingRef.current = true;
                // 获取当前文本并更新 state
                const currentText = previewTextRef.current?.textContent || '';
                setPreviewText(currentText);
                // 防抖同步：清除之前的定时器，重新设置
                if (syncTimeoutRef.current) {
                  clearTimeout(syncTimeoutRef.current);
                }
                syncTimeoutRef.current = window.setTimeout(() => {
                  invoke('update_preview_text', { text: currentText })
                    .then(() => log.debug(`[Sync] Debounced sync: ${currentText.length} chars`))
                    .catch((e) => log.error(`[Sync] Failed to sync: ${e}`));
                  syncTimeoutRef.current = null;
                }, 100);
              }}
              onFocus={async () => {
                log.debug('[预览编辑] 用户进入编辑状态');
                isEditingRef.current = true;
                // 让窗口获得焦点，这样才能接收键盘输入
                try {
                  const win = getCurrentWindow();
                  await win.setFocusable(true);
                  await win.setFocus();
                  log.debug('[预览编辑] 窗口已获得焦点');
                } catch (e) {
                  log.error(`[预览编辑] 无法让窗口获得焦点: ${e}`);
                }
              }}
              onBlur={async () => {
                log.debug('[预览编辑] 用户离开编辑状态');
                isEditingRef.current = false;
                // 恢复窗口为不可聚焦状态，避免影响主窗口
                try {
                  const win = getCurrentWindow();
                  await win.setFocusable(false);
                  log.debug('[预览编辑] 窗口已恢复为不可聚焦');
                } catch (e) {
                  log.error(`[预览编辑] 无法恢复窗口状态: ${e}`);
                }
                // 从 DOM 读取当前文本内容并更新 state（触发重新渲染以更新字数徽章等）
                const currentText = previewTextRef.current?.textContent || '';
                setPreviewText(currentText);
                }}
            />
          </div>
        )}

        {/* 分隔线 - 联动元素 */}
        {showFusedPanel && <div className="divider-line" />}

        {/* 状态区域 - 原药丸内容 */}
        {/* 在调整窗口过程中隐藏状态栏，避免位置跳动 */}
        {!hideStatusBar && (
          <div className={`status-area ${showFusedPanel ? 'fused' : ''}`}>
          {/* 进度背景 - 使用 transform: scaleX 实现，不依赖父元素宽度计算 */}
          {showProgress && (
            <div
              className="progress-bg"
              style={{
                transform: `scaleX(${progress / 100})`,
                transformOrigin: 'left center',
              }}
            />
          )}

          <div className="float-panel-content">
            <div className="status-row">
              {showCancelButton && (
                <button
                  onClick={handleCancelRecording}
                  className="cancel-button"
                  title={t('transcribe.cancelRecording')}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* 折叠/展开按钮 - 录音时始终显示，无内容时禁用 */}
              {showCancelButton && (
                <button
                  onClick={togglePreviewCollapsed}
                  className="collapse-toggle-button"
                  disabled={!hasPreviewContent}
                  title={hasPreviewContent
                    ? (previewCollapsed ? t('transcribe.expandPreview') : t('transcribe.collapsePreview'))
                    : t('transcribe.noPreviewContent')
                  }
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {previewCollapsed ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    )}
                  </svg>
                </button>
              )}

              {/* 字数徽章 - 录音时始终显示，无内容时显示 0 */}
              {showCancelButton && (
                <span className={`preview-count-badge ${!hasPreviewContent ? 'empty' : ''}`}>
                  {countWords(previewText)}
                </span>
              )}

              <span className={`status-dot ${actualDotClass}`} />
              <span className="status-text">{statusConfig.text}</span>
            </div>

            {showWaveform && <Waveform isActive={waveformActive} />}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}