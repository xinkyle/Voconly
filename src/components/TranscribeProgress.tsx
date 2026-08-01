/**
 * TranscribeProgress Component
 * 显示转录进度条和预估时间
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { estimateTranscribeTime, EstimateTimeResponse } from '../services/performance';

interface TranscribeProgressProps {
  modelId: string;
  device: 'CPU' | 'GPU';
  audioDuration: number;
  isTranscribing: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * 计算匀速进度
 * 从 0% 匀速增长到 100%
 */
function calculateProgress(elapsed: number, estimatedTime: number): number {
  if (estimatedTime <= 0) {
    // 没有预估时间，显示不确定的活跃状态（缓慢增长到90%）
    return Math.min(90, elapsed / 1000 * 10);
  }

  const ratio = elapsed / estimatedTime;
  // 线性进度，最高到95%等待完成
  return Math.min(95, ratio * 100);
}

/**
 * 格式化时间显示
 */
function formatTime(seconds: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (seconds < 60) {
    return t('transcribe.seconds', { count: Math.round(seconds) });
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return t('transcribe.minutes', { minutes, seconds: remainingSeconds });
}

export function TranscribeProgress({
  modelId,
  device,
  audioDuration,
  isTranscribing,
  onComplete,
  className = '',
}: TranscribeProgressProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimateInfo, setEstimateInfo] = useState<EstimateTimeResponse | null>(null);

  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  // 计算预估时间
  useEffect(() => {
    const info = estimateTranscribeTime(modelId, device, audioDuration);
    setEstimatedTime(info.estimatedTime);
    setEstimateInfo(info);

    console.log(
      `[TranscribeProgress] Estimated: ${info.estimatedTime.toFixed(2)}s, ` +
        `hasData: ${info.hasSufficientData}, samples: ${info.samples}`
    );
  }, [modelId, device, audioDuration]);

  // 启动进度更新
  useEffect(() => {
    if (isTranscribing && !completedRef.current) {
      startTimeRef.current = Date.now();
      completedRef.current = false;

      intervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const elapsedSeconds = elapsed / 1000;
        setElapsedTime(elapsedSeconds);

        const newProgress = calculateProgress(elapsed, estimatedTime);
        setProgress(newProgress);
      }, 50);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTranscribing, estimatedTime]);

  // 监听转录完成
  useEffect(() => {
    if (!isTranscribing && elapsedTime > 0 && !completedRef.current) {
      // 转录完成了
      completedRef.current = true;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // 跳到100%
      setProgress(100);

      // 延迟调用 onComplete
      if (onComplete) {
        setTimeout(() => {
          onComplete();
        }, 200);
      }
    }
  }, [isTranscribing, elapsedTime, onComplete]);

  // 如果没有在转录，不显示组件
  if (!isTranscribing && progress === 0) {
    return null;
  }

  return (
    <div className={`transcribe-progress ${className}`}>
      {/* 进度条 */}
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-100 ease-out"
          style={{ width: `${progress}%` }}
        />
        {/* 动画效果 */}
        {isTranscribing && progress < 95 && (
          <div className="absolute top-0 left-0 h-full w-full animate-pulse">
            <div className="absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-white/30 to-transparent" />
          </div>
        )}
      </div>

      {/* 信息显示 */}
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {t('transcribe.recognizing')}
          </span>
          {estimateInfo && (
            <span className="text-gray-400">
              {estimateInfo.hasSufficientData
                ? t('transcribe.recorded', { count: estimateInfo.samples })
                : t('transcribe.learning')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {estimatedTime > 0 && (
            <>
              <span>
                {t('transcribe.elapsed')}: {formatTime(elapsedTime, t)}
              </span>
              <span className="text-gray-400">/</span>
              <span>
                {t('transcribe.estimated')}: {formatTime(estimatedTime, t)}
              </span>
            </>
          )}
          <span className="font-medium text-blue-600">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
}

export default TranscribeProgress;