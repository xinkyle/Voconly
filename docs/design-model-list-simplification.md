# 设计方案：模型列表展示简化

## 背景

用户在模型列表中看到的名称带有量化后缀（如 "Qwen3-ASR 1.7B Q5_K_M"），造成困惑。用户只关心"这是什么模型"，不关心量化细节。

当前架构存在以下问题：
1. 数据来源混乱，概念不统一
2. ID 命名不一致，需要复杂的模糊匹配
3. 一个模型的多个量化版本被当作多个独立"preset"展示

注意这次调整不用考虑兼容问题，我还没有发布，不用考虑兼容！

---

## 设计决策

### 1. 量化版本排序规则

按精度从高到低排序：

```
Q8_0 > Q6_K > Q5_K_M > Q5_K_S > Q5_0 > Q4_K_M > Q4_K_S > Q4_0 > Q3_K_M > Q3_K_L > Q3_K_S > Q2_K
F32 > F16 > BF16
```

**实现**：创建量化版本优先级映射表。

### 2. 命名格式规范

**只支持标准格式**：
```
<model-name>-<quant>.gguf
```

示例：
- `qwen3-asr-1.7b-q5_k_m.gguf` ✓
- `parakeet-tdt-1.1b-q8_0.gguf` ✓
- `whisper-large-v3-q5_0.gguf` ✓

**不支持自定义文件名**：
- `my-custom-model-v1.gguf` ✗ 不识别，不显示
- `custom-asr-model.gguf` ✗ 不识别，不显示

### 3. 多量化版本处理

当目录中存在同一模型的多个量化版本时：
- **展示最高精度版本**
- **不支持 UI 切换版本**

示例：
```
目录内容：
  qwen3-asr-1.7b-q4_0.gguf
  qwen3-asr-1.7b-q5_k_m.gguf
  qwen3-asr-1.7b-q8_0.gguf

展示结果：
  Qwen3-ASR 1.7B (使用 q8_0 版本)
```

### 4. 默认下载版本

对于未下载的模型，**默认下载 Q5 量化版本**（平衡质量和大小）。

如果该模型没有 Q5 版本，则按精度排序选择最接近的版本。

### 5. LLM 模型处理

**暂不处理**，保持现有逻辑。后续可单独优化。

---

## 当前架构问题分析

### 问题 1：数据来源混乱，概念不统一

```
catalog.json          to_presets()           扫描器                 前端展示
    │                     │                    │                      │
    │ id: "Qwen3-ASR"     │                    │                      │
    │ (不带量化)          │                    │                      │
    │                     ▼                    │                      │
    │               id: "Qwen3-ASR-Q5_K_M"    │                      │
    │               name: "Qwen3-ASR Q5_K_M"  │                      │
    │               (带量化后缀)               │                      │
    │                                          │                      │
    │                                     文件名: Qwen3-ASR-Q5_K_M.gguf
    │                                          │                      │
    │                                     ID: "Qwen3-ASR-Q5_K_M"     │
    │                                     (从文件名提取)              │
    │                                          │                      │
    └──────────────────────────────────────────┴──────────────────────┘
                                               │                      │
                                          需要用 get_base_model_id()
                                          进行模糊匹配              │
                                                                  ▼
                                                           显示: "Qwen3-ASR Q5_K_M"
                                                           (带量化后缀，用户困惑)
```

### 问题 2：匹配逻辑复杂

为了解决 ID 不一致问题，引入了 `get_base_model_id()` 函数：
- 需要处理大小写
- 需要识别各种量化后缀（Q4_0, Q5_K_M, F16...）
- 需要处理文件扩展名
- 需要处理用户自定义模型

### 问题 3：概念混淆

| 概念 | 当前实现 | 问题 |
|------|----------|------|
| **模型** | 没有明确概念 | 一个模型有多个量化版本，但被当作多个"preset" |
| **Preset** | 一个量化版本 | 用户不关心量化版本，只关心"模型" |
| **ID** | 带量化后缀 | 用户看到的是 "Qwen3-ASR-Q5_K_M"，困惑 |

---

## 简化方案

