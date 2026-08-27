export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqCategory {
  category: string;
  items: FaqItem[];
}

// 中文 FAQ
export const faqZh: FaqCategory[] = [
  {
    category: '通用问题',
    items: [
      {
        question: '如何使用 Voconly？',
        answer: `使用非常简单，只需三步：

**基本流程：**
1. **单击快捷键** - 开始录音（默认 \`[\` 键）
2. **说话** - 对着麦克风说出你想输入的内容
3. **再次单击快捷键** - 结束录音，如果配置了 LLM，会先经过大模型处理再输出

**双击快捷键结束（直接输出）：**
• 结束录音时双击快捷键，会直接输出原始识别结果
• 不经过 LLM 处理，即使配置了 LLM 也会跳过
• 适合需要快速输入、不需要润色的场景

**单击结束（LLM 处理）：**
• 结束录音时单击快捷键，如果配置了 LLM，会先经过大模型处理
• 自动润色、添加标点、格式化后再输出
• 适合需要整理成文的场景

应用常驻系统托盘，在任何应用中都能使用。`,
      },
      {
        question: 'Voconly 是免费的吗？',
        answer: `是的。Voconly 完全免费且开源（MIT 协议）。所有核心功能永久免费：
• 离线语音识别（本地模型）
• 全局快捷键
• 多语言支持
• LLM 智能处理（需自己配置 API）

没有付费版本，没有功能限制，没有使用次数限制。`,
      },
      {
        question: 'Voconly 是开源的吗？',
        answer: `是的。源代码托管在 GitHub：
• **仓库地址：** https://github.com/xinkyle/Voconly
• **开源协议：** MIT License

欢迎提交 Issue、Pull Request 或帮助翻译。`,
      },
      {
        question: '我的语音数据会上传到云端吗？',
        answer: `**不会**，目前支持的是本地语音模型转录，暂时不支持云端语音模型。

• **离线语音识别**：完全在本地运行，不需要网络
• **本地模型**：音频在本地处理，不上传任何数据
• **LLM 智能处理**（可选）：如果配置了在线 AI API，文字会发送到你配置的服务商

如果你只需要离线语音输入，可以完全禁用 LLM 功能，所有数据留在本地。`,
      },
      {
        question: 'Voconly 支持哪些平台？',
        answer: `| 平台 | 支持 | 备注 |
|------|------|------|
| Windows | ✅ 完全支持 | Windows 10/11 |`,
      },
    ],
  },
  {
    category: '安装与配置',
    items: [
      {
        question: '如何安装 Voconly？',
        answer: `**Windows：**
1. 从 [GitHub Releases](https://github.com/xinkyle/Voconly/releases) 下载 \`.exe\` 安装包
2. 运行安装程序
3. 首次启动会提示下载语音识别模型`,
      },
      {
        question: '首次启动需要做什么？',
        answer: `1. **下载模型** - 首次使用需要下载模型
2. **授予权限** - macOS 需要授予麦克风和辅助功能权限
3. **设置快捷键** - 可以自定义快捷键`,
      },
    ],
  },
  {
    category: '语音识别模型',
    items: [
      {
        question: '我应该使用哪个模型？',
        answer: `根据你的使用场景选择：

**中文场景：**

| 需求 | 推荐模型 | 说明 |
|------|----------|------|
| 纯中文语音 | SenseVoice Small | 速度快，资源消耗低 |
| 中英混合语音 | Qwen3-ASR 1.7B | 中英混合效果最佳，准确率最高 |
| 中文方言 | Qwen3-ASR 1.7B | 支持22种中文方言 |

**英文场景：**

| 需求 | 推荐模型 | 说明 |
|------|----------|------|
| 英语专项 | Parakeet Unified EN 0.6B | 英语专项优化，支持流式推理 |
| 综合英文 | Cohere Transcribe | HuggingFace Open ASR 排行榜#1 |

**其他场景：**

| 需求 | 推荐模型 | 说明 |
|------|----------|------|
| 低延迟/实时 | Nemotron 3.5 ASR Streaming | 流式处理，80ms超低延迟 |
| 多语言覆盖 | Whisper Large v3 Turbo | 支持99种语言，内置翻译 |
| 低配置电脑 | SenseVoice Small / Nemotron 0.6B | 资源消耗小，纯CPU可运行 |

**硬件建议：**
• 有 NVIDIA GPU：可用 Qwen3-ASR 或 Cohere，启用 GPU 加速更快
• 无 GPU：建议 SenseVoice Small 或 Nemotron，纯CPU运行流畅`,
      },
      {
        question: '本地模型和云端模型有什么区别？',
        answer: `Voconly 目前只支持本地模型，所有语音识别完全在本地完成。

**本地模型的优势：**
• 无需联网，断网也能使用
• 数据完全不上传，隐私安全
• 无使用次数限制
• 无额外费用

**可用模型：**
• Qwen3-ASR、SenseVoice、Cohere、Parakeet、Nemotron、Whisper 等
• 模型文件下载后即可离线使用`,
      },
      {
        question: '模型下载很慢或失败怎么办？',
        answer: `1. 检查网络连接
2. 检查磁盘空间（模型文件 0.5GB-2GB）
3. 如果下载中断，可以重新点击下载
4. **手动下载导入：**
   • 从 [ModelScope](https://modelscope.cn/profile/voconly) 或 [HuggingFace](https://huggingface.co/voconly-org) 下载模型
   • 在模型列表中点击"导入外部模型"
   • 选择模型所在文件夹即可导入`,
      },
    ],
  },
  {
    category: '使用问题',
    items: [
      {
        question: '快捷键是什么？可以修改吗？',
        answer: `**默认快捷键：**

| 平台 | 快捷键 |
|------|--------|
| Windows | \`[\`, \`]\` |

可以在设置中自定义快捷键。`,
      },
      {
        question: '按下快捷键后没有反应？',
        answer: `按顺序检查：

1. **检查麦克风权限**
   - Windows：设置 > 隐私 > 麦克风

2. **检查模型是否已下载**
   - 打开设置，确认模型状态为"已下载"

3. **重启应用**
   - 尝试重启应用

4. **检查快捷键冲突**
   - 可能与其他软件快捷键冲突，尝试更换快捷键`,
      },
      {
        question: '为什么识别结果出现"Thank you"但我没说？',
        answer: `这是 Whisper 模型的已知问题：当检测到静音时，有时会"幻觉"出 "Thank you"。

**解决方法：**
• 按下快捷键后立即开始说话，不要停顿太久`,
      },
      {
        question: '为什么第一个字或最后一个字被切掉？',
        answer: `这是音频捕获的时序问题。

**解决方法：**
• 按下快捷键后，停顿半秒再开始说话
• 说完后，停顿半秒再松开快捷键
• 给音频捕获留出启动和停止的时间`,
      },
      {
        question: '为什么快速说话时识别不准确？',
        answer: `说话太快会导致识别准确率下降。

**解决方法：**
• 稍微放慢语速
• 吐字清晰，减少连读
• 尝试使用准确率更高的模型（如 Qwen3-ASR）`,
      },
      {
        question: '专业技术术语识别不准确怎么办？',
        answer: `**解决方法：**
• 吐字清晰，适当放慢语速
• 后续版本会支持自定义词典`,
      },
    ],
  },
  {
    category: 'LLM 智能处理',
    items: [
      {
        question: 'LLM 智能处理是什么？',
        answer: `LLM 功能可以对识别结果进行智能处理：
• **修正错别字** - 自动纠正识别错误
• **添加标点** - 智能添加逗号、句号等
• **格式化** - 自动分段、列表格式
• **润色** - 使文字更通顺（可选）`,
      },
      {
        question: '需要配置 API 吗？',
        answer: `LLM 功能需要自己配置 AI API。支持：
• OpenAI (GPT)
• Anthropic (Claude)
• 本地运行的模型（如 Ollama）
• 其他兼容 OpenAI API 格式的服务

如果不配置，语音识别功能仍可正常使用，只是没有智能处理。`,
      },
      {
        question: '可以禁用 LLM 功能吗？',
        answer: `可以。在设置中关闭 LLM 功能即可，这样会得到原始识别结果，不做任何处理。`,
      },
    ],
  },
  {
    category: '数据与隐私',
    items: [
      {
        question: '转录记录存储在哪里？',
        answer: `完全存储在本地：

| 平台 | 存储路径 |
|------|----------|
| Windows | \`%LOCALAPPDATA%\\Local\\Voconly\\User Data\\\` |`,
      },
      {
        question: '可以导出数据吗？',
        answer: `目前不支持导出数据功能。`,
      },
      {
        question: '如何完全清除数据？',
        answer: `历史记录存储在 history.db 中。`,
      },
    ],
  },
  {
    category: '更新与支持',
    items: [
      {
        question: '如何检查更新？',
        answer: `• Windows：设置 > 关于 > 检查更新
• 应用启动的时候会自动检查更新`,
      },
      {
        question: '遇到问题如何反馈？',
        answer: `1. **GitHub Issues：** https://github.com/xinkyle/Voconly/issues
2. 描述问题和复现步骤
3. 附上系统信息和错误日志（如有）`,
      },
    ],
  },
  {
    category: '使用场景',
    items: [
      {
        question: 'Voconly 适合什么场景？',
        answer: `• **会议记录** - 快速记录会议要点
• **文档撰写** - 邮件、报告、文章等
• **即时通讯** - 微信、Slack 等快速回复
• **编程辅助** - 代码注释、Prompt 编写
• **无障碍辅助** - 帮助手部不便的用户
• **内容创作** - 视频/播客字幕、博客`,
      },
      {
        question: '可以用于编程吗？',
        answer: `可以。`,
      },
    ],
  },
];

// 英文 FAQ
export const faqEn: FaqCategory[] = [
  {
    category: 'General',
    items: [
      {
        question: 'How do I use Voconly?',
        answer: `It's simple - just three steps:

**Basic Flow:**
1. **Single press shortcut** - Start recording (default \`[\` key)
2. **Speak** - Say what you want to input
3. **Single press again** - Stop recording, if LLM is configured, text goes through AI processing first

**Double-tap to End (Direct Output):**
• Double-tap the shortcut to end recording and output raw recognition results
• Skips LLM processing even if configured
• Perfect for quick input when you don't need polishing

**Single-tap to End (LLM Processing):**
• Single-tap to end - if LLM is configured, text goes through AI processing first
• Auto-polish, add punctuation, and format before output
• Great for turning speech into polished text

The app runs in the system tray and works across all your apps.`,
      },
      {
        question: 'Is Voconly free?',
        answer: `Yes. Voconly is completely free and open source (MIT License). All core features are permanently free:
• Offline speech recognition (local models)
• Global shortcuts
• Multi-language support
• LLM smart processing (requires your own API)

No paid version, no feature limits, no usage limits.`,
      },
      {
        question: 'Is Voconly open source?',
        answer: `Yes. Source code is hosted on GitHub:
• **Repository:** https://github.com/xinkyle/Voconly
• **License:** MIT License

Feel free to submit Issues, Pull Requests, or help with translations.`,
      },
      {
        question: 'Will my voice data be uploaded to the cloud?',
        answer: `**No.** Voconly currently only supports local speech model transcription, not cloud models.

• **Offline Speech Recognition:** Runs entirely locally, no network needed
• **Local Models:** Audio is processed locally, no data is uploaded
• **LLM Smart Processing** (optional): If you configure an online AI API, text will be sent to your configured provider

If you only need offline voice input, you can completely disable LLM features. All data stays local.`,
      },
      {
        question: 'Which platforms does Voconly support?',
        answer: `| Platform | Support | Notes |
|----------|---------|-------|
| Windows | ✅ Full Support | Windows 10/11 |`,
      },
    ],
  },
  {
    category: 'Installation & Configuration',
    items: [
      {
        question: 'How to install Voconly?',
        answer: `**Windows:**
1. Download the \`.exe\` installer from [GitHub Releases](https://github.com/xinkyle/Voconly/releases)
2. Run the installer
3. On first launch, you'll be prompted to download the speech recognition model`,
      },
      {
        question: 'What should I do on first launch?',
        answer: `1. **Download Model** - Required for first-time use
2. **Grant Permissions** - macOS needs microphone and accessibility permissions
3. **Set Shortcuts** - You can customize shortcuts`,
      },
    ],
  },
  {
    category: 'Speech Recognition Models',
    items: [
      {
        question: 'Which model should I use?',
        answer: `Choose based on your use case:

**Chinese Scenarios:**

| Need | Recommended Model | Notes |
|------|-------------------|-------|
| Pure Chinese | SenseVoice Small | Fast, low resource usage |
| Chinese-English Mixed | Qwen3-ASR 1.7B | Best mixed accuracy |
| Chinese Dialects | Qwen3-ASR 1.7B | Supports 22 Chinese dialects |

**English Scenarios:**

| Need | Recommended Model | Notes |
|------|-------------------|-------|
| English-focused | Parakeet Unified EN 0.6B | English-optimized, streaming support |
| General English | Cohere Transcribe | HuggingFace Open ASR #1 |

**Other Scenarios:**

| Need | Recommended Model | Notes |
|------|-------------------|-------|
| Low latency/Real-time | Nemotron 3.5 ASR Streaming | Streaming, 80ms ultra-low latency |
| Multi-language | Whisper Large v3 Turbo | 99 languages, built-in translation |
| Low-spec PC | SenseVoice Small / Nemotron 0.6B | Low resource, pure CPU runnable |

**Hardware Recommendations:**
• With NVIDIA GPU: Use Qwen3-ASR or Cohere with GPU acceleration for faster performance
• No GPU: Use SenseVoice Small or Nemotron for smooth CPU-only operation`,
      },
      {
        question: "What's the difference between local and cloud models?",
        answer: `Voconly currently only supports local models. All speech recognition runs entirely locally.

**Local Model Advantages:**
• No internet needed, works offline
• No data uploads, privacy-safe
• No usage limits
• No extra costs

**Available Models:**
• Qwen3-ASR, SenseVoice, Cohere, Parakeet, Nemotron, Whisper, etc.
• Once downloaded, models work offline`,
      },
      {
        question: 'Model download is slow or failing?',
        answer: `1. Check your network connection
2. Check disk space (models are 0.5GB-2GB)
3. If interrupted, retry the download
4. **Manual Import:**
   - Download from [ModelScope](https://modelscope.cn/profile/voconly) or [HuggingFace](https://huggingface.co/voconly-org)
   - Click "Import External Model" in the model list
   - Select the model folder to import`,
      },
    ],
  },
  {
    category: 'Usage Issues',
    items: [
      {
        question: 'What are the shortcuts? Can I change them?',
        answer: `**Default Shortcuts:**

| Platform | Shortcut |
|----------|----------|
| Windows | \`[\`, \`]\` |

You can customize shortcuts in settings.`,
      },
      {
        question: 'No response after pressing the shortcut?',
        answer: `Check in order:

1. **Check Microphone Permissions**
   - Windows: Settings > Privacy > Microphone

2. **Check if Model is Downloaded**
   - Open settings, confirm model status shows "Downloaded"

3. **Restart the App**
   - Try restarting

4. **Check Shortcut Conflicts**
   - May conflict with other apps, try changing the shortcut`,
      },
      {
        question: 'Why does "Thank you" appear when I didn\'t say it?',
        answer: `This is a known issue with Whisper models: when detecting silence, it sometimes "hallucinates" "Thank you".

**Solution:**
• Start speaking immediately after pressing the shortcut, don't pause too long`,
      },
      {
        question: 'Why is the first or last word cut off?',
        answer: `This is a timing issue with audio capture.

**Solution:**
• After pressing shortcut, pause half a second before speaking
• After finishing, pause half a second before releasing
• Give audio capture time to start and stop`,
      },
      {
        question: 'Why is recognition inaccurate when speaking fast?',
        answer: `Speaking too fast reduces accuracy.

**Solution:**
• Slow down slightly
• Speak clearly, reduce connected speech
• Try a more accurate model (like Qwen3-ASR)`,
      },
      {
        question: 'Technical terminology not recognized accurately?',
        answer: `**Solution:**
• Speak clearly, slow down slightly
• Future versions will support custom dictionaries`,
      },
    ],
  },
  {
    category: 'LLM Smart Processing',
    items: [
      {
        question: 'What is LLM smart processing?',
        answer: `LLM features can intelligently process recognition results:
• **Fix typos** - Automatically correct recognition errors
• **Add punctuation** - Smart comma, period, etc.
• **Format** - Auto paragraphs, list formatting
• **Polish** - Make text smoother (optional)`,
      },
      {
        question: 'Do I need to configure an API?',
        answer: `LLM features require configuring your own AI API. Supports:
• OpenAI (GPT)
• Anthropic (Claude)
• Local models (like Ollama)
• Other OpenAI API-compatible services

Without configuration, speech recognition still works, just without smart processing.`,
      },
      {
        question: 'Can I disable LLM features?',
        answer: `Yes. Turn off LLM features in settings to get raw recognition results without any processing.`,
      },
    ],
  },
  {
    category: 'Data & Privacy',
    items: [
      {
        question: 'Where are transcription records stored?',
        answer: `Entirely locally:

| Platform | Storage Path |
|----------|--------------|
| Windows | \`%LOCALAPPDATA%\\Local\\Voconly\\User Data\\\` |`,
      },
      {
        question: 'Can I export data?',
        answer: `Data export is not currently supported.`,
      },
      {
        question: 'How to completely clear data?',
        answer: `History is stored in history.db.`,
      },
    ],
  },
  {
    category: 'Updates & Support',
    items: [
      {
        question: 'How to check for updates?',
        answer: `• Windows: Settings > About > Check for Updates
• App automatically checks for updates on startup`,
      },
      {
        question: 'How to report issues?',
        answer: `1. **GitHub Issues:** https://github.com/xinkyle/Voconly/issues
2. Describe the problem and steps to reproduce
3. Include system info and error logs (if available)`,
      },
    ],
  },
  {
    category: 'Use Cases',
    items: [
      {
        question: 'What scenarios is Voconly suitable for?',
        answer: `• **Meeting Notes** - Quickly record meeting points
• **Document Writing** - Emails, reports, articles, etc.
• **Instant Messaging** - Quick replies in WeChat, Slack, etc.
• **Programming** - Code comments, prompt writing
• **Accessibility** - Help users with hand mobility issues
• **Content Creation** - Video/podcast subtitles, blogs`,
      },
      {
        question: 'Can it be used for programming?',
        answer: `Yes.`,
      },
    ],
  },
];

export const faqData: Record<'zh' | 'en', FaqCategory[]> = {
  zh: faqZh,
  en: faqEn,
};

// 首页精选的高频问题
export const featuredFaqZh: FaqItem[] = [
  {
    question: '如何使用 Voconly？',
    answer: `使用非常简单：单击快捷键开始录音 → 说话 → 再次单击或双击快捷键结束。

• **单击结束**：如果配置了 LLM，会先经过大模型润色处理
• **双击结束**：直接输出原始识别结果，跳过 LLM 处理

应用常驻系统托盘，在任何应用中都能使用。`,
  },
  {
    question: 'Voconly 是免费的吗？',
    answer: `是的。Voconly 完全免费且开源（MIT 协议）。所有核心功能永久免费，没有付费版本，没有功能限制，没有使用次数限制。`,
  },
  {
    question: 'Voconly 是开源的吗？',
    answer: `是的。源代码托管在 GitHub：https://github.com/xinkyle/Voconly，采用 MIT License 开源协议。欢迎提交 Issue、Pull Request 或帮助翻译。`,
  },
  {
    question: '我的语音数据会上传到云端吗？',
    answer: `不会。Voconly 使用本地语音模型进行转录，所有语音识别完全在本地完成，音频数据不会上传到任何服务器。`,
  },
  {
    question: 'Voconly 支持哪些平台？',
    answer: `目前完全支持 Windows 10/11。macOS 和 Linux 版本正在开发中。`,
  },
  {
    question: '如何安装 Voconly？',
    answer: `从 GitHub Releases 下载 .exe 安装包，运行安装程序即可。首次启动会提示下载语音识别模型。`,
  },
  {
    question: '快捷键是什么？可以修改吗？',
    answer: `Windows 默认快捷键是 [ 和 ] 键。可以在设置中自定义快捷键。`,
  },
];

export const featuredFaqEn: FaqItem[] = [
  {
    question: 'How do I use Voconly?',
    answer: `Simple: Single press shortcut to start → Speak → Single press or double-tap to end.

• **Single press to end**: If LLM is configured, text goes through AI polishing first
• **Double-tap to end**: Outputs raw recognition results, skips LLM processing

The app runs in the system tray and works across all apps.`,
  },
  {
    question: 'Is Voconly free?',
    answer: `Yes. Voconly is completely free and open source (MIT License). All core features are permanently free - no paid version, no feature limits, no usage limits.`,
  },
  {
    question: 'Is Voconly open source?',
    answer: `Yes. Source code is hosted on GitHub: https://github.com/xinkyle/Voconly, licensed under MIT License. Feel free to submit Issues, Pull Requests, or help with translations.`,
  },
  {
    question: 'Will my voice data be uploaded to the cloud?',
    answer: `No. Voconly uses local speech models for transcription. All speech recognition runs entirely locally - no audio data is uploaded to any server.`,
  },
  {
    question: 'Which platforms does Voconly support?',
    answer: `Currently fully supports Windows 10/11. macOS and Linux versions are in development.`,
  },
  {
    question: 'How to install Voconly?',
    answer: `Download the .exe installer from GitHub Releases and run it. On first launch, you'll be prompted to download the speech recognition model.`,
  },
  {
    question: 'What are the shortcuts? Can I change them?',
    answer: `Windows default shortcuts are the [ and ] keys. You can customize shortcuts in settings.`,
  },
];

export const featuredFaqData: Record<'zh' | 'en', FaqItem[]> = {
  zh: featuredFaqZh,
  en: featuredFaqEn,
};