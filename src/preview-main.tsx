import React from 'react';
import ReactDOM from 'react-dom/client';
import PreviewWindowApp from './components/PreviewWindowApp';
import { createLogger } from './services/log';
import './preview-styles.css';

// 创建日志记录器
const log = createLogger('PreviewMain');

// Prevent context menu
document.addEventListener('contextmenu', (e) => e.preventDefault());

log.debug('===== PREVIEW WINDOW MAIN ENTRY =====');
log.debug('preview-main.tsx executing');
log.debug('Window location: ' + window.location.href);

// 检查 root 元素是否存在
const rootElement = document.getElementById('root');
log.debug('Root element exists: ' + (rootElement ? 'YES' : 'NO'));

if (!rootElement) {
  log.error('CRITICAL: No root element found! Preview window cannot render.');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreviewWindowApp />
  </React.StrictMode>
);

log.debug('Preview window React root created');