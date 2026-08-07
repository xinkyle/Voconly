# 重构：分离模型ID与量化版本

## 问题分析

### 当前设计的核心问题

**Catalog ID 带量化信息**导致系统复杂度上升：

```json
// 当前 catalog.json
{
  "id": "Qwen3-ASR-1.7B-Q5_K_M",  // ← 量化信息在ID中
  "languages": ["zh", "en", ...],
  "download_urls": [{
    "url": "...Qwen3-ASR-1.7B-Q5_K_M.gguf"
  }]
}
```

### 问题表现

1. **违背用户直觉**：用户想的是"我下载了 Qwen3-ASR-1.7B（Q5_K_M量化）"，不是"我下载了 Qwen3-ASR-1.7B-Q5_K_M 模型"

2. **数据冗余**：同一模型的不同量化版本需要重复维护语言列表、能力字段
   ```json
   { "id": "Qwen3-ASR-1.7B-Q5_K_M", "languages": ["zh", "en", ...] }
   { "id": "Qwen3-ASR-1.7B-Q8_0", "languages": ["zh", "en", ...] }  // 重复
   ```

3. **代码复杂度**：需要约 **60-70 行代码** 处理 ID 匹配
   - `get_base_model_id()` - 去除量化后缀（18行）
   - `find_model_with_fallback()` - 二级查找（10行）
   - 扫描器中的模糊匹配逻辑（约30行）

4. **维护成本高**：添加一个新模型需要写 N 个条目（每个量化版本一个）

### 概念冲突

- **当前**：Catalog ID = 文件名（不含扩展名）
- **理想**：Catalog ID = 模型本体ID，量化版本是额外属性

---

## 已有实现

**重要**：代码层面已经支持新结构，只是 catalog.json 还未迁移。

### 已实现的字段

`src-tauri/src/catalog/mod.rs` 已经定义：

```rust
pub struct CatalogModel {
    pub id: String,
    // ...
    pub files: Option<Vec<CatalogFile>>,      // ✅ 已实现
    pub default_quant: Option<String>,        // ✅ 已实现
}

pub struct CatalogFile {
    pub filename: String,
    pub quant: String,
    pub size_bytes: u64,
}
```

### 已实现的方法

`to_presets()` 方法已经支持从一个 CatalogModel 生成多个预设：

```rust
pub fn to_presets(&self) -> Vec<ModelPreset> {
    if let Some(files) = &self.files {
        files.iter().map(|f| {
            // 为每个量化版本生成一个预设
        }).collect()
    } else {
        vec![self.to_preset()]
    }
}
```

---

## 优化方案

### 核心思想

**分离"模型"和"量化版本"两个概念**：
- 模型：抽象能力（语言、分数、能力）
- 量化版本：具体文件（文件名、大小、下载链接）

### 新的 Catalog 结构

```json
{
  "id": "Qwen3-ASR-1.7B",  // ← 模型本体ID，不带量化
  "name": "Qwen3-ASR 1.7B",
  "architecture": "qwen3",
  "backend": "TranscribeCpp",
  "languages": ["zh", "zh-yue", "en", ...],  // 只写一次
  "capabilities": {
    "streaming": false,
    "translate": false,
    "lang_detect": true
  },
  "speed_score": 63,
  "accuracy_score": 87,
  "description": "中文/英文混合识别，支持30种语言",

  // 量化版本列表
  "files": [
    {
      "filename": "Qwen3-ASR-1.7B-Q5_K_M.gguf",
      "quant": "Q5_K_M",
      "size_bytes": 1610612736
    }
  ],
  "default_quant": "Q5_K_M",

  // URL 改为目录URL（不含文件名）
  "download_urls": [
    {
      "name": "ModelScope",
      "url": "https://modelscope.cn/models/voconly/Qwen3-ASR-1.7B-gguf/resolve/main/",
      "is_china_accessible": true,
      "priority": 0
    }
  ]
}
```

### ONNX 模型（无需量化）

