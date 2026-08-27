---
title: "Voconly Complete Usage Guide: From Installation to Efficient Use"
description: "Detailed introduction to Voconly's installation, configuration, and usage methods to help you quickly get started with this offline voice input tool."
date: "2026-08-12"
---

## What is Voconly?

Voconly is a local-first AI voice input assistant that combines speech-to-text with large language model (LLM) post-processing capabilities, helping you efficiently complete text input using voice. Whether meeting notes, email writing, or daily memos, Voconly can intelligently convert your spoken content into structured text.

Core value: Completely offline-capable, all processing done locally, protecting privacy and security; global hotkey triggered anytime, no network dependency; real-time transcription lets you see recognition results instantly. This guide will start from scratch, walking you through installation, configuration, and mastering efficient usage techniques.

## Installation and Startup

### Download Links

- GitHub Releases: https://github.com/xinkyle/Voconly/releases
- Official website: https://www.voconly.com

Just download the latest version installer.

### System Requirements

- Operating System: Windows 10/11
- Hardware: GPU recommended (NVIDIA graphics card) for faster transcription speed; CPU mode also works without GPU

### First Launch

After installation, Voconly will guide you through basic configuration on first launch:
1. Select ASR (speech recognition) model
2. Set global hotkey
3. (Optional) Configure LLM service

The entire process is simple and intuitive, usually completed in a few minutes.

## Model Configuration

### ASR Model Selection

Voconly supports multiple ASR models. Beginners are recommended to start with:

- **SenseVoice Small**: Excellent Chinese recognition, fast response, suitable for pure Chinese scenarios.

If you need higher recognition accuracy, especially for Chinese-English mixed transcription scenarios, we recommend the qwen-asr 1.7b model, but it requires more VRAM and computing resources. The system downloads the Q5 quantized version by default as a balance between performance and quality.

If you have a local GPU and ample memory, we recommend visiting these two websites:
Chinese users visit ModelScope: https://www.modelscope.cn/profile/voconly
English users visit HuggingFace: https://huggingface.co/voconly-org
Download more quantized versions of models:
Usually F16 > Q8 > Q5 > Q4
The earlier ones are larger and use more resources—choose based on your local resources.

After downloading, models can be placed in the default location,
or in a custom location. Through the model list in settings, there's an import external model button in the speech-to-text model card. Click it and add the model directory to use. Each model uses the highest quantization version by default—if both Q5 and Q8 versions exist, selecting that model will use the Q8 version by default.

### Model Download

When first selecting a model, Voconly automatically downloads the selected model from HuggingFace or ModelScope based on language selection. Download progress is displayed on the interface—please wait patiently. Models are cached locally, no need to re-download for future use.

### LLM Configuration (Optional)

LLM is used for polishing, translating, or generating meeting notes from transcription results. You can choose:

**Local solutions:**
- Llama.cpp: Directly load local GGUF models
- Ollama: Run local models through Ollama

**Cloud APIs:**
- OpenAI, DeepSeek, Qwen, Claude, Zhipu AI, etc.

Just enter the corresponding API key in settings to enable. If you don't need LLM functionality for now, you can skip this step.

## Hotkey Settings

### How to Set

Find the "Hotkey" option in settings, click the input box and press the key you want to use. Supports:

- **Single keys**: F1-F12, number keys, letter keys, etc.

### Usage Tips

- **Normal mode**: Press hotkey to start recording, real-time transcription begins. Press hotkey again to process remaining audio. If LLM (large model) is configured, it will be processed by the large model according to the selected prompt, returning results.
- **Skip LLM**: Double-click hotkey (press twice quickly), only transcribe without LLM processing (even if scenario is configured with LLM, it will skip), suitable for quick input of content that doesn't need polishing

Hotkey works globally, can be used in any application.

## Scenario Configuration

### What is Scenario-based Configuration

A scenario is a set of preset LLM prompts and processing rules. In different scenarios, the same voice content will be processed into different style results. For example, "meeting notes" scenario generates structured minutes, while "email writing" scenario generates formal email format.

### Recommended Scenario Examples

1. **Meeting Notes**: Organize spoken content into meeting minutes, automatically extracting key topics and action items
2. **Email Writing**: Convert conversational input to formal email format, automatically organizing paragraphs
3. **Simple Polish**: Simple polishing of transcription results—typos, incorrect expressions, punctuation—keeping the original conversational feel
4. **Professional Polish**: More formal processing of transcription results, re-expressing based on original meaning to get logically clear results

### How to Customize Scenarios

In scenario settings, click "New Scenario" and enter scenario name and prompt. System provides default prompts, also supports user-defined prompts.

## Usage Tips

### Real-time Transcription Experience

Voconly supports real-time transcription—after pressing hotkey, you can see text appearing on screen in real-time. This lets you confirm recognition results instantly, and if you find errors, you can adjust speaking speed or rephrase immediately.

### Getting Best Recognition Results

- **Microphone quality**: Use a microphone with good noise reduction to avoid environmental noise interference. Built-in microphone works too, but effectiveness decreases in noisy environments
- **Speech clarity**: Maintain normal speed, enunciate clearly. Too fast or mumbling increases recognition errors
- **Moderate distance**: Mouth 10-30 cm from microphone is appropriate
- **Quiet environment**: Higher recognition rate in quiet environments

### Common Issue Handling

- **Low recognition rate**: Check if microphone is working properly, try using a larger model
- **Slow transcription speed**: If you have GPU, ensure drivers are correctly installed; or try using a smaller model
- **Slow LLM processing**: Local models need more VRAM, or switch to cloud API processing

## Summary

Voconly combines offline speech recognition with intelligent text processing, letting you efficiently complete various text input tasks using voice. From installation and startup, model selection to hotkey and scenario configuration, this guide covers the core usage flow. Recommended starting with SenseVoice Small or Qwen ASR 1.7B, gradually exploring the usage style that suits you. Download Voconly and unleash your productivity with voice.