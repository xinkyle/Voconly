import React from 'react';
import ReactDOM from 'react-dom/client';
import FloatPanelApp from './components/FloatPanelApp';
import { createLogger } from './services/log';
import './i18n'; // 初始化 i18n
import './float-styles.css';

// 创建日志记录器
const log = createLogger('FloatMain');

// Prevent context menu
document.addEventListener('contextmenu', (e) => e.preventDefault());

log.debug('Float panel window starting...');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FloatPanelApp />
  </React.StrictMode>
);