```json
{
  "id": "sensevoice-small",
  "name": "SenseVoice Small",
  "backend": "Onnx",
  "languages": ["zh", "zh-yue", "en", "ja", "ko"],
  "capabilities": { ... },

  // files 字段可选，不写则使用默认命名规则
  // 文件名 = {id}.zip (下载) 或 {id}/ (目录)

  "download_urls": [
    {
      "name": "ModelScope",
      "url": "https://modelscope.cn/models/voconly/sensevoice-small/resolve/main/sensevoice-small.zip",
      "is_china_accessible": true,
      "priority": 0
    }
  ]
}
```

---

## 实施步骤

### 第一步：迁移 Catalog 数据（优先级最高）

**文件**：`src-tauri/src/catalog/catalog.json`

将当前的 8 个条目合并为：

```json
{
  "catalog_version": 2,
  "models": [
    {
      "id": "Qwen3-ASR-1.7B",
      "name": "Qwen3-ASR 1.7B",
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
      "files": [
        {
          "filename": "Qwen3-ASR-1.7B-Q5_K_M.gguf",
          "quant": "Q5_K_M",
          "size_bytes": 1610612736
        }
      ],
      "default_quant": "Q5_K_M",
      "download_urls": [
        {
          "name": "ModelScope",
          "url": "https://modelscope.cn/models/voconly/Qwen3-ASR-1.7B-gguf/resolve/main/",
          "is_china_accessible": true,
          "priority": 0
        },
        {
          "name": "HuggingFace",
          "url": "https://huggingface.co/voconly/Qwen3-ASR-1.7B-gguf/resolve/main/",
          "is_china_accessible": false,
          "priority": 1
        }
      ]
    },
    // ... 其他 GGUF 模型类似处理
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
      "download_urls": [
        {
          "name": "ModelScope",
          "url": "https://modelscope.cn/models/voconly/sensevoice-small/resolve/main/sensevoice-small.zip",
          "is_china_accessible": true,
          "priority": 0
        }
      ]
    }
  ]
}
```

**验证**：运行测试确保 catalog 加载正确

```bash
cargo test --package voconly --lib catalog::tests
```

### 第二步：验证预设生成

**文件**：`src-tauri/src/catalog/mod.rs`

确保 `to_presets()` 方法正确生成预设：

```rust
#[test]
fn presets_generated_correctly() {
    let presets: Vec<_> = CATALOG
        .iter()
        .filter(|m| m.backend.as_deref() != Some("LLM"))
        .flat_map(|m| m.to_presets())
        .collect();

    assert!(!presets.is_empty(), "should generate presets");
    
    // 验证量化版本预设格式正确
    let qwen_q5 = presets.iter().find(|p| p.id == "Qwen3-ASR-1.7B-Q5_K_M");
    assert!(qwen_q5.is_some());
}
```

### 第三步：简化 Catalog 模块

**文件**：`src-tauri/src/catalog/mod.rs`

**删除**不再需要的 `find_model_with_fallback()` 函数：

```diff
- /// Find a model by ID, with fallback to base model ID.
- fn find_model_with_fallback(id: &str) -> Option<&CatalogModel> {
-     if let Some(model) = find_model(id) {
-         return Some(model);
-     }
-     let base_id = get_base_model_id(id);
-     CATALOG.iter().find(|m| m.id.to_lowercase() == base_id)
- }

- pub fn get_speed_score(id: &str) -> Option<f32> {
-     find_model_with_fallback(id).and_then(|m| m.speed_score.map(|s| s as f32 / 100.0))
- }

+ pub fn get_speed_score(id: &str) -> Option<f32> {
+     find_model(id).and_then(|m| m.speed_score.map(|s| s as f32 / 100.0))
+ }
```

**注意**：保留 `get_base_model_id()` 函数，扫描器仍需要它来处理未知模型。

### 第四步：更新扫描器（可选）

**文件**：`src-tauri/src/presets/asr_scanner.rs`

