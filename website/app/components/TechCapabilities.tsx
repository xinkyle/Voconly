'use client';

import { motion } from 'framer-motion';
import { Cpu, Cloud, Shield, Globe, Check } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

export default function TechCapabilities() {
  const { lang } = useI18n();

  return (
    <section className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }} suppressHydrationWarning>
      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12" suppressHydrationWarning>
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 mb-5">
            <span className="w-8 h-px" style={{ background: 'var(--color-accent)' }} />
            <span className="font-body text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>
              {lang === 'zh' ? '03 · 模型选择' : '03 · Model Choice'}
            </span>
            <span className="w-8 h-px" style={{ background: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {lang === 'zh' ? '你的语音，你来定' : 'Your Voice, Your Choice'}
          </h2>
          <p className="font-body text-lg text-white/50 max-w-2xl mx-auto">
            {lang === 'zh'
              ? '本地还是云端，模型还是 Provider，都由你选择。'
              : 'Local or cloud, model or provider — you decide.'}
          </p>
        </motion.div>

        {/* 4个卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 语音识别 */}
          <div className="p-6 rounded-xl border border-white/[0.06]" style={{ background: 'rgba(255, 255, 255, 0.02)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--color-accent)]/10">
                <Cpu className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <h4 className="font-body text-lg font-semibold text-white">
                {lang === 'zh' ? '语音识别' : 'ASR'}
              </h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { name: 'Whisper', logo: '/icons/openai.png' },
                { name: 'SenseVoice', logo: '/icons/custom.png' },
                { name: 'Parakeet', logo: '/icons/nvidia.svg' },
                { name: 'Qwen-ASR', logo: '/icons/qwen.png' },
                { name: 'Cohere', logo: '/icons/cohere-logo.svg' },
                { name: 'Nemotron', logo: '/icons/nvidia.svg' },
              ].map((model) => (
                <motion.div
                  key={model.name}
                  whileHover={{ scale: 1.05 }}
                  className="group flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[var(--color-accent)]/50 transition-all cursor-pointer"
                >
                  <img
                    src={model.logo}
                    alt={model.name}
                    className="w-6 h-6 object-contain mb-1"
                  />
                  <span className="font-body text-[10px] text-white/70 group-hover:text-white transition-colors text-center">
                    {model.name}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 大语言模型 */}
          <div className="p-6 rounded-xl border border-white/[0.06]" style={{ background: 'rgba(255, 255, 255, 0.02)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--color-accent)]/10">
                <Cloud className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <h4 className="font-body text-lg font-semibold text-white">
                {lang === 'zh' ? '语言模型' : 'LLM'}
              </h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { name: 'Ollama', logo: '/icons/ollama.png' },
                { name: 'OpenAI', logo: '/icons/openai.png' },
                { name: 'Claude', logo: '/icons/anthropic.png' },
                { name: 'Gemini', logo: '/icons/gemini.png' },
                { name: 'DeepSeek', logo: '/icons/deepseek.png' },
                { name: 'Qwen', logo: '/icons/qwen.png' },
                { name: 'GLM', logo: '/icons/zhipu.png' },
                { name: 'Kimi', logo: '/icons/kimi.png' },
                { name: 'Groq', logo: '/icons/groq.png' },
              ].map((provider) => (
                <motion.div
                  key={provider.name}
                  whileHover={{ scale: 1.05 }}
                  className="group flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[var(--color-accent)]/50 transition-all cursor-pointer"
                >
                  <img
                    src={provider.logo}
                    alt={provider.name}
                    className="w-6 h-6 object-contain mb-1"
                  />
                  <span className="font-body text-[10px] text-white/70 group-hover:text-white transition-colors text-center">
                    {provider.name}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 隐私与安全 */}
          <div className="p-6 rounded-xl border border-white/[0.06]" style={{ background: 'rgba(255, 255, 255, 0.02)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--color-accent)]/10">
                <Shield className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <h4 className="font-body text-lg font-semibold text-white">
                {lang === 'zh' ? '隐私安全' : 'Privacy'}
              </h4>
            </div>
            <div className="space-y-2">
              {[
                lang === 'zh' ? '本地处理，数据不上传' : 'Local processing',
                lang === 'zh' ? '无需注册，开箱即用' : 'No account required',
                lang === 'zh' ? '完全离线运行' : 'Works offline',
                lang === 'zh' ? '开源透明' : 'Open source',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0 mt-0.5" />
                  <span className="font-body text-xs text-white/60 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 多语言支持 */}
          <div className="p-6 rounded-xl border border-white/[0.06]" style={{ background: 'rgba(255, 255, 255, 0.02)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--color-accent)]/10">
                <Globe className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <h4 className="font-body text-lg font-semibold text-white">
                {lang === 'zh' ? '多语言' : 'Languages'}
              </h4>
            </div>
            <div className="mb-3">
              <div className="font-display text-3xl text-[var(--color-accent)]">99+</div>
              <div className="font-body text-xs text-white/50">
                {lang === 'zh' ? '种语言和方言' : 'languages supported'}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {['中文', 'English', '日本語', '한국어', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', 'Русский', 'العربية', 'हिन्दी', 'Tiếng Việt', 'ไทย', 'Nederlands', 'Polski', 'Türkçe', 'Bahasa', 'Svenska', 'Norsk'].map((lang_name) => (
                <span
                  key={lang_name}
                  className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-[10px] font-body"
                >
                  {lang_name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}