### 核心思路：统一概念，明确职责

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              catalog.json                                │
│                                                                          │
│  Model (概念：一个 ASR 模型，如 "Qwen3-ASR 1.7B")                         │
│  ├── id: "Qwen3-ASR-1.7B" (唯一标识，不带量化后缀)                         │
│  ├── name: "Qwen3-ASR 1.7B" (展示名称，不带量化后缀)                       │
│  ├── default_quant: "Q5_K_M" (默认下载版本)                               │
│  ├── download_urls: [...] (基础 URL，不含 filename)                      │
│  └── files: [...] (所有量化版本列表)                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            ModelPreset (运行时)                           │
│                                                                          │
│  id: "Qwen3-ASR-1.7B" (与 catalog 一致，不带量化后缀)                      │
│  name: "Qwen3-ASR 1.7B" (展示名称)                                        │
│  filename: "Qwen3-ASR-1.7B-Q5_K_M.gguf" (实际文件名)                      │
│  download_urls: [...] (完整 URL，已拼接 filename)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
    ┌───────────────────┐                       ┌───────────────────┐
    │    下载逻辑        │                       │    扫描逻辑        │
    │                   │                       │                   │
    │ 使用 default_quant │                       │ 扫描文件名:        │
    │ 确定下载版本        │                       │ qwen3-asr-1.7b-  │
    │                   │                       │ q4_0.gguf         │
    │ 从 filename 字段   │                       │ qwen3-asr-1.7b-  │
    │ 确定存储文件名      │                       │ q8_0.gguf         │
    │                   │                       │                   │
    │ 存储为:            │                       │ 提取基础 ID:       │
    │ qwen3-asr-1.7b-    │                       │ qwen3-asr-1.7b    │
    │ q5_k_m.gguf        │                       │                   │
    │ (保持原文件名)      │                       │ 选择最高精度版本:   │
    │                   │                       │ q8_0              │
    └───────────────────┘                       └───────────────────┘
```

---

## 详细设计

### 1. 数据模型变更

**catalog.json 结构**（添加 default_quant 字段）：

```json
{
  "id": "Qwen3-ASR-1.7B",
  "name": "Qwen3-ASR 1.7B",
  "default_quant": "Q5_K_M",           // 新增：默认下载版本
  "download_urls": [...],
  "files": [
    {
      "filename": "Qwen3-ASR-1.7B-Q4_0.gguf",
      "quant": "Q4_0",
      "size_bytes": 1200000000
    },
    {
      "filename": "Qwen3-ASR-1.7B-Q5_K_M.gguf",
      "quant": "Q5_K_M",
      "size_bytes": 1610612736
    },
    {
      "filename": "Qwen3-ASR-1.7B-Q8_0.gguf",
      "quant": "Q8_0",
      "size_bytes": 2000000000
    }
  ]
}
```

**ModelPreset 结构**（添加 filename 字段）：

```rust
pub struct ModelPreset {
    pub id: String,           // 不带量化后缀
    pub name: String,         // 展示名称，不带量化后缀
    pub filename: String,     // 新增：实际文件名
    pub quant: String,        // 新增：量化版本
    pub download_urls: Vec<DownloadSourceInfo>,  // 完整 URL
    // ... 其他字段
}
```

### 2. 量化版本优先级映射

```rust
// utils/quant.rs (新文件)

/// 量化版本优先级（数值越大优先级越高）
pub fn quant_priority(quant: &str) -> u8 {
    let quant_lower = quant.to_lowercase();
    match quant_lower.as_str() {
        "q8_0" => 80,
        "q6_k" => 70,
        "q5_k_m" => 65,
        "q5_k_s" => 64,
        "q5_0" => 60,
        "q4_k_m" => 55,
        "q4_k_s" => 54,
        "q4_0" => 50,
        "q3_k_m" => 45,
        "q3_k_l" => 44,
        "q3_k_s" => 43,
        "q2_k" => 30,
        "f32" => 100,
        "f16" => 90,
        "bf16" => 85,
        _ => 0,  // 未知量化版本
    }
}

/// 比较两个量化版本，返回精度更高的那个
pub fn higher_quant(a: &str, b: &str) -> &str {
    if quant_priority(a) >= quant_priority(b) {
        a
    } else {
        b
    }
}
```

### 3. 预设生成逻辑

**`to_preset()` 方法**：只返回一个 preset（使用 default_quant）

```rust
impl CatalogModel {
    pub fn to_preset(&self) -> ModelPreset {
        // 确定默认量化版本
        let default_quant = self.default_quant.clone()
            .unwrap_or_else(|| "Q5_K_M".to_string());  // 默认 Q5

        // 查找对应的文件信息
        let file_info = self.files
            .as_ref()
            .and_then(|files| files.iter().find(|f| f.quant == default_quant));

        let (filename, size) = if let Some(f) = file_info {
            (f.filename.clone(), format!("{}MB", f.size_bytes / 1024 / 1024))
        } else {
            // 如果没有找到 default_quant，使用 files 中的第一个
            let first_file = self.files.as_ref().and_then(|f| f.first());
            match first_file {
                Some(f) => (f.filename.clone(), format!("{}MB", f.size_bytes / 1024 / 1024)),
                None => (format!("{}.gguf", self.id), "未知大小".to_string())
            }
        };

        // 生成完整 download URLs
        let download_urls = self.build_download_urls(&filename);

        ModelPreset {
            id: self.id.clone(),
            name: self.name.clone(),
            filename: filename.clone(),
            quant: default_quant,
            download_urls,
            // ...
        }
    }

