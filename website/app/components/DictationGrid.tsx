'use client';

import { motion } from 'framer-motion';
import { Zap, Eraser, Globe, ShieldCheck, TextCursorInput } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

export default function DictationGrid() {
  const { lang } = useI18n();
  const isZh = lang === 'zh';

  const cards = [
    {
      icon: Zap,
      title: isZh ? '说完就出字' : 'Words as you speak',
      desc: isZh
        ? '边说边上屏，说完即成稿。识别就在本地，没有进度条，也不用去云端排队。'
        : 'Text appears while you speak, ready the moment you stop. Recognition runs locally — no spinners, no cloud queue.',
    },
    {
      icon: Eraser,
      title: isZh ? '口头禅，上屏前消失' : 'Filler words, gone',
      desc: isZh
        ? '嗯、呃、那个——在文字抵达光标前被自动抹掉，标点一并处理好。想保住语气？轻度润色只去口水话。'
        : '"Um", "uh", "I mean" — stripped before text reaches your cursor, punctuation handled. Want to keep your voice? Light polish only removes the fillers.',
    },
    {
      icon: Globe,
      title: isZh ? '99+ 语言，混着说也行' : '99+ languages, mix freely',
      desc: isZh
        ? '自动识别 99+ 种语言和方言。中英夹杂不用切输入法，说到哪跟到哪。'
        : 'Auto-detects 99+ languages and dialects. Switch between Chinese and English mid-sentence — no input-method juggling.',
    },
    {
      icon: ShieldCheck,
      title: isZh ? '音频不出设备' : 'Audio never leaves',
      desc: isZh
        ? '会议、灵感、商业机密——全部本地处理，数据从不上传。代码开源，欢迎审查。'
        : 'Meetings, ideas, trade secrets — processed locally, never uploaded. Open source, auditable.',
    },
  ];

  const apps = isZh
    ? ['Word', '微信', 'VS Code', 'Notion', '浏览器', '邮箱', 'Slack', 'Figma']
    : ['Word', 'WeChat', 'VS Code', 'Notion', 'Browser', 'Mail', 'Slack', 'Figma'];

  return (
    <section id="dictation" className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
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
              {isZh ? '01 · 语音听写' : '01 · Dictation'}
            </span>
            <span className="w-8 h-px" style={{ background: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4 leading-tight">
            {isZh ? (
              <>
                语音听写，无限量且免费
                <br />
                <span className="text-2xl sm:text-3xl" style={{ color: 'var(--color-accent)' }}>本就该如此</span>
              </>
            ) : (
              <>
                Voice dictation, unlimited and free.
                <br />
                <span className="text-2xl sm:text-3xl" style={{ color: 'var(--color-accent)' }}>As it should be.</span>
              </>
            )}
          </h2>
          <p className="font-body text-lg text-white/50 max-w-2xl mx-auto">
            {isZh
              ? '没有订阅，没有功能阉割，也没有「本日剩余 3 次」'
              : 'No subscription, no crippled tier, no "3 left today". And on top of free, this is what daily use feels like.'}
          </p>
        </motion.div>

        {/* Bento 网格 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 主格：没有额度这回事 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="md:col-span-2 rounded-xl p-6 sm:p-8 relative overflow-hidden"
            style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8">
              <div className="flex-1">
                <h3 className="font-body text-xl font-semibold text-white mb-3">
                  {isZh ? '没有额度这回事' : 'There is no quota'}
                </h3>
                <p className="font-body text-white/50 leading-relaxed">
                  {isZh
                    ? '识别跑在你自己的电脑上，没有服务器成本，也就没有账单。不计条数、不限时长、无需注册——从装好的那一刻起，它就是你的。'
                    : 'Recognition runs on your own machine. No servers, no bills. No counts, no time limits, no sign-up — from the moment it installs, it is yours.'}
                </p>
              </div>
              {/* 模拟配额界面 */}
              <div
                className="sm:w-56 flex-shrink-0 rounded-lg p-4"
                style={{ background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-body text-xs text-white/40">{isZh ? '今日已用' : 'Used today'}</span>
                  <span className="font-body text-xs text-white/60">47 / ∞</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '12%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.3 }}
                    className="h-full rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body text-xs text-white/40">{isZh ? '剩余' : 'Remaining'}</span>
                  <span className="font-display text-2xl leading-none" style={{ color: 'var(--color-accent)' }}>
                    ∞
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 小格 */}
          {cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.08 * (i + 1) }}
                className="rounded-xl p-6"
                style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: 'rgba(0, 212, 170, 0.1)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
                </div>
                <h3 className="font-body text-lg font-semibold text-white mb-2">{card.title}</h3>
                <p className="font-body text-sm text-white/50 leading-relaxed">{card.desc}</p>
              </motion.div>
            );
          })}

          {/* 宽格：光标在哪，文字落到哪 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="md:col-span-3 rounded-xl p-6 sm:p-8"
            style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(0, 212, 170, 0.1)' }}
              >
                <TextCursorInput className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
              </div>
              <div className="sm:w-56 flex-shrink-0">
                <h3 className="font-body text-lg font-semibold text-white mb-1">
                  {isZh ? '光标在哪，文字落到哪' : 'Lands where your cursor is'}
                </h3>
                <p className="font-body text-sm text-white/50 leading-relaxed">
                  {isZh ? '任何能打字的地方都能用，不打断你手头的事。' : 'Works anywhere you can type, without breaking your flow.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 flex-1">
                {apps.map((app) => (
                  <span
                    key={app}
                    className="px-3 py-1.5 rounded-md font-body text-xs text-white/60"
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    {app}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
