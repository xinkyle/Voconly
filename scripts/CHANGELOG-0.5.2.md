# Changelog

## [0.5.2] - 2025-09-01

### 修复
1. **修复应用启动后托盘显示麦克风图标**，恢复 `preinit_audio_capture` 只加载 VAD 模型不预打开麦克风，避免应用启动后系统托盘显示麦克风正在使用的图标。

2. **修复流式模式录音停止报错**，流式模式下音频已通过流式转录实时处理，不再检查音频数据是否为空。

---

### Bug Fixes
1. **Fixed microphone icon showing in system tray on startup** - Restored `preinit_audio_capture` to only load VAD model without opening microphone, preventing the microphone-in-use indicator from appearing in system tray after app launch.

2. **Fixed streaming mode recording stop error** - In streaming mode, audio is processed in real-time, so empty audio check is skipped.

### 优化
1. **移除录音文件保存功能**，删除 `debug_audio` 模块，减少内存复制和磁盘 I/O 开销，录音停止后立即返回。

---

### Improvements
1. **Removed audio file saving** - Deleted `debug_audio` module to reduce memory copy and disk I/O overhead. Recording stops immediately without background file saving.