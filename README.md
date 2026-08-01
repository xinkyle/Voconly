# Voconly

本地语音转文字桌面应用，基于 Tauri + React + Whisper

## 环境要求

- Windows 10/11
- [Rust](https://rustup.rs/) 1.70+
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- (可选) [Vulkan SDK](https://vulkan.lunarg.com/) - 用于 GPU 加速

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/xinkyle/Voconly.git
cd Voconly
```

### 2. 运行安装脚本

```powershell
.\setup.ps1
```

该脚本会自动：
- 检查并安装 Rust、Node.js、pnpm（如果缺失）
- 检测 GPU 并配置 Vulkan SDK
- 下载预编译的 Whisper 库
- 安装 npm 依赖

### 3. 开发模式

```powershell
.\start-dev.ps1
```

### 4. 构建发布版本

```powershell
pnpm tauri build
```

## 路径超长问题？

Windows 默认有 260 字符路径限制。如果遇到路径超长错误：

### 方案 1：将项目放在短路径下（推荐）

```powershell
# 避免路径过长
C:\dev\Voconly          # ✅ 好
D:\work\Voconly         # ✅ 好
C:\Users\用户名\Documents\项目\Voconly  # ❌ 可能超长
```

### 方案 2：启用 Windows 长路径支持

```powershell
# 管理员权限运行
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
    -Name "LongPathsEnabled" -Value 1

# 重启电脑使更改生效
```

详见：[Microsoft 文档](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation)

## 故障排查

详见 [docs](docs/) 目录。

## 正在开发中...

此项目正在积极开发中，功能可能随时变化。