    /// 废弃：不再支持多 preset
    pub fn to_presets(&self) -> Vec<ModelPreset> {
        vec![self.to_preset()]
    }
}
```

### 4. 扫描逻辑变更

**关键变更**：
1. 按基础 ID 分组
2. 每组选择最高精度版本
3. 不识别的文件名直接跳过

```rust
// presets/asr_scanner.rs

/// 扫描 GGUF 模型文件
fn scan_gguf_model(path: &Path, presets: &[ModelPreset]) -> Option<ModelPreset> {
    let filename = path.file_name()?.to_str()?;

    // 1. 尝试提取量化版本
    let quant = extract_quant_from_filename(filename)?;

    // 2. 提取基础 ID（移除量化后缀）
    let base_id = get_base_model_id(&filename);

    // 3. 匹配预设（按基础 ID 匹配）
    let preset = presets.iter()
        .find(|p| get_base_model_id(&p.id) == base_id)?;

    // 4. 创建 preset（使用实际文件名）
    Some(ModelPreset::asr_preset_with_path(
        preset.id.clone(),          // 使用预设 ID（不带量化）
        preset.name.clone(),        // 使用预设名称
        preset.size.clone(),
        BackendType::TranscribeCpp,
        preset.download_urls.clone(),
        preset.languages.clone(),
        preset.description.clone(),
        preset.supports_auto_detect,
        preset.supports_streaming,
        preset.supports_translation,
        preset.accuracy_score,
        preset.speed_score,
        Some(path.to_string_lossy().to_string()),
        filename.to_string(),       // 新增：实际文件名
        quant,                      // 新增：量化版本
    ))
}

/// 从文件名提取量化版本
/// 只支持标准格式：<model-name>-<quant>.gguf
fn extract_quant_from_filename(filename: &str) -> Option<String> {
    // 移除扩展名
    let name = filename.strip_suffix(".gguf")
        .or_else(|| filename.strip_suffix(".bin"))?;

    // 查找最后一个 '-' 后的部分
    let last_dash = name.rfind('-')?;
    let potential_quant = &name[last_dash + 1..];

    // 验证是否是合法的量化版本
    if is_valid_quant(potential_quant) {
        Some(potential_quant.to_uppercase())
    } else {
        None  // 不识别的格式，返回 None
    }
}

/// 验证是否是合法的量化版本
fn is_valid_quant(quant: &str) -> bool {
    let valid_quants = [
        "q8_0", "q6_k", "q5_k_m", "q5_k_s", "q5_0",
        "q4_k_m", "q4_k_s", "q4_0", "q3_k_m", "q3_k_l", "q3_k_s", "q2_k",
        "f32", "f16", "bf16"
    ];
    valid_quants.contains(&quant.to_lowercase().as_str())
}

/// 扫描所有模型，按基础 ID 分组，选择最高精度版本
pub fn scan_available_asr_models() -> Vec<ModelPreset> {
    let mut grouped: HashMap<String, ModelPreset> = HashMap::new();

    for model in scan_all_models() {
        let base_id = get_base_model_id(&model.id);

        // 如果已存在，比较量化版本
        if let Some(existing) = grouped.get_mut(&base_id) {
            if quant_priority(&model.quant) > quant_priority(&existing.quant) {
                *existing = model;  // 替换为更高精度版本
            }
        } else {
            grouped.insert(base_id, model);
        }
    }

    grouped.into_values().collect()
}
```

### 5. 下载逻辑变更

**关键变更**：存储文件名从 `filename` 字段获取，而不是从 `id` 推导

```rust
// utils/downloader.rs

// 当前逻辑（错误）：
let model_path = storage_dir.join(format!("{}.gguf", model_id));
// model_id = "Qwen3-ASR-1.7B" → "Qwen3-ASR-1.7B.gguf" ❌

// 新逻辑（正确）：
let model_path = storage_dir.join(&preset.filename);
// filename = "Qwen3-ASR-1.7B-Q5_K_M.gguf" ✓
```

### 6. 加载逻辑变更

**model_manager.rs** 中加载模型时：

```rust
// 当前逻辑（需要修改）：
let model_path = get_model_path(&preset.id, backend)?;

// 新逻辑：
let model_path = if let Some(ref filename) = preset.filename {
    storage_dir.join(filename)
} else {
    // Fallback：从 id 推导（兼容旧数据）
    get_model_path(&preset.id, backend)?
};
```

### 7. 前端展示

**ModelList.tsx**：直接显示 `preset.name`（不带量化后缀）

```tsx
<span className="font-medium text-gray-900">{model.name}</span>
// 显示: "Qwen3-ASR 1.7B" (不带量化后缀)
```

---

## 方案优势

| 方面 | 当前 | 新方案 |
|------|------|--------|
| **用户看到** | "Qwen3-ASR 1.7B Q5_K_M" | "Qwen3-ASR 1.7B" |
| **ID 统一** | 不一致，需要模糊匹配 | 统一，精确匹配 |
| **多量化版本** | 显示多个条目 | 显示一个（最高精度） |
| **数据来源** | 混乱 | 单一 |
| **自定义文件** | 尝试识别 | 不识别，不显示 |

---

## 改动范围估算

| 文件 | 改动内容 | 复杂度 |
|------|----------|--------|
| `catalog/mod.rs` | 修改 `to_preset()`，废弃 `to_presets()` | 中 |
| `catalog.json` | 添加 `default_quant` 字段 | 低 |
| `presets/mod.rs` | 添加 `filename` 和 `quant` 字段 | 低 |
| `utils/quant.rs` | 新增量化版本优先级函数 | 低 |
| `presets/asr_scanner.rs` | 按基础 ID 分组，选择最高精度 | 中 |
| `utils/downloader.rs` | 下载时使用 `filename` | 低 |
| `model_manager.rs` | 加载时使用 `filename` | 低 |
| `commands/model.rs` | 确保逻辑一致 | 低 |

**核心改动集中在 `catalog/mod.rs` 和 `asr_scanner.rs`**。

---

## 实施顺序

1. **添加量化版本优先级函数**：创建 `utils/quant.rs`
2. **修改 ModelPreset 结构体**：添加 `filename` 和 `quant` 字段
3. **修改 `to_preset()` 方法**：使用 `default_quant` 查找文件信息
4. **更新 catalog.json**：添加 `default_quant` 字段
5. **修改扫描逻辑**：按基础 ID 分组，选择最高精度版本
6. **修改下载逻辑**：使用 `filename` 确定存储路径
7. **修改加载逻辑**：使用 `filename` 查找模型文件
8. **验证功能**

---

## 未来扩展

### 多量化版本选择（如果未来需要）

如果未来需要支持用户选择量化版本：

1. 前端模型详情页添加"量化版本"下拉选择
2. `ModelPreset` 添加 `available_quants: Vec<String>` 字段
3. 下载时用户选择具体版本

当前设计保留了 `files` 字段，支持未来扩展。

---

## 测试用例

### 1. 量化版本优先级测试

```rust
#[test]
fn test_quant_priority() {
    assert!(quant_priority("Q8_0") > quant_priority("Q5_K_M"));
    assert!(quant_priority("Q5_K_M") > quant_priority("Q4_0"));
    assert!(quant_priority("F16") > quant_priority("Q8_0"));
    assert_eq!(quant_priority("UNKNOWN"), 0);
}
```

### 2. 文件名解析测试

```rust
#[test]
fn test_extract_quant_from_filename() {
    assert_eq!(extract_quant_from_filename("qwen3-asr-1.7b-q5_k_m.gguf"), Some("Q5_K_M".to_string()));
    assert_eq!(extract_quant_from_filename("model.gguf"), None);  // 无效格式
    assert_eq!(extract_quant_from_filename("my-model-v1.gguf"), None);  // 不识别
}
```

### 3. 扫描器分组测试

```rust
#[test]
fn test_scanner_groups_by_base_id() {
    // 模拟目录中有 q4_0 和 q8_0 两个版本
    let models = scan_available_asr_models();
    let qwen_model = models.iter().find(|m| m.id == "Qwen3-ASR-1.7B");
    assert!(qwen_model.is_some());
    assert_eq!(qwen_model.unwrap().quant, "Q8_0");  // 应该选择最高精度
}
```