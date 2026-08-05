# Voconly GGUF 模型管理架构调整方案

> **版本**: v1.0
> **日期**: 2025-08-05
> **目标**: 参考 Handy 最佳实践，实现 GGUF 模型能力的自动发现和零配置使用

---

## 目录

- [一、核心问题诊断](#一核心问题诊断)
- [二、设计理念重构](#二设计理念重构)
- [三、目标架构](#三目标架构)
- [四、完整工作流程](#四完整工作流程)
- [五、三层验证机制详解](#五三层验证机制详解)
- [六、数据结构设计](#六数据结构设计)
- [七、核心逻辑实现](#七核心逻辑实现)
- [八、实施步骤](#八实施步骤)
- [九、关键代码调整](#九关键代码调整)
- [十、验证和测试](#十验证和测试)

---

## 一、核心问题诊断

### 1.1 当前设计的问题

#### 问题 1：能力来源混乱

```
当前 Voconly 的能力来源：
┌─────────────────────────────────────┐
│ 流式支持：从 GGUF 元数据读取 ✅      │
│ 自动检测：从 GGUF 元数据读取 ✅      │
│ 语言列表：从预设文件读取 ❌          │ ← 矛盾点
└─────────────────────────────────────┘

问题：
- 用户下载新 GGUF 模型 → 语言列表为空或不正确
- 必须手动添加预设 → 才能正常使用
- 社区模型 → 无法自动识别语言支持
```

#### 问题 2：预设文件依赖过重

```
当前工作流程：
用户下载新模型
    ↓
系统扫描到模型文件
    ↓
查找预设文件匹配 ❌
    ↓
如果找不到预设：
    - 语言列表为空或错误
    - 功能不完整
    ↓
用户必须手动添加预设 ← 体验差
```

#### 问题 3：无法零配置使用

```
场景：用户从 HuggingFace 下载新模型
期望：放入目录即可使用
现实：
    1. 放入 gguf 文件
    2. 扫描发现模型
    3. 语言列表错误 ❌
    4. 需要修改代码添加预设 ❌
    5. 重新编译 ❌

结果：用户体验极差
```

### 1.2 根本原因

**设计理念错误**：
- 假设：预设文件是能力的可靠来源
- 现实：GGUF 元数据才是模型的真实能力
- 后果：预设过时、缺失、错误都会导致功能异常

**架构缺陷**：
```
错误的设计：
预设文件 → 决定模型能力 → 运行时使用

正确的设计：
GGUF 文件 → 声明能力 → 运行时验证 → 真实能力
```

---

## 二、设计理念重构

### 2.1 核心原则

```
原则 1：GGUF 文件是唯一真实来源
    - 模型文件自带完整能力声明
    - 元数据是模型作者的意图
    - 代码逻辑必须基于真实能力

原则 2：零配置即插即用
    - 下载 GGUF = 立即可用
    - 不需要预设文件
    - 不需要手动配置

原则 3：能力自动发现
    - 从 GGUF Header 读取初始能力
    - 运行时验证真实能力
    - 自动更新内存中的能力信息
```

### 2.2 三层验证架构

```
┌─────────────────────────────────────────────────────┐
│          第 1 层：Catalog 声明（下载前）             │
│  来源：预设文件（asr.rs）                            │
│  作用：UI 展示，用户决策                            │
│  可信度：⭐⭐（可能过时）                            │
│  是否保存：❌ 不保存                                 │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│          第 2 层：GGUF Header 探测（下载后）         │
│  来源：本地 GGUF 文件头部（前 64KB）                │
│  作用：验证预设的准确性                             │
│  可信度：⭐⭐⭐⭐（文件自己说的）                    │
│  是否保存：✅ 保存到 ModelPreset                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│          第 3 层：运行时验证（加载时）               │
│  来源：transcribe-cpp 模型实例                      │
│  作用：获取绝对真实的能力                           │
│  可信度：⭐⭐⭐⭐⭐（100% 准确）                    │
│  是否保存：✅ 更新 ModelPreset                      │
└─────────────────────────────────────────────────────┘
```

---

## 三、目标架构

### 3.1 整体架构图

```
┌────────────────────────────────────────────────────────────┐
│                      用户操作                               │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│              第 1 步：Catalog 展示                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  预设文件（asr.rs）                                   │ │
│  │  - ID、名称、描述                                     │ │
│  │  - 语言列表（可能过时）                               │ │
│  │  - 能力声明（可能过时）                               │ │
│  │                                                      │ │
│  │  用途：仅用于 UI 展示，不用于运行时决策               │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────┬─────────────────────────────────────┘
                       │ 用户下载模型
                       ▼
┌────────────────────────────────────────────────────────────┐
│              第 2 步：GGUF Header 探测                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  读取 GGUF 文件头部（前 64KB）                        │ │
│  │                                                      │ │
│  │  提取元数据：                                        │ │
│  │  - general.languages: ["en", "zh"]                  │ │
│  │  - stt.capability.streaming: true                   │ │
│  │  - stt.capability.lang_detect: true                 │ │
│  │  - stt.capability.translate: false                  │ │
│  │                                                      │ │
│  │  动作：更新 ModelPreset 的能力字段                   │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────┬─────────────────────────────────────┘
                       │ 用户开始使用模型
                       ▼
┌────────────────────────────────────────────────────────────┐
│              第 3 步：运行时验证                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  加载模型到内存                                      │ │
│  │  Session::load(model_path)                          │ │
│  │                                                      │ │
│  │  从模型实例读取真实能力：                            │ │
│  │  let caps = session.model().capabilities();         │ │
│  │                                                      │ │
│  │  强制更新 ModelPreset：                              │ │
│  │  - 覆盖之前的所有声明                                │ │
│  │  - 确保能力 100% 准确                                │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────┬─────────────────────────────────────┘
                       │ 根据能力决策
                       ▼
┌────────────────────────────────────────────────────────────┐
│              第 4 步：能力驱动的决策                        │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  判断 1：是否支持流式？                              │ │
│  │    if supports_streaming:                            │ │
│  │      → 启动流式转录                                  │ │
│  │    else:                                             │ │
│  │      → 使用批量转录                                  │ │
│  │                                                      │ │
│  │  判断 2：用户语言选择                                │ │
│  │    if user_selected_language == "auto":              │ │
│  │      if supports_language_detect:                    │ │
│  │        → 让模型自动检测                              │ │
│  │      else:                                           │ │
│  │        → 强制回退到英语                              │ │
│  │    else:                                             │ │
│  │      → 使用用户指定的语言                            │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 3.2 数据流图

```
┌──────────────┐
│ 预设文件     │
│ (asr.rs)     │
└──────┬───────┘
       │
       │ 下载前展示
       │
       ▼
┌──────────────┐
│ UI 显示      │ ← 第 1 次能力信息（可能过时）
│ "支持 3 种语言"│
└──────┬───────┘
       │
       │ 用户下载
       │
       ▼
┌──────────────┐
│ GGUF 文件    │
│ (实际模型)   │
└──────┬───────┘
       │
       │ 读取 Header
       │
       ▼
┌──────────────┐
│ ModelPreset  │ ← 第 2 次能力信息（文件声明）
│ 更新能力     │
└──────┬───────┘
       │
       │ 用户使用
       │
       ▼
┌──────────────┐
│ 加载模型     │
│ 验证能力     │
└──────┬───────┘
       │
       │ 更新 ModelPreset
       │
       ▼
┌──────────────┐
│ 最终能力     │ ← 第 3 次能力信息（100% 准确）
│ 用于决策     │
└──────────────┘
```

---

## 四、完整工作流程

### 4.1 场景 1：用户下载预设模型

```
第 1 步：浏览 Catalog
┌─────────────────────────────────────┐
│ UI 显示（来自预设文件）：            │
│ 模型：Qwen3-ASR 0.6B                │
│ 语言：中文、英语                    │
│ 流式：支持 ✅                        │
│ 自动检测：支持 ✅                    │
│ [下载] 按钮                         │
└─────────────────────────────────────┘
数据来源：asr.rs（预设文件）
保存位置：无
状态：未下载

        ⬇️ 用户点击下载

第 2 步：下载 GGUF 文件
┌─────────────────────────────────────┐
│ 下载：qwen3-asr-0.6b-Q4_0.gguf      │
│ 保存到：~/Voconly/models/            │
│                                     │
│ 下载完成 → 触发 GGUF Header 探测    │
└─────────────────────────────────────┘

        ⬇️ 自动触发

第 3 步：读取 GGUF Header
┌─────────────────────────────────────┐
│ 打开文件（只读前 64KB）             │
│                                     │
│ 读取到：                            │
│ general.architecture: "qwen3_asr"  │
│ general.languages: ["zh","en","ja"]│
│ stt.capability.streaming: true     │
│ stt.capability.lang_detect: true   │
│                                     │
│ 对比预设：                          │
│ ✅ 语言列表一致                     │
│ ✅ 流式支持一致                     │
│ ✅ 自动检测一致                     │
│                                     │
│ 更新 ModelPreset                    │
└─────────────────────────────────────┘
数据来源：GGUF 文件头部
保存位置：内存中的 ModelPreset
状态：已下载，未加载

        ⬇️ 用户选择模型并开始录音

第 4 步：加载模型到内存
┌─────────────────────────────────────┐
│ 加载完整模型文件                    │
│ 调用 transcribe-cpp 库              │
│                                     │
│ 获取真实能力：                      │
│ caps.languages: ["zh","en","ja"]   │
│ caps.supports_streaming: true      │
│ caps.supports_language_detect: true│
│                                     │
│ ✅ 更新 ModelPreset（最终确认）     │
└─────────────────────────────────────┘
数据来源：模型实例（transcribe-cpp）
保存位置：更新 ModelPreset
状态：已加载，可用

        ⬇️ 根据能力决策

第 5 步：能力驱动的转录路径
┌─────────────────────────────────────┐
│ 判断：supports_streaming == true   │
│   → 启动流式转录                    │
│   → 实时显示文字                    │
│                                     │
│ 判断：用户选择语言 == "auto"        │
│   → supports_language_detect == true│
│   → 让模型自动检测语言              │
└─────────────────────────────────────┘
```

### 4.2 场景 2：用户放入自定义 GGUF 模型

```
第 1 步：用户操作
┌─────────────────────────────────────┐
│ 用户从网上下载：                    │
│ voxtral-small-24k.gguf             │
│（Voconly 预设文件中没有这个模型）   │
│                                     │
│ 放入目录：~/Voconly/models/         │
└─────────────────────────────────────┘

        ⬇️ 应用启动时自动扫描

第 2 步：扫描本地目录
┌─────────────────────────────────────┐
│ 扫描：~/Voconly/models/*.gguf       │
│                                     │
│ 发现新文件：                        │
│ voxtral-small-24k.gguf              │
│                                     │
│ 触发 GGUF Header 读取               │
└─────────────────────────────────────┘

        ⬇️ 自动触发

第 3 步：读取 GGUF Header
┌─────────────────────────────────────┐
│ 读取元数据：                        │
│ general.architecture: "voxtral"    │
│ general.name: "Voxtral Small 24k"  │
│ general.languages: ["en"]          │
│ stt.capability.streaming: true     │
│ stt.capability.lang_detect: true   │
│                                     │
│ 创建 ModelPreset：                  │
│ id: "voxtral-small-24k"            │
│ name: "Voxtral Small 24k"          │
│ languages: ["en"]                  │
│ supports_streaming: true           │
│ supports_language_detection: true  │
│                                     │
│ ❌ 不需要预设文件                   │
└─────────────────────────────────────┘
数据来源：GGUF 文件头部
保存位置：内存中的 ModelPreset
状态：已发现，未加载

        ⬇️ 用户在 UI 看到新模型

第 4 步：UI 显示新模型
┌─────────────────────────────────────┐
│ 模型列表中出现：                    │
│ "Voxtral Small 24k"                 │
│ 语言：英语                          │
│ 流式：支持 ✅                        │
│ 自动检测：支持 ✅                    │
│                                     │
│ 后续流程同场景 1                    │
└─────────────────────────────────────┘
```

### 4.3 场景 3：预设与 GGUF 能力不一致

```
第 1 步：预设文件声明
┌─────────────────────────────────────┐
│ 预设文件（asr.rs）声明：            │
│ Qwen3-ASR:                          │
│   languages: ["zh", "en"]           │
│   supports_streaming: true          │
│   supports_language_detect: true    │
└─────────────────────────────────────┘

        ⬇️ 用户下载模型

第 2 步：GGUF Header 探测
┌─────────────────────────────────────┐
│ 读取 GGUF Header：                  │
│ general.languages: ["zh","en","ja"]│
│ stt.capability.streaming: true     │
│ stt.capability.lang_detect: true   │
│                                     │
│ 对比发现不一致：                    │
│ ❌ 预设说 2 种语言                  │
│ ✅ GGUF 说 3 种语言                 │
│                                     │
│ 决策：使用 GGUF 的真实值            │
│ 更新 ModelPreset.languages         │
└─────────────────────────────────────┘

        ⬇️ 用户开始使用

第 3 步：运行时验证
┌─────────────────────────────────────┐
│ 加载模型实例：                      │
│ caps.languages: ["zh","en","ja"]   │
│                                     │
│ ✅ 确认 GGUF Header 正确            │
│ ✅ 最终能力信息准确                 │
│                                     │
│ 结果：用户可以使用日语转录          │
│（预设文件缺失了）                   │
└─────────────────────────────────────┘
```

---

## 五、三层验证机制详解

### 5.1 第一层：Catalog 声明

#### 作用
- 下载前的 UI 展示
- 用户决策的参考信息
- **不用于运行时决策**

#### 数据来源
```rust
// src-tauri/src/presets/asr.rs
pub fn get_asr_presets() -> Vec<ModelPreset> {
    vec![
        ModelPreset {
            id: "qwen3-asr-0.6b".to_string(),
            name: "Qwen3-ASR 0.6B".to_string(),
            languages: vec!["zh".to_string(), "en".to_string()],
            supports_streaming: true,
            supports_language_detect: true,
            // ...
        },
        // ...
    ]
}
```

#### 可信度：⭐⭐
- 可能过时（模型更新了但预设没更新）
- 可能错误（人工维护容易出错）
- 可能缺失（新模型没有预设）

#### 是否保存：❌ 不保存
- 只用于展示，不持久化
- 用户下载后立即被 GGUF Header 覆盖

### 5.2 第二层：GGUF Header 探测

#### 触发时机
- 模型下载完成后
- 扫描本地模型目录时

#### 数据来源
```rust
// src-tauri/src/backends/gguf_capabilities.rs
pub fn probe_gguf_capabilities(path: &Path) -> GgufCapabilities {
    // 1. 尝试从 GGUF Header 读取
    if let Some(caps) = probe_from_gguf_header(path) {
        return caps;
    }

    // 2. Fallback: 从文件名推断
    probe_from_filename(path)
}

fn probe_from_gguf_header(path: &Path) -> Option<GgufCapabilities> {
    // 只读取文件头部（前 64KB）
    let meta = gguf_meta::parse_header(path, PROBE_KEYS)?;

    Some(GgufCapabilities {
        languages: meta.get_string_array("general.languages"),
        supports_streaming: meta.get_bool("stt.capability.streaming"),
        supports_language_detect: meta.get_bool("stt.capability.lang_detect"),
        // ...
    })
}
```

#### 可信度：⭐⭐⭐⭐
- 文件自己声明的能力
- 模型作者的意图
- 通常准确（除非 GGUF 元数据写错）

#### 是否保存：✅ 保存到 ModelPreset
- 更新内存中的能力信息
- 覆盖预设文件的声明

### 5.3 第三层：运行时验证

#### 触发时机
- 用户选择模型并开始使用时
- 首次加载模型时

#### 数据来源
```rust
// src-tauri/src/backends/transcribe_cpp.rs
impl TranscribeCppBackend {
    pub fn load(model_path: &Path) -> Result<Self> {
        // 加载模型到内存
        let session = Session::load(model_path, &options)?;

        // 从模型实例读取真实能力
        let caps = session.model().capabilities();

        // 返回能力信息
        Ok(Self {
            session,
            capabilities: GgufCapabilities {
                languages: Some(caps.languages),
                supports_streaming: Some(caps.supports_streaming),
                supports_language_detect: Some(caps.supports_language_detect),
                // ...
            },
        })
    }
}
```

#### 可信度：⭐⭐⭐⭐⭐
- 模型实例的真实能力
- 100% 准确
- 绝对可信

#### 是否保存：✅ 更新 ModelPreset
- 强制覆盖之前的所有声明
- 确保能力信息始终正确

---

## 六、数据结构设计

### 6.1 GgufCapabilities 结构体

```rust
/// GGUF 模型能力（从 GGUF Header 或模型实例读取）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GgufCapabilities {
    /// 兼容性判定
    pub verdict: Compatibility,

    /// 模型架构（如 "qwen3_asr", "whisper"）
    pub architecture: Option<String>,

    /// 支持的语言列表（如 ["zh", "en", "ja"]）
    /// None 表示未知或从 GGUF Header 读取失败
    pub languages: Option<Vec<String>>,

    /// 是否支持流式转录
    /// None 表示未知
    pub supports_streaming: Option<bool>,

    /// 是否支持翻译到英语
    /// None 表示未知
    pub supports_translation: Option<bool>,

    /// 是否支持自动语言检测
    /// None 表示未知
    pub supports_language_detect: Option<bool>,
}
```

### 6.2 ModelPreset 结构体

```rust
/// 模型预设（包含能力信息）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub backend: BackendType,

    // ⚠️ 核心能力字段（从 GGUF 读取，不从预设文件读取）
    pub languages: Vec<String>,                  // 语言列表
    pub supports_streaming: bool,                // 流式支持
    pub supports_language_detect: bool,          // 自动检测

    // 其他字段...
    pub download_url: Option<String>,
    pub file_size: u64,
    // ...
}
```

### 6.3 数据更新时机

```
┌─────────────────┬──────────────────────┬───────────────────┐
│ 字段            │ 初始值来源           │ 最终值来源        │
├─────────────────┼──────────────────────┼───────────────────┤
│ languages       │ 预设文件或 GGUF      │ GGUF 或模型实例   │
│ supports_       │ 预设文件或 GGUF      │ GGUF 或模型实例   │
│   streaming     │                      │                   │
│ supports_       │ 预设文件或 GGUF      │ GGUF 或模型实例   │
│   lang_detect   │                      │                   │
│ name, desc      │ 预设文件或 GGUF      │ 预设文件或 GGUF   │
│ download_url    │ 预设文件             │ 预设文件          │
└─────────────────┴──────────────────────┴───────────────────┘
```

---

## 七、核心逻辑实现

### 7.1 GGUF Header 探测逻辑

```rust
// src-tauri/src/backends/gguf_capabilities.rs

/// 从 GGUF 文件探测能力
pub fn probe_gguf_capabilities(path: &Path) -> GgufCapabilities {
    // 优先级 1：从 GGUF Header 读取
    if let Some(caps) = probe_from_gguf_header(path) {
        return caps;
    }

    // 优先级 2：从文件名推断（Fallback）
    probe_from_filename(path)
}

/// 从 GGUF Header 读取能力
fn probe_from_gguf_header(path: &Path) -> Option<GgufCapabilities> {
    // 读取文件头部（前 64KB）
    let meta = gguf_meta::parse_header(path, PROBE_KEYS)?;

    // 提取能力字段
    let architecture = meta.get_str("general.architecture").map(String::from);

    // ⚠️ 核心：从 GGUF 读取语言列表
    let languages = meta.get_string_array("general.languages");

    // 提取其他能力
    let supports_streaming = meta.get_bool("stt.capability.streaming");
    let supports_translation = meta.get_bool("stt.capability.translate");
    let supports_language_detect = meta.get_bool("stt.capability.lang_detect");

    // 判定兼容性
    let verdict = match architecture.as_deref() {
        Some(arch) if KNOWN_ARCHES.contains(&arch) => Compatibility::Compatible,
        _ => Compatibility::MaybeIncompatible,
    };

    Some(GgufCapabilities {
        verdict,
        architecture,
        languages,  // ⚠️ 从 GGUF 读取，不是从预设文件
        supports_streaming,
        supports_translation,
        supports_language_detect,
    })
}
```

### 7.2 模型扫描逻辑

```rust
// src-tauri/src/presets/asr_scanner.rs

/// 扫描单个目录
fn scan_single_directory(dir: &Path) -> Vec<ModelPreset> {
    let mut models = Vec::new();

    // 扫描目录中的文件
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();

        // 只处理 GGUF 文件
        if path.extension() != Some("gguf".as_ref()) {
            continue;
        }

        // ⚠️ 核心：读取 GGUF Header 获取能力
        let caps = probe_gguf_capabilities(&path);

        // 检查是否匹配预设（仅用于名称、描述等展示信息）
        let preset_info = find_matching_preset(&path);

        // 创建 ModelPreset
        let model = ModelPreset {
            id: preset_info.id.or_else(|| generate_id(&path)),
            name: preset_info.name.or_else(|| caps.architecture.clone())
                .or_else(|| filename_to_name(&path)),

            // ⚠️ 核心：使用 GGUF 的能力，不是预设文件的能力
            languages: caps.languages.unwrap_or_default(),
            supports_streaming: caps.supports_streaming.unwrap_or(false),
            supports_language_detect: caps.supports_language_detect.unwrap_or(false),

            // 其他字段...
            backend: BackendType::TranscribeCpp,
            download_url: preset_info.download_url,
            file_size: path.metadata()?.len(),
        };

        models.push(model);
    }

    models
}
```

### 7.3 运行时验证逻辑

```rust
// src-tauri/src/model_manager.rs

impl ModelManager {
    /// 加载模型并验证能力
    pub fn load_model(&mut self, model_id: &str) -> Result<()> {
        let model_path = self.get_model_path(model_id)?;

        // 加载模型到内存
        let session = Session::load(&model_path, &options)?;

        // ⚠️ 核心：从模型实例读取真实能力
        let caps = session.model().capabilities();

        // ⚠️ 核心：强制更新 ModelPreset 的能力字段
        self.update_model_capabilities(
            model_id,
            caps.languages.clone(),
            caps.supports_streaming,
            caps.supports_language_detect,
        );

        // 保存会话
        self.session = Some(session);

        Ok(())
    }

    /// 更新模型的能力信息
    fn update_model_capabilities(
        &mut self,
        model_id: &str,
        languages: Vec<String>,
        supports_streaming: bool,
        supports_language_detect: bool,
    ) {
        if let Some(model) = self.models.get_mut(model_id) {
            model.languages = languages;
            model.supports_streaming = supports_streaming;
            model.supports_language_detect = supports_language_detect;

            log::info!(
                "[ModelManager] Updated capabilities for {}: {} languages, streaming={}, detect={}",
                model_id,
                model.languages.len(),
                supports_streaming,
                supports_language_detect
            );
        }
    }
}
```

### 7.4 语言处理逻辑

```rust
// src-tauri/src/backends/transcribe_cpp.rs

impl TranscribeCppBackend {
    /// 将用户的语言意图转换为模型实际使用的语言
    fn effective_language(
        intent: &str,                         // 用户选择："auto" 或 "zh"
        supported_languages: &[String],       // 模型支持：["en", "zh"]
        supports_language_detect: bool,       // 是否支持自动检测
    ) -> String {
        // 1. 如果模型没有声明语言，直接返回用户意图
        if supported_languages.is_empty() {
            return intent.to_string();
        }

        // 2. 用户指定了具体语言，尝试匹配
        if intent != "auto" {
            if let Some(code) = supported_languages
                .iter()
                .find(|lang| base_language(lang) == base_language(intent))
            {
                return code.clone();
            }
        }

        // 3. 用户选 "auto"，模型支持自动检测
        if supports_language_detect {
            return "auto".to_string();
        }

        // 4. 模型不支持自动检测，强制回退
        supported_languages
            .iter()
            .find(|lang| base_language(lang) == "en")
            .unwrap_or(&supported_languages[0])
            .clone()
    }
}

fn base_language(language: &str) -> &str {
    match language.split_once('-') {
        Some((base, _)) => base,
        None => language,
    }
}
```

---

## 八、实施步骤

### 8.1 第一阶段：核心逻辑调整（优先级：高）

#### 步骤 1：修改 GgufCapabilities::from_metadata()

**目标**：让其完整返回 GGUF 元数据，包括语言列表

**修改文件**：`src-tauri/src/backends/gguf_capabilities.rs`

**修改内容**：
```rust
// 当前代码（错误）
pub fn qwen3_asr() -> Self {
    Self {
        supports_streaming: Some(true),
        supports_language_detect: Some(true),
        languages: None, // ❌ 故意返回 None
    }
}

// 调整后代码（正确）
pub fn from_metadata(meta: &GgufMetadata) -> Self {
    Self {
        supports_streaming: meta.get_bool("stt.capability.streaming"),
        supports_language_detect: meta.get_bool("stt.capability.lang_detect"),
        languages: meta.get_string_array("general.languages"), // ✅ 从 GGUF 读取
    }
}
```

#### 步骤 2：调整 scan_single_directory 逻辑

**目标**：优先使用 GGUF Header 的能力，而不是预设文件

**修改文件**：`src-tauri/src/presets/asr_scanner.rs`

**修改内容**：
```rust
// 当前逻辑（错误）
// 对于匹配预设的模型：使用预设的语言列表
// 对于未知模型：使用 GGUF Header 探测的语言

// 调整后逻辑（正确）
// 所有模型：优先使用 GGUF Header 的能力
// 预设文件：仅用于名称、描述等展示信息
```

#### 步骤 3：添加运行时验证

**目标**：加载模型时更新 ModelPreset 的能力字段

**修改文件**：`src-tauri/src/model_manager.rs`

**新增内容**：
```rust
pub fn load_model(&mut self, model_id: &str) -> Result<()> {
    // 加载模型
    let session = Session::load(model_path)?;

    // 验证能力
    let caps = session.model().capabilities();

    // 更新 ModelPreset
    self.update_model_capabilities(model_id, caps);
}
```

### 8.2 第二阶段：语言处理逻辑（优先级：中）

#### 步骤 4：添加 effective_language 函数

**目标**：处理用户语言意图与模型能力的匹配

**新增文件**：`src-tauri/src/backends/language_utils.rs`

**新增内容**：
```rust
/// 将用户的语言意图转换为模型实际使用的语言
pub fn effective_language(
    intent: &str,
    supported_languages: &[String],
    supports_language_detect: bool,
) -> String {
    // 实现语言匹配和降级逻辑
}
```

### 8.3 第三阶段：预设文件重构（优先级：低）

#### 步骤 5：重构预设文件职责

**目标**：明确预设文件只用于 Catalog 展示

**修改文件**：`src-tauri/src/presets/asr.rs`

**修改内容**：
- 移除注释"预设文件是语言列表的唯一来源"
- 添加注释"预设文件仅用于 Catalog 展示，运行时不依赖"

---

## 九、关键代码调整

### 9.1 必须修改的文件

```
高优先级：
□ src-tauri/src/backends/gguf_capabilities.rs
    - 修改 from_metadata() 返回完整能力
    - 移除各架构函数中的 languages: None

□ src-tauri/src/presets/asr_scanner.rs
    - 调整 scan_single_directory() 优先使用 GGUF 能力
    - 预设文件降级为展示信息来源

□ src-tauri/src/model_manager.rs
    - 添加运行时验证逻辑
    - 添加 update_model_capabilities() 方法

中优先级：
□ src-tauri/src/backends/transcribe_cpp.rs
    - 添加 effective_language() 函数
    - 调整语言参数构建逻辑

□ src-tauri/src/presets/asr.rs
    - 添加注释说明预设文件的职责
    - 移除误导性注释
```

### 9.2 可选调整的文件

```
低优先级：
□ src-tauri/src/config.rs
    - 添加 AsrModelsCache 的能力更新逻辑

□ src-tauri/src/commands/model.rs
    - 添加命令返回模型的实时能力
```

---

## 十、验证和测试

### 10.1 测试场景

#### 场景 1：下载预设模型
```
步骤：
1. 浏览 Catalog，选择模型
2. 点击下载
3. 检查 GGUF Header 是否正确读取
4. 检查 ModelPreset 是否正确更新
5. 开始录音，验证能力是否正确

预期结果：
✅ 语言列表正确
✅ 流式支持正确
✅ 自动检测正确
```

#### 场景 2：放入自定义模型
```
步骤：
1. 下载一个 Voconly 没有预设的 GGUF 模型
2. 放入 models 目录
3. 重启应用
4. 检查模型是否出现在列表中
5. 检查能力是否正确显示
6. 开始使用，验证功能

预期结果：
✅ 模型自动出现
✅ 语言列表正确
✅ 无需预设文件
```

#### 场景 3：预设与 GGUF 不一致
```
步骤：
1. 找一个预设与 GGUF 不匹配的模型
2. 下载并加载
3. 检查最终能力是 GGUF 的值

预期结果：
✅ 使用 GGUF 的能力
✅ 覆盖预设的声明
✅ 功能正常工作
```

### 10.2 验证检查点

```
□ GGUF Header 探测是否返回完整能力？
□ 语言列表是否从 GGUF 读取？
□ 运行时验证是否更新 ModelPreset？
□ 自定义模型是否零配置可用？
□ 语言匹配逻辑是否正确？
□ 流式/批量路径选择是否正确？
```

---

## 附录：对比表

### 当前 vs 调整后

| 方面 | 当前 Voconly | 调整后 Voconly |
|------|-------------|---------------|
| **语言列表来源** | 预设文件 ❌ | GGUF 元数据 ✅ |
| **新模型可用性** | 需要预设 ❌ | 零配置 ✅ |
| **社区模型支持** | 不完整 ❌ | 完整 ✅ |
| **维护负担** | 高（需维护两处）❌ | 低（只需 GGUF）✅ |
| **能力准确性** | 可能过时 ❌ | 100% 准确 ✅ |
| **用户体验** | 差 ❌ | 好 ✅ |

---

## 总结

**一句话概括**：从"预设文件驱动"转变为"GGUF 元数据驱动"，实现零配置自动发现，能力来源统一。

**核心改变**：
1. GGUF 文件成为能力的唯一真实来源
2. 预设文件降级为"展示广告"
3. 三层验证确保能力始终正确
4. 新模型零配置即插即用

**预期收益**：
- 用户：零配置、自动发现、社区友好
- 开发者：维护简单、扩展性强、代码清晰
- 架构：设计一致、可靠性高、可维护性强