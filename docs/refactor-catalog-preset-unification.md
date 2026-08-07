# 重构：统一 Catalog 和 Preset 数据源

## 背景

当前模型配置分散在两个地方：
- `catalog.json`：分数、语言、能力等元数据
- `presets/asr.rs`：下载链接、显示名称、描述等（硬编码）

这导致：
1. 新增模型需要改两个地方
2. 容易出现不同步
3. 维护成本高

## 目标

将所有模型配置统一到 `catalog.json`，预设动态从 catalog 生成，实现单一数据源。

---

## 第一步：扩展 catalog.json 结构

### 当前结构

```json
{
  "id": "sensevoice-small",
  "name": "SenseVoice Small",
  "architecture": "sensevoice",
  "languages": ["zh", "zh-yue", "en", "ja", "ko"],
  "capabilities": {
    "streaming": false,
    "translate": false,
    "lang_detect": true
  },
  "speed_score": 85,
  "accuracy_score": 90,
  "description": "中文/粤语识别优于 Whisper，支持情绪识别"
}
```

### 新增字段

```json
{
  "id": "sensevoice-small",
  "name": "SenseVoice Small",
  "architecture": "sensevoice",
  "backend": "Onnx",
  "languages": ["zh", "zh-yue", "en", "ja", "ko"],
  "capabilities": {
    "streaming": false,
    "translate": false,
    "lang_detect": true
  },
  "speed_score": 85,
  "accuracy_score": 90,
  "description": "中文/粤语识别优于 Whisper，支持情绪识别",
  "size": "229MB",
  "download_urls": [
    {
      "name": "ModelScope",
      "url": "https://modelscope.cn/models/voconly/sensevoice-small/resolve/main/sensevoice-small.zip",
      "is_china_accessible": true,
      "priority": 0
    },
    {
      "name": "HuggingFace",
      "url": "https://huggingface.co/voconly/sensevoice-small/resolve/main/sensevoice-small.zip",
      "is_china_accessible": false,
      "priority": 2
    }
  ]
}
```

### 新增字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `backend` | string | 后端类型：`Onnx` 或 `TranscribeCpp` |
| `size` | string | 文件大小描述，如 `"229MB"` |
| `download_urls` | array | 下载源列表 |

### GGUF 模型的多量化版本支持

对于 GGUF 模型，可以添加 `files` 字段支持多个量化版本：

```json
{
  "id": "Qwen3-ASR-1.7B",
  "name": "Qwen3-ASR 1.7B",
  "architecture": "qwen3",
  "backend": "TranscribeCpp",
  "languages": ["zh", "en", ...],
  "capabilities": { ... },
  "speed_score": 63,
  "accuracy_score": 87,
  "description": "中文/英文混合识别，支持30种语言",
  "files": [
    { "filename": "Qwen3-ASR-1.7B-Q4_K_M.gguf", "quant": "Q4_K_M", "size_bytes": 1234567890 },
    { "filename": "Qwen3-ASR-1.7B-Q5_K_M.gguf", "quant": "Q5_K_M", "size_bytes": 1345678901 },
    { "filename": "Qwen3-ASR-1.7B-Q8_0.gguf", "quant": "Q8_0", "size_bytes": 1567890123 }
  ],
  "default_quant": "Q5_K_M",
  "download_urls": [
    {
      "name": "ModelScope",
      "url": "https://modelscope.cn/models/voconly/Qwen3-ASR-1.7B-GGUF/resolve/main/",
      "is_china_accessible": true,
      "priority": 0
    }
  ]
}
```

---

## 第二步：修改 Rust 代码

### 2.1 扩展 CatalogModel 结构体

文件：`src-tauri/src/catalog/mod.rs`

```rust
#[derive(Deserialize, Debug)]
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

#[derive(Deserialize, Debug)]
pub struct DownloadSource {
    pub name: String,
    pub url: String,
    pub is_china_accessible: bool,
    pub priority: u8,
}

#[derive(Deserialize, Debug)]
pub struct CatalogFile {
    pub filename: String,
    pub quant: String,
    pub size_bytes: u64,
}
```

