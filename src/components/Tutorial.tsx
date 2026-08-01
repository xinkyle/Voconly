import { useEffect, useRef } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface TutorialProps {
  onComplete: () => void;
}

// Custom styles for driver.js to match Voconly design
const customStyles = `
  .driver-overlay {
    background-color: rgba(0, 0, 0, 0.5);
  }
  .driver-popover {
    background: white;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
    padding: 24px;
    max-width: 340px;
  }
  .driver-popover-title {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 10px;
  }
  .driver-popover-description {
    font-size: 14px;
    color: #666;
    line-height: 1.6;
    margin-bottom: 16px;
  }
  .driver-popover-progress-text {
    font-size: 12px;
    color: #999;
    margin-bottom: 12px;
  }
  .driver-popover-navigation-btns {
    gap: 10px;
    display: flex;
    justify-content: flex-end;
  }
  .driver-popover-prev-btn {
    background: transparent;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .driver-popover-prev-btn:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
    color: #374151;
  }
  .driver-popover-next-btn {
    background: #1f2937;
    border: none;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(31, 41, 55, 0.3);
  }
  .driver-popover-next-btn:hover {
    background: #111827;
    box-shadow: 0 4px 12px rgba(31, 41, 55, 0.4);
    transform: translateY(-1px);
  }
  .driver-popover-close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: #9ca3af;
    transition: all 0.2s ease;
  }
  .driver-popover-close-btn:hover {
    background: #f3f4f6;
    color: #6b7280;
  }
  .driver-popover-footer {
    padding-top: 12px;
    border-top: 1px solid #f3f4f6;
  }
`;

const TUTORIAL_STEPS = [
  {
    element: '#voice-model-area',
    popover: {
      title: '语音模型',
      description: '语音模型用于本地语音转文本，支持多种模型选择',
      side: 'bottom' as const,
    },
  },
  {
    element: '#llm-config-button',
    popover: {
      title: 'LLM 配置',
      description: 'LLM配置可以对语音识别结果进一步处理，支持润色、翻译、总结等操作',
      side: 'bottom' as const,
    },
  },
  {
    element: '#shortcut-area',
    popover: {
      title: '快捷键',
      description: '快速访问常用操作的快捷键设置，一键启动语音识别',
      side: 'bottom' as const,
    },
  },
  {
    element: '#scene-card-1',
    popover: {
      title: '多场景配置',
      description: '可以配置多个场景，每个场景独立设置模型、快捷键和LLM处理方式',
      side: 'bottom' as const,
    },
  },
];

export function Tutorial({ onComplete }: TutorialProps) {
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    // Inject custom styles
    const styleElement = document.createElement('style');
    styleElement.textContent = customStyles;
    document.head.appendChild(styleElement);

    // Create driver instance
    const driverInstance = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.5)',
      steps: TUTORIAL_STEPS,
      onDestroyStarted: () => {
        // Call onComplete to save config and close tutorial
        onComplete();
        driverInstance.destroy();
      },
    });

    driverRef.current = driverInstance;

    // Start after delay to let UI settle
    const timer = setTimeout(() => {
      driverInstance.drive();
    }, 500);

    return () => {
      clearTimeout(timer);
      if (driverRef.current) {
        driverRef.current.destroy();
      }
      document.head.removeChild(styleElement);
    };
  }, [onComplete]);

  return null;
}