当前扫描器使用 `get_base_model_id()` 进行 fallback 匹配，这是必要的：
- 用户可能有旧格式的模型文件
- 可能有未知模型需要匹配

**不需要修改**，当前逻辑已经很好。

### 第五步：UI 兼容性检查

检查 UI 层是否有硬编码的模型 ID：

```bash
# 搜索可能硬编码模型 ID 的地方
grep -r "Qwen3-ASR-1.7B-Q5_K_M" src/
grep -r "sensevoice-small" src/
```

如果有，需要更新为新格式的 ID。

---

## 预期效果

### 改动前

```
添加 Qwen3-ASR-3B（3个量化版本）:
1. 写 3 个 catalog 条目（重复语言列表）
2. 维护 3 个 download_urls
3. 处理 get_base_model_id() 匹配逻辑
```

### 改动后

```
添加 Qwen3-ASR-3B（3个量化版本）:
1. 写 1 个 catalog 条目
2. files 列出 3 个量化版本
3. 语言列表只写一次
```

### 代码简化

- **删除代码**：约 10 行（`find_model_with_fallback`）
- **保留代码**：`get_base_model_id()` 约 18 行（仍需要）
- **净减少**：约 10 行

**主要收益**是数据层面的简化，不是代码量。

---

## 兼容性处理

### 数据兼容性

**Catalog 版本**：添加 `catalog_version` 字段

```json
{
  "catalog_version": 2,
  "models": [...]
}
```

代码可以同时支持 v1 和 v2 格式（向后兼容）。

### 用户文件兼容性

用户已下载的模型文件名不变：
- 旧文件名：`Qwen3-ASR-1.7B-Q5_K_M.gguf`
- 新格式仍生成相同预设 ID：`Qwen3-ASR-1.7B-Q5_K_M`

**扫描器兼容**：`get_base_model_id()` 继续用于未知模型的匹配。

### API 兼容性

预设 ID 格式保持不变（带量化后缀）：
- 旧：`Qwen3-ASR-1.7B-Q5_K_M`
- 新：仍然生成 `Qwen3-ASR-1.7B-Q5_K_M`

UI 层和配置文件无需修改。

---

## 风险评估

### 低风险

- ONNX 模型逻辑不变（无量化版本）
- 扫描器逻辑保持不变（保留 fallback）
- 预设 ID 格式不变（向后兼容）

### 中等风险

- Catalog 数据迁移需要仔细检查
- `size_bytes` 字段需要准确填写（当前用字符串 `~1.5GB`）

### 缓解措施

1. **分阶段迁移**：先迁移一个模型，验证流程
2. **保留 fallback**：`get_base_model_id()` 继续用于未知模型
3. **添加测试**：确保新格式预设生成正确
4. **逐步迁移**：不一次性改完所有模型

---

## 迁移检查清单

- [ ] 更新 catalog.json 到 v2 格式（先迁移 1 个模型测试）
- [ ] 运行 catalog 测试确保加载正确
- [ ] 运行预设生成测试确保格式正确
- [ ] 删除 `find_model_with_fallback()` 函数
- [ ] 更新 `get_speed_score()` 和 `get_accuracy_score()` 函数
- [ ] 手动测试 UI 显示是否正常
- [ ] 手动测试模型扫描是否正常
- [ ] 迁移剩余模型到新格式

---

## 时间评估

- **Catalog 迁移**：0.5 天（优先）
- **测试验证**：0.5 天
- **代码清理**：0.5 天（可选）

**总计**：约 1.5 天（主要是测试验证，代码改动很少）

---

## 总结

**关键发现**：代码层面已经支持新结构，只需迁移数据即可。

**主要收益**：
1. 数据冗余减少（语言列表只写一次）
2. 维护成本降低（添加新模型更简单）
3. 概念更清晰（模型 ID vs 量化版本）

**改动范围**：
- 数据迁移（catalog.json）
- 删除少量代码（约 10 行）
- 保留 fallback 逻辑（向后兼容）