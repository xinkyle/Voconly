import { useState, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createLogger } from '../services/log';

// 创建日志记录器
const log = createLogger('PreviewWindow');

interface PreviewTextPayload {
  fullText: string;
  segmentText: string;
}

export default function PreviewWindowApp() {
  log.info('===== PreviewWindowApp component mounting =====');
  log.info('Current window label: "preview" (expected)');

  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  // 获取当前窗口并打印信息
  const currentWindow = getCurrentWindow();
  log.info('getCurrentWindow() returned window object');
  log.info('Window label: ' + currentWindow.label);

  // 监听预览文字更新事件
  useEffect(() => {
    log.info('===== Setting up preview-text-update listener =====');
    log.info('Using getCurrentWindow().listen() for event: preview-text-update');

    const setupListener = async () => {
      try {
        log.info('Calling currentWindow.listen()...');
        const unlisten = await currentWindow.listen<PreviewTextPayload>('preview-text-update', (event) => {
          log.info('===== RECEIVED preview-text-update event =====');
          log.info('Event payload: fullText=' + event.payload.fullText.length + ' chars');
          log.info('Event payload content: "' + event.payload.fullText + '"');
          setText(event.payload.fullText);
          setVisible(true);
          setIsHiding(false);
        });
        log.info('preview-text-update listener registered SUCCESSFULLY');
        log.info('unlisten function type: ' + typeof unlisten);
        return unlisten;
      } catch (err) {
        log.error('===== FAILED to setup preview-text-update listener =====');
        log.error('Error: ' + err);
        return () => {};
      }
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((f) => {
        log.info('Cleaning up preview-text-update listener');
        f();
      });
    };
  }, []);

  // 监听预览窗口隐藏事件
  useEffect(() => {
    log.info('===== Setting up preview-window-hide listener =====');

    const setupListener = async () => {
      try {
        const unlisten = await currentWindow.listen<void>('preview-window-hide', () => {
          log.info('===== RECEIVED preview-window-hide event =====');
          setIsHiding(true);
          // 动画结束后隐藏
          setTimeout(() => {
            setVisible(false);
            setIsHiding(false);
            setText('');
            log.info('Preview window hidden and text cleared');
          }, 150);
        });
        log.info('preview-window-hide listener registered SUCCESSFULLY');
        return unlisten;
      } catch (err) {
        log.error('===== FAILED to setup preview-window-hide listener =====');
        log.error('Error: ' + err);
        return () => {};
      }
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((f) => {
        log.info('Cleaning up preview-window-hide listener');
        f();
      });
    };
  }, []);

  // 监听预览窗口显示事件（用于初始化）
  useEffect(() => {
    log.info('===== Setting up preview-window-show listener =====');

    const setupListener = async () => {
      try {
        const unlisten = await currentWindow.listen<void>('preview-window-show', () => {
          log.info('===== RECEIVED preview-window-show event =====');
          setVisible(true);
          setIsHiding(false);
        });
        log.info('preview-window-show listener registered SUCCESSFULLY');
        return unlisten;
      } catch (err) {
        log.error('===== FAILED to setup preview-window-show listener =====');
        log.error('Error: ' + err);
        return () => {};
      }
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((f) => {
        log.info('Cleaning up preview-window-show listener');
        f();
      });
    };
  }, []);

  // 自动滚动到最新文字
  useEffect(() => {
    if (textRef.current && text) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [text]);

  log.info('===== Preview window render =====');
  log.info('visible=' + visible + ', text="' + text + '"');

  if (!visible) {
    log.info('Not rendering (visible=false)');
    return null;
  }

  log.info('Rendering preview window with text');
  return (
    <div className="preview-container">
      <div className={`preview-window ${isHiding ? 'animate-fade-out' : 'animate-fade-in'}`}>
        <div className="preview-text" ref={textRef}>
          {text || (
            <span className="preview-empty">等待转录...</span>
          )}
        </div>
      </div>
    </div>
  );
}