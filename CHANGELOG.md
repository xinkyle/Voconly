# Changelog

## [0.5.12] - 2026-09-23

### 新功能
1. **文件转录功能**，新增文件转录功能，支持大文件自动分割转录，支持多种音频格式自动转换，在待转录界面显示最近转录记录，支持一键复制转录结果。

2. **AI 服务快捷开关**，首页顶部新增 AI 服务开关按钮（闪电图标），可快速启用/禁用 LLM 后处理功能，状态持久化保存。

### 体验优化
3. **快捷键卡片支持多键组合**，首页快捷键卡片现在支持显示多键组合（如右Alt+/），显示更加清晰。

4. **文件转录界面优化**，统一选择文件卡片与上传区域风格，视觉更加一致；优化进度条显示和配色，状态一目了然。

5. **组合键交互优化**，修复组合键误触发双击检测的问题，避免意外跳过 LLM 处理。

6. **按钮样式统一**，统一开始转录按钮样式并居中显示，视觉更加协调。

---

### New Features
1. **File transcription** - Added file transcription feature with auto-split for large files, auto-convert for various audio formats, recent transcription records display, and one-click copy support.

2. **AI service toggle** - Added AI service toggle button (lightning icon) on home page header to quickly enable/disable LLM post-processing, with persistent state storage.

### Improvements
3. **Shortcut card supports multi-key combinations** - Home shortcut card now displays multi-key combinations (e.g., RightAlt+/) more clearly.

4. **File transcription interface optimized** - Unified file selection card and upload area style for visual consistency; Improved progress bar display and colors for clear status indication.

5. **Combo key interaction improved** - Fixed combo key mistakenly triggering double-click detection, preventing accidental LLM skip.

6. **Button style unified** - Unified start transcription button style and centered it for better visual harmony.

===

## [0.5.11] - 2026-09-16

### 体验优化
1. **进度条时间预估优化**，调整默认预估时间为更保守的值，避免初次使用时显示过短时间导致等待焦虑。

2. **双击快捷键动效优化**，优化双击跳过 LLM 时的进度条动画效果，交互更加流畅自然。

3. **麦克风提示优化**，优化麦克风权限下方的提示内容，更加清晰易懂。

4. **Logo 显示统一**，统一各处 Logo 颜色显示，移除关于页面的灰度滤镜，视觉一致性更好。

5. **苹果安装引导**，添加 macOS 安装指导说明，帮助新用户快速完成安装配置。

---

### Improvements
1. **Progress bar time estimation optimized** - Adjusted default estimates to more conservative values, avoiding the anxiety of showing overly short times for new users.

2. **Double-click shortcut animation improved** - Optimized progress bar animation when double-clicking to skip LLM processing, making interactions smoother and more natural.

3. **Microphone prompt optimized** - Improved the prompt content below microphone permissions for better clarity.

4. **Logo display unified** - Unified Logo color display across the app, removed grayscale filter from About page for better visual consistency.

5. **macOS installation guide added** - Added macOS installation instructions to help new users complete setup quickly.

===

## [0.5.10] - 2026-09-12

### 新功能
1. **macOS 版本发布**，正式支持 Apple Silicon (M1/M2/M3) 芯片，提供原生 arm64 版本。

2. **macOS 自动更新**，支持应用内检测并安装新版本，与 Windows 版本保持一致的更新体验。

---

### New Features
1. **macOS Release** - Official support for Apple Silicon (M1/M2/M3) chips, providing native arm64 build.

2. **macOS Auto-Update** - Support for in-app update detection and installation, bringing the same update experience as the Windows version.

===

## [0.5.9] - 2026-09-11

### 体验优化
1. **药丸进度条背景优化**，进度条背景色调浅，视觉上更加柔和，提升整体视觉舒适度。

2. **双击延时优化**，优化双击识别的延时参数，提升交互响应体验。

3. **启动体验优化**，移除启动时的弹窗提示，启动过程更加流畅。

### 问题修复
4. **修复词典编辑问题**，修复词典词条无法编辑的问题，恢复正常编辑功能。

---

### Improvements
1. **Pill progress bar background optimized** - Lighter background color for a softer look, improving overall visual comfort.

2. **Double-click delay optimized** - Adjusted double-click recognition timing for better interaction responsiveness.

3. **Startup experience improved** - Removed startup popup, making the launch process smoother.

### Bug Fixes
4. **Fixed dictionary editing issue** - Fixed the problem where dictionary entries could not be edited, restoring normal editing functionality.

===