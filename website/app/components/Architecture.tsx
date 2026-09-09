'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Cpu, BrainCircuit, Keyboard } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

type LogoItem = { name: string; logo: string };

function LogoChip({ item }: { item: LogoItem }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors"
      style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
    >
      <img src={item.logo} alt={item.name} className="w-4 h-4 object-contain" />
      <span className="font-body text-xs text-white/70">{item.name}</span>
    </div>
  );
}

export default function Architecture() {
  const { lang } = useI18n();
  const isZh = lang === 'zh';

  const asrModels: LogoItem[] = [
    { name: 'Whisper', logo: '/icons/openai.png' },
    { name: 'SenseVoice', logo: '/icons/custom.png' },
    { name: 'Parakeet', logo: '/icons/nvidia.svg' },
    { name: 'Qwen-ASR', logo: '/icons/qwen.png' },
  ];

  const llmProviders: LogoItem[] = [
    { name: 'Ollama', logo: '/icons/ollama.png' },
    { name: 'OpenAI', logo: '/icons/openai.png' },
    { name: 'Claude', logo: '/icons/anthropic.png' },
    { name: 'Gemini', logo: '/icons/gemini.png' },
    { name: 'DeepSeek', logo: '/icons/deepseek.png' },
    { name: 'Qwen', logo: '/icons/qwen.png' },
    { name: 'GLM', logo: '/icons/zhipu.png' },
    { name: 'Kimi', logo: '/icons/kimi.png' },
    { name: 'Groq', logo: '/icons/groq.png' },
  ];

  const keycaps = isZh
    ? [
        { key: '右 Ctrl', mode: '专业润色' },
        { key: '右 Alt', mode: '轻度润色' },
        { key: '右 Shift', mode: '翻译' },
        { key: 'F5', mode: '会议纪要' },
      ]
    : [
        { key: 'R Ctrl', mode: 'Pro Polish' },
        { key: 'R Alt', mode: 'Light Polish' },
        { key: 'R Shift', mode: 'Translate' },
        { key: 'F5', mode: 'Meeting Notes' },
      ];

  const layers = [
    {
      no: '01',
      icon: Cpu,
      tag: isZh ? '本地优先' : 'Local first',
      title: isZh ? '你的语音转文字' : 'Your speech-to-text',
      desc: isZh
        ? '默认本地运行，音频不离开你的设备。本地模型随你换；想要更高精度，也可以随时接入云端识别。'
        : 'Runs locally by default — audio never leaves your device. Swap local models freely; connect cloud recognition whenever you need extra accuracy.',
    },
    {
      no: '02',
      icon: BrainCircuit,
      tag: isZh ? '自带密钥' : 'Bring your own key',
      title: isZh ? '你的 AI' : 'Your AI',
      desc: isZh
        ? '润色、纪要、翻译交给谁？用你自己的密钥说了算。Ollama 在本地跑，或接入你惯用的云端大模型——换模型不用换工具。'
        : 'Who polishes, summarizes, translates? Your keys, your call. Run Ollama locally or plug in your favorite cloud LLM — swap models without switching tools.',
    },
    {
      no: '03',
      icon: Keyboard,
      tag: isZh ? '完全自定义' : 'Fully yours',
      title: isZh ? '你的快捷键' : 'Your shortcuts',
      desc: isZh
        ? '按下按键，开口说话，成品直接落在光标处。一个键绑定一种工作方式——键位与指令都由你定义。'
        : 'Press a key, speak, and finished text lands at your cursor. One key, one workflow — keys and prompts are yours to define.',
    },
  ];

  return (
    <section id="architecture" className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 背景光晕 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0, 212, 170, 0.15), transparent 70%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12">
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
              {isZh ? '02 · 三层架构' : '02 · Architecture'}
            </span>
            <span className="w-8 h-px" style={{ background: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {isZh ? '三层架构，一切围绕你的选择' : 'Three Layers. Built Around Your Choice.'}
          </h2>
          <p className="font-body text-lg text-white/50 max-w-2xl mx-auto">
            {isZh
              ? '声音怎么变文字、文字交给谁打磨、用哪个键唤起——每一层都开放替换，组合权在你。'
              : 'How voice becomes text, which AI polishes it, which key wakes it — every layer is swappable. The combination is yours.'}
          </p>
        </motion.div>

        {/* 三层卡片 */}
        <div className="max-w-4xl mx-auto">
          {layers.map((layer, i) => {
            const Icon = layer.icon;
            return (
              <div key={layer.no}>
                {i > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4 }}
                    className="flex justify-center py-1.5"
                  >
                    <div
                      className="w-px h-5"
                      style={{ background: 'linear-gradient(rgba(0, 212, 170, 0.5), rgba(255, 255, 255, 0.08))' }}
                    />
                  </motion.div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="rounded-xl p-6 sm:p-8"
                  style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:items-center">
                    {/* 文案区 */}
                    <div className="flex items-start gap-4">
                      <span className="font-display text-4xl leading-none mt-0.5" style={{ color: 'rgba(0, 212, 170, 0.6)' }}>
                        {layer.no}
                      </span>
                      <div>
                        <span
                          className="inline-flex items-center h-6 px-2 rounded-md font-body text-[11px] font-semibold mb-2"
                          style={{
                            background: 'rgba(0, 212, 170, 0.1)',
                            border: '1px solid rgba(0, 212, 170, 0.4)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {layer.tag}
                        </span>
                        <h3 className="font-body text-xl font-semibold text-white mb-2 flex items-center gap-2">
                          <Icon className="w-4.5 h-4.5" style={{ color: 'var(--color-accent)' }} />
                          {layer.title}
                        </h3>
                        <p className="font-body text-sm text-white/50 leading-relaxed">{layer.desc}</p>
                      </div>
                    </div>

                    {/* 视觉区 */}
                    <div>
                      {i === 0 && (
                        <div className="flex flex-wrap gap-2">
                          {asrModels.map((m) => (
                            <LogoChip key={m.name} item={m} />
                          ))}
                          <span
                            className="flex items-center px-2.5 py-1.5 rounded-lg font-body text-xs text-white/40"
                            style={{ border: '1px dashed rgba(255, 255, 255, 0.2)' }}
                          >
                            {isZh ? '+ 云端识别' : '+ Cloud ASR'}
                          </span>
                        </div>
                      )}
                      {i === 1 && (
                        <div className="flex flex-wrap gap-2">
                          {llmProviders.map((m) => (
                            <LogoChip key={m.name} item={m} />
                          ))}
                        </div>
                      )}
                      {i === 2 && (
                        <div className="flex flex-col items-start gap-3">
                          <div className="flex flex-wrap gap-2">
                            {keycaps.map((k) => (
                              <span
                                key={k.key}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg"
                                style={{
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid rgba(255, 255, 255, 0.12)',
                                  boxShadow: '0 3px 0 rgba(0, 0, 0, 0.45)',
                                }}
                              >
                                <span className="font-body text-xs font-semibold text-white/85">{k.key}</span>
                                <span className="text-white/25 text-xs">·</span>
                                <span className="font-body text-xs text-white/55">{k.mode}</span>
                              </span>
                            ))}
                          </div>
                          <a
                            href="#shortcuts"
                            className="inline-flex items-center gap-1.5 font-body text-sm transition-opacity hover:opacity-75"
                            style={{ color: 'var(--color-accent)' }}
                          >
                            {isZh ? '到上面的演示里试试' : 'Try it in the demo above'}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* 收尾一句 */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center font-body text-white/40 mt-8"
        >
          {isZh
            ? '三层各自独立、互不锁定——换掉任何一层，Voconly 依然是你的 Voconly。'
            : 'Three independent layers, zero lock-in — swap any one of them, and Voconly is still yours.'}
        </motion.p>
      </div>
    </section>
  );
}