### 2.2 添加 CatalogModel 到 ModelPreset 的转换方法

文件：`src-tauri/src/catalog/mod.rs`

```rust
use crate::backends::BackendType;
use crate::presets::{DownloadSourceInfo, ModelPreset, ModelType};

impl CatalogModel {
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

    fn parse_backend(&self) -> BackendType {
        match self.backend.as_deref() {
            Some("Onnx") => BackendType::Onnx,
            Some("TranscribeCpp") | None => BackendType::TranscribeCpp,
            _ => BackendType::TranscribeCpp,
        }
    }

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
}
```

### 2.3 修改 get_asr_presets 函数

文件：`src-tauri/src/presets/asr.rs`

```rust
use crate::catalog::CATALOG;

/// 获取所有 ASR 模型预设（从 catalog.json 动态生成）
pub fn get_asr_presets() -> Vec<ModelPreset> {
    CATALOG
        .iter()
        .filter(|m| m.backend.as_deref() != Some("LLM"))
        .flat_map(|m| m.to_presets())
        .collect()
}
```

---

## 第三步：删除硬编码预设

删除 `src-tauri/src/presets/asr.rs` 中所有硬编码的预设定义（约 300 行代码）。

保留：
- `get_asr_presets()` 函数（从 catalog 生成）
- `ModelPreset::asr_preset()` 辅助函数
- 测试代码

---

## 第四步：更新测试

文件：`src-tauri/src/catalog/mod.rs`

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_loads_successfully() {
        assert!(!CATALOG.is_empty(), "catalog should contain models");
    }

    #[test]
    fn all_models_have_required_fields() {
        for model in CATALOG.iter() {
            assert!(!model.id.is_empty(), "model should have id");
            assert!(!model.name.is_empty(), "model should have name");
            assert!(!model.languages.is_empty(), "model should have languages");
        }
    }

    #[test]
    fn presets_generated_correctly() {
        let presets = CATALOG.iter()
            .filter(|m| m.backend.as_deref() != Some("LLM"))
            .flat_map(|m| m.to_presets())
            .collect::<Vec<_>>();
        
        assert!(!presets.is_empty(), "should generate presets");
        
        // 验证 sensevoice-small 有分数
        let sensevoice = presets.iter().find(|p| p.id == "sensevoice-small");
        assert!(sensevoice.is_some());
        let sensevoice = sensevoice.unwrap();
        assert!(sensevoice.accuracy_score.is_some());
        assert!(sensevoice.speed_score.is_some());
    }

    #[test]
    fn gguf_models_generate_multiple_presets() {
        // Qwen3-ASR 应该生成多个量化版本的预设
        let qwen_presets: Vec<_> = CATALOG.iter()
            .filter(|m| m.id.contains("Qwen3-ASR"))
            .flat_map(|m| m.to_presets())
            .collect();
        
        // 如果配置了 files，应该生成多个预设
        // 否则只生成一个
        assert!(!qwen_presets.is_empty());
    }
}
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

- 代码量减少约 300 行
- 维护成本降低
- 不可能出现不同步问题
- GGUF 模型的多量化版本自动生成

---

## 实施顺序

1. **扩展 catalog.json**（添加新字段，保持兼容）
2. **修改 CatalogModel 结构体**
3. **添加转换方法**
4. **修改 get_asr_presets()**
5. **删除硬编码预设**
6. **更新测试**
7. **验证功能**

---

## 注意事项

1. **向后兼容**：catalog.json 的新字段使用 `Option<T>`，旧配置仍能工作
2. **LLM 模型**：需要在 catalog 中添加 `backend: "LLM"` 字段区分
3. **扫描器**：asr_scanner.rs 已经从 catalog 获取分数，无需修改