# 统一 Catalog 和 Preset 数据源 - 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将所有模型配置统一到 catalog.json，预设动态从 catalog 生成，实现单一数据源。

**Architecture:** 扩展 catalog.json 添加下载链接等字段，CatalogModel 添加转换方法生成 ModelPreset，删除 asr.rs 中的硬编码预设。

**Tech Stack:** Rust, serde_json, once_cell, Tauri

---

## Task 1: 扩展 CatalogModel 结构体

**Files:**
- Modify: `src-tauri/src/catalog/mod.rs:17-29`

**Step 1: 添加新结构体定义**

在 `CatalogCapabilities` 结构体后添加：

```rust
/// Download source for model downloads
#[derive(Deserialize, Debug, Clone)]
pub struct DownloadSource {
    pub name: String,
    pub url: String,
    pub is_china_accessible: bool,
    pub priority: u8,
}

/// GGUF file variant (for multi-quantization support)
#[derive(Deserialize, Debug, Clone)]
pub struct CatalogFile {
    pub filename: String,
    pub quant: String,
    pub size_bytes: u64,
}
```

**Step 2: 扩展 CatalogModel 结构体**

修改 `CatalogModel` 结构体，添加新字段：

```rust
#[derive(Deserialize, Debug, Clone)]
pub struct CatalogModel {
    pub id: String,
    pub name: String,
    pub architecture: Option<String>,
    pub backend: Option<String>,  // 新增：Onnx 或 TranscribeCpp
    pub languages: Vec<String>,
    pub capabilities: CatalogCapabilities,
    pub speed_score: Option<u32>,
    pub accuracy_score: Option<u32>,
    pub description: Option<String>,
    pub size: Option<String>,  // 新增
    pub download_urls: Option<Vec<DownloadSource>>,  // 新增
    pub files: Option<Vec<CatalogFile>>,  // 新增：GGUF 多量化版本
    pub default_quant: Option<String>,  // 新增：默认量化版本
}
```

**Step 3: 运行编译验证**

Run: `cd src-tauri && cargo check`
Expected: PASS (编译成功)

**Step 4: 提交**

```bash
git add src-tauri/src/catalog/mod.rs
git commit -m "feat(catalog): 扩展 CatalogModel 结构体以支持下载链接和多量化版本"
```

---

## Task 2: 扩展 catalog.json 结构

**Files:**
- Modify: `src-tauri/src/catalog/catalog.json`

**Step 1: 添加下载链接到 Qwen3-ASR**

修改第一个模型条目：

```json
{
  "id": "Qwen3-ASR-1.7B-Q5_K_M",
  "name": "Qwen3-ASR-1.7B Q5_K_M",
  "architecture": "qwen3",
  "backend": "TranscribeCpp",
  "languages": ["zh", "zh-yue", "en", "ar", "de", "fr", "es", "pt", "id", "it", "ko", "ru", "th", "vi", "ja", "tr", "hi", "ms", "nl", "sv", "da", "fi", "pl", "cs", "fil", "fa", "el", "hu", "mk", "ro"],
  "capabilities": {
    "streaming": false,
    "translate": false,
    "lang_detect": true
  },
  "speed_score": 63,
  "accuracy_score": 87,
  "description": "中文/英文混合识别，支持30种语言+22种中文方言，中文WER 5.2%",
  "size": "~1.5GB",
  "download_urls": [
    {
      "name": "ModelScope",
      "url": "https://modelscope.cn/models/voconly/Qwen3-ASR-1.7B-gguf/resolve/main/Qwen3-ASR-1.7B-Q5_K_M.gguf",
      "is_china_accessible": true,
      "priority": 0
    },
    {
      "name": "HuggingFace",
      "url": "https://huggingface.co/voconly/Qwen3-ASR-1.7B-gguf/resolve/main/Qwen3-ASR-1.7B-Q5_K_M.gguf",
      "is_china_accessible": false,
      "priority": 1
    }
  ]
}
```

**Step 2: 添加下载链接到其他 GGUF 模型**

为以下模型添加 `backend`, `size`, `download_urls` 字段（从 asr.rs 复制数据）：
- cohere-transcribe-03-2026-Q5_K_M
- nemotron-3.5-asr-streaming-0.6b-Q5_K_M
- parakeet-tdt-0.6b-v3-Q5_K_M
- parakeet-unified-en-0.6b-Q5_K_M
- whisper-large-v3-turbo-Q5_K_M

**Step 3: 添加下载链接到 ONNX 模型**

为以下模型添加 `backend: "Onnx"`, `size`, `download_urls`：
- sensevoice-small
- parakeet-v3

**Step 4: 运行测试验证 JSON 加载**

Run: `cd src-tauri && cargo test --lib catalog::tests::catalog_loads_successfully -- --nocapture`
Expected: PASS

**Step 5: 提交**

```bash
git add src-tauri/src/catalog/catalog.json
git commit -m "feat(catalog): 扩展 catalog.json 添加下载链接和后端类型"
```

---

## Task 3: 添加转换方法

**Files:**
- Modify: `src-tauri/src/catalog/mod.rs`

**Step 1: 添加导入**

在文件顶部添加：

```rust
use crate::backends::BackendType;
use crate::presets::{DownloadSourceInfo, ModelPreset};
```

**Step 2: 实现 parse_backend 方法**

在 `CatalogModel` impl 块中添加：

```rust
impl CatalogModel {
    fn parse_backend(&self) -> BackendType {
        match self.backend.as_deref() {
            Some("Onnx") => BackendType::Onnx,
            Some("TranscribeCpp") | None => BackendType::TranscribeCpp,
            _ => BackendType::TranscribeCpp,
        }
    }
}
```

**Step 3: 实现 to_preset 方法**

```rust
/// 从 CatalogModel 创建 ModelPreset
pub fn to_preset(&self) -> ModelPreset {
    ModelPreset::asr_preset(
        self.id.clone(),
        self.name.clone(),
        self.size.clone().unwrap_or_else(|| "未知大小".to_string()),
        self.parse_backend(),
        self.download_urls
            .as_ref()
            .map(|urls| urls.iter().map(|u| DownloadSourceInfo {
                name: u.name.clone(),
                url: u.url.clone(),
                is_china_accessible: u.is_china_accessible,
                priority: u.priority,
            }).collect())
            .unwrap_or_default(),
        self.languages.clone(),
        self.description.clone(),
        Some(self.capabilities.lang_detect),
        Some(self.capabilities.streaming),
        Some(self.capabilities.translate),
        self.accuracy_score.map(|a| a as f32 / 100.0),
        self.speed_score.map(|s| s as f32 / 100.0),
    )
}
```

**Step 4: 实现 to_presets 方法（支持 GGUF 多量化）**

```rust
/// 获取所有量化版本的预设（用于 GGUF 模型）
pub fn to_presets(&self) -> Vec<ModelPreset> {
    if let Some(files) = &self.files {
        files.iter().map(|f| {
            let id = format!("{}-{}", self.id, f.quant);
            ModelPreset::asr_preset(
                id,
                format!("{} {}", self.name, f.quant),
                format!("{}MB", f.size_bytes / 1024 / 1024),
                BackendType::TranscribeCpp,
                self.download_urls
                    .as_ref()
                    .map(|urls| urls.iter().map(|u| DownloadSourceInfo {
                        name: u.name.clone(),
                        url: format!("{}{}", u.url, f.filename),
                        is_china_accessible: u.is_china_accessible,
                        priority: u.priority,
                    }).collect())
                    .unwrap_or_default(),
                self.languages.clone(),
                self.description.clone(),
                Some(self.capabilities.lang_detect),
                Some(self.capabilities.streaming),
                Some(self.capabilities.translate),
                self.accuracy_score.map(|a| a as f32 / 100.0),
                self.speed_score.map(|s| s as f32 / 100.0),
            )
        }).collect()
    } else {
        vec![self.to_preset()]
    }
}
```

**Step 5: 运行编译验证**

Run: `cd src-tauri && cargo check`
Expected: PASS

**Step 6: 提交**

```bash
git add src-tauri/src/catalog/mod.rs
git commit -m "feat(catalog): 添加 CatalogModel 到 ModelPreset 的转换方法"
```

---

## Task 4: 修改 get_asr_presets()

**Files:**
- Modify: `src-tauri/src/presets/asr.rs`

**Step 1: 导入 CATALOG**

在文件顶部添加：

```rust
use crate::catalog::CATALOG;
```

**Step 2: 替换 get_asr_presets 函数**

将整个函数替换为：

```rust
/// Get all ASR model presets (从 catalog.json 动态生成)
pub fn get_asr_presets() -> Vec<ModelPreset> {
    CATALOG
        .iter()
        .filter(|m| m.backend.as_deref() != Some("LLM"))
        .flat_map(|m| m.to_presets())
        .collect()
}
```

**Step 3: 运行测试验证**

Run: `cd src-tauri && cargo test --lib presets::asr::tests::test_asr_presets_count -- --nocapture`
Expected: PASS (应该有 8 个预设)

**Step 4: 提交**

```bash
git add src-tauri/src/presets/asr.rs
git commit -m "refactor(presets): get_asr_presets 从 catalog 动态生成"
```

---

## Task 5: 删除硬编码预设

**Files:**
- Modify: `src-tauri/src/presets/asr.rs`

**Step 1: 删除硬编码的预设数据**

删除 `get_asr_presets()` 函数中所有 `vec![...]` 内的硬编码预设数据（约 240 行）。

保留：
- `use crate::catalog::CATALOG;`
- `use crate::backends::BackendType;`
- `get_asr_presets()` 函数（已在上一步修改）
- `get_asr_presets_by_backend()` 函数
- `get_asr_presets_by_language()` 函数
- 测试代码

**Step 2: 删除不再需要的导入**

删除：
```rust
use crate::catalog::{get_accuracy_score, get_speed_score};
```

**Step 3: 运行编译验证**

Run: `cd src-tauri && cargo check`
Expected: PASS

**Step 4: 运行所有测试**

Run: `cd src-tauri && cargo test --lib`
Expected: PASS

**Step 5: 提交**

```bash
git add src-tauri/src/presets/asr.rs
git commit -m "refactor(presets): 删除硬编码的 ASR 预设，统一从 catalog 生成"
```

---

## Task 6: 更新测试

**Files:**
- Modify: `src-tauri/src/catalog/mod.rs`

**Step 1: 添加转换测试**

在测试模块中添加：

```rust
#[test]
fn presets_generated_correctly() {
    let presets: Vec<_> = CATALOG.iter()
        .filter(|m| m.backend.as_deref() != Some("LLM"))
        .flat_map(|m| m.to_presets())
        .collect();

    assert!(!presets.is_empty(), "should generate presets");

    // 验证 sensevoice-small 有分数
    let sensevoice = presets.iter().find(|p| p.id == "sensevoice-small");
    assert!(sensevoice.is_some());
    let sensevoice = sensevoice.unwrap();
    assert!(sensevoice.accuracy_score.is_some());
    assert!(sensevoice.speed_score.is_some());
}

#[test]
fn all_models_have_required_fields() {
    for model in CATALOG.iter() {
        assert!(!model.id.is_empty(), "model should have id");
        assert!(!model.name.is_empty(), "model should have name");
        assert!(!model.languages.is_empty(), "model should have languages");
    }
}
```

**Step 2: 运行测试**

Run: `cd src-tauri && cargo test --lib catalog::tests -- --nocapture`
Expected: PASS

**Step 3: 提交**

```bash
git add src-tauri/src/catalog/mod.rs
git commit -m "test(catalog): 添加预设生成和字段验证测试"
```

---

## Task 7: 验证功能

**Step 1: 运行完整测试套件**

Run: `cd src-tauri && cargo test --lib`
Expected: All tests PASS

**Step 2: 检查编译警告**

Run: `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`
Expected: No warnings

**Step 3: 验证预设数量**

Run: `cd src-tauri && cargo test --lib presets::asr::tests::test_asr_presets_count -- --nocapture`
Expected: PASS (8 presets)

**Step 4: 最终提交**

```bash
git add -A
git commit -m "refactor: 统一 Catalog 和 Preset 数据源

- 扩展 catalog.json 添加 backend, size, download_urls 字段
- CatalogModel 添加 to_preset/to_presets 转换方法
- get_asr_presets 从 catalog 动态生成
- 删除 asr.rs 中的硬编码预设（约 240 行）

收益：
- 新增模型只需修改 catalog.json 一处
- 消除不同步风险
- 代码量减少约 300 行"
```

---

## 预期效果

### 改动前
```
新增模型步骤：
1. 修改 catalog.json（添加分数）
2. 修改 presets/asr.rs（添加硬编码预设）
3. 确保两边 ID 一致
```

### 改动后
```
新增模型步骤：
1. 修改 catalog.json（一次搞定）
```

### 其他收益
- 代码量减少约 240 行
- 维护成本降低
- 不可能出现不同步问题
- GGUF 模型的多量化版本自动生成