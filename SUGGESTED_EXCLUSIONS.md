# 建议排除的文件和目录清单

> 此文件用于记录建议从 Git 版本管理中排除的文件和目录，请确认后再添加到 .gitignore

## 一、必须排除（安全/敏感信息）

### 1. Tauri 签名私钥 ⚠️ **高危**
```
.tauri/signing.key
```
**原因**: 这是 Tauri 应用的签名私钥，泄露后任何人都可以签署恶意更新包。
**现状**: .gitignore 中已有，但请确认此文件**从未被提交到 Git 历史**中。

---

## 二、建议排除（构建产物/二进制文件）

### 2. prebuilt 目录中的 .lib 文件
```
prebuilt/whisper-cpp/windows-vulkan/*.lib
```
**文件列表**:
- ggml-base.lib (5.0 MB)
- ggml-cpu.lib (2.8 MB)
- ggml-vulkan.lib (55.9 MB)
- ggml.lib (0.7 MB)
- whisper.lib (6.0 MB)

**原因**: 这些是编译后的静态库文件，总计约 70MB，不应上传到 Git。
**现状**: .gitignore 中已有 `prebuilt/whisper-cpp/**/*.lib`

### 3. src-tauri/binaries 目录
```
src-tauri/binaries/libomp140.x86_64.dll
```
**原因**: OpenMP 运行时 DLL，约 620KB，属于第三方依赖，不应上传。
**建议**: 应通过脚本在构建时下载。

### 4. src-tauri/resources/python-runtime 目录
```

### 6. src-tauri/test_matcher.pdb
```
src-tauri/test_matcher.pdb
```
**原因**: PDB 是 Windows 调试符号文件，约 1.3MB，不应上传。

### 7. src-tauri/nul
```
src-tauri/nul
```
**原因**: Windows 保留设备名，不应该存在此文件。
**现状**: .gitignore 中已有。

---

## 三、建议排除（IDE/工具配置）



### 15. 根目录临时文件
```
logo_base64.txt
task.json
project.json
TRANSCRIBE_CPP_FIX.md
```
**原因**:
- `logo_base64.txt` - Logo 的 Base64 编码，临时文件（未使用）
- `task.json`, `project.json` - 任务配置，可能是临时的
- `TRANSCRIBE_CPP_FIX.md` - 技术文档，可能不需要提交

**注意**: `float.html` 和 `preview.html` 是应用核心文件（浮动面板和预览窗口入口），**必须保留**。

### 16. website 目录（如不需要）
```
website/
```
**原因**: 如果这是独立的网站项目，可能应该放在单独的仓库中。
**建议**: 根据实际情况决定是否保留。

---

## 五、现有 .gitignore 已包含但需确认的项目

以下项目已在 .gitignore 中，确认是否正确配置：

1. ✅ `.worktrees/` - Git 工作树目录
2. ✅ `.claude/` - Claude Code 配置
3. ✅ `.tauri/signing.key` - 签名私钥
4. ✅ `node_modules/` - Node.js 依赖
5. ✅ `src-tauri/target/` - Rust 构建输出
6. ✅ `dist/` - 前端构建输出
7. ✅ `*.exe`, `*.dll`, `*.pdb` - 可执行文件
8. ✅ `build/whisper.cpp-src/` - Whisper 源码
9. ✅ `prebuilt/*.zip` - 下载的压缩包
10. ✅ `models/` - AI 模型文件
11. ✅ `packages/` - 依赖包
12. ✅ `tokens/` - API tokens

---

## 六、建议添加到 .gitignore 的内容

```gitignore
# ==================== 新增建议 ====================

# OpenMP DLL（第三方依赖）
src-tauri/binaries/

# 根目录临时文件
logo_base64.txt
task.json
project.json

# 测试报告
test/*-report.md

# ==================== 已存在但确认 ====================
# .tauri/signing.key - 确认从未提交到历史
# test/ - 确认是本地测试目录
# float.html, preview.html - 核心文件，不要排除！
```

---

## 七、需要用户确认的问题

1. **website/** 目录是否需要提交？如果是独立项目，建议分离。

2. **patches/** 目录：
   - `patches/transcribe-rs-0.3.2/` - 这是补丁目录，通常需要提交
   - 请确认是否需要保留

3. **docs/** 目录：
   - 包含 analysis, design, plans, solutions 子目录
   - 请确认是否需要提交这些文档

4. **release/** 目录：
   - 仅包含 `version.json.template`
   - 模板文件通常需要提交，请确认

5. **scripts/** 目录：
   - 脚本文件通常需要提交
   - 请确认是否为空

---

## 八、文件大小统计（需要排除的大文件）

| 路径 | 大小 | 类型 |
|------|------|------|
| prebuilt/whisper-cpp/windows-vulkan/*.lib | ~70 MB | 静态库 |
| src-tauri/resources/python-runtime/ | ~15+ MB | Python 运行时 |
| src-tauri/resources/models/*.onnx | ~5 MB | ONNX 模型 |
| src-tauri/binaries/libomp140.x86_64.dll | 0.6 MB | DLL |
| src-tauri/test_matcher.pdb | 1.3 MB | 调试符号 |

**总计需排除**: 约 90+ MB

---

生成时间: 2026-07-21