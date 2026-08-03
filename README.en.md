# Voconly

**A Local-first AI Voice Input Assistant.**

**Make your voice your second keyboard.**

Speak, let AI organize it, and your ideas become usable content instantly.

*Open-sourced by Laoxing.AI | 15-year entrepreneur exploring personal creation in the AI era*

---

## Why Voconly?

We spend a significant amount of time typing every day: writing emails, drafting proposals, replying to messages, and organizing thoughts. Yet the keyboard isn't the most natural human-computer interaction method.

Often, our minds already have complete ideas, but typing speed limits expression.

Language is humanity's most natural form of expression. In the AI era, voice shouldn't just be a substitute for text input—it should become a new interface for human-AI collaboration.

**Voconly's goal: Give everyone an AI input assistant that's always ready to listen, understand, and organize your thoughts, with core capabilities available without cloud dependency.**

---

## Core Features

### Scenario-based Configuration

Configure dedicated combinations for different use cases:

- Custom scenario names
- Bind hotkeys for one-click recording
- Choose ASR models (Whisper / SenseVoice / Parakeet / Qwen-Asr)
- Optional LLM post-processing (light polish, translation, professional polish, meeting secretary, custom prompts supported)

### Real-time Transcription

- Real-time transcription: See text as you speak
- Supports streaming models (Nemotron) and automatic optimization for non-streaming models

### Local ASR, Privacy-first

- Local speech recognition engine, data never leaves your device
- Supports multiple models: Whisper, SenseVoice, Parakeet, Qwen-Asr
- Zero network latency, always available

### Flexible LLM Support

- Local models: Run via Llama.cpp
- Cloud APIs: Support for multiple providers
- Built-in processing modes: light polish, translation, professional polish, meeting secretary
- Custom presets: Configure processing logic as needed

### Quick Trigger

- Global hotkey activation
- One keystroke completes recording → transcription → LLM processing
- Results automatically output to cursor position

---

## LLM Processing Modes

| Mode | Description |
|------|-------------|
| Light Polish | Fix typos and punctuation, preserve original meaning |
| Translation | Chinese→English, cross-language expression |
| Professional Polish | Convert spoken to written style, formal expression |
| Meeting Secretary | Summarize meeting key points, structured output |
| Custom Preset | Configure processing logic as needed |

---

## Use Cases

| Scenario | Typical Uses |
|----------|--------------|
| Content Creation | Article ideas, video scripts, creative thoughts |
| Workplace | Email drafting, work summaries, meeting notes |
| Developers | Requirement descriptions, technical ideas, issue writing |
| Daily Records | Inspiration notes, learning insights, life logging |

---

## My Story

Voconly is not just a technology experiment.

It comes from a personal restart.

I've been an entrepreneur for over 15 years, experiencing rapid company growth, team expansion, pressure, and restructuring.

For a long time, I was an entrepreneur and manager.

But AI helped me rediscover my identity as a creator.

I started exploring AI in depth in 2024.

From not knowing how to use AI for programming, to completing products independently with AI.

I gradually discovered:

> AI's greatest value is not replacing programmers, but enabling more ordinary people to regain creative abilities.

Voconly is one practice from this journey.

I hope to validate through this project:

Whether one person + AI can create what used to require a team.

---

## Installation

### Download

Go to the [Releases](https://github.com/xinkyle/Voconly/releases) page to download the latest version.

### Requirements

- Windows 10/11
- GPU recommended for better performance

### Build from Source

```powershell
# 1. Install dependencies
.\setup.ps1

# 2. Run in development mode
pnpm tauri dev

# 3. Or build release version
pnpm tauri build
```

---

## Roadmap

Completed:
- Local speech recognition (Whisper / SenseVoice / Parakeet / Qwen-Asr)
- LLM post-processing (light polish, translation, professional polish, meeting secretary, custom)
- Scenario-based configuration (hotkey + model + LLM)
- Desktop application (Windows)

Planned:
- macOS / Linux support
- More features welcome your feedback.

If you have ideas, feel free to submit an [Issue](https://github.com/xinkyle/Voconly/issues).

---

## Tech Stack

- Desktop Framework: Tauri 2.0
- Frontend: React + TypeScript
- Speech Recognition: Whisper.cpp (local)
- AI Processing: Local LLM + Cloud API
- Language: Rust + TypeScript

---

## Why Open Source?

The biggest opportunity in the AI era isn't just having AI tools, but enabling everyone to use AI to create their own tools.

Voconly is the beginning of this exploration. I hope to validate: what one person + AI can create.

If this helps you, a Star would be appreciated.

---

## Contributing

Bug reports, suggestions, and code improvements are welcome. Let's explore new ways of productivity in the AI era together.

---

## License

MIT License

Copyright (c) 2026 Xing Yong

---

## About the Author

**Xing Yong (Laoxing.AI)**

15 years of entrepreneurship, long-term focus on AI, big data, and personal creativity. Currently exploring how individuals can regain creative abilities in the AI era.

Follow me on WeChat Official Account, Xiaohongshu, and other platforms: **老幸.AI**

- GitHub: [xinkyle](https://github.com/xinkyle)
- Email: laoxingai@139.com