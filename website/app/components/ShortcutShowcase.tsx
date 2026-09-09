'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Mic, CornerDownRight, Settings2, Keyboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n-context';

type Scene = {
  id: string;
  keyLabel: string;
  name: string;
  tag: string | null;
  desc: string;
  input: string;
  output: string;
};

// 自动轮播的键位序列（Space 未绑定键不参与轮播）
const CAROUSEL_IDS = ['right-ctrl', 'right-alt', 'right-shift', 'f5'];

export default function ShortcutShowcase() {
  const { lang } = useI18n();
  const [activeId, setActiveId] = useState('right-ctrl');
  const [autoPlay, setAutoPlay] = useState(true);

  const isZh = lang === 'zh';

  const scenes: Scene[] = [
    {
      id: 'right-ctrl',
      keyLabel: 'Ctrl',
      name: isZh ? '专业润色' : 'Professional Polish',
      tag: isZh ? '默认' : 'Default',
      desc: isZh
        ? '把口语的松散表达，整理成逻辑严谨的正式文稿。'
        : 'Turns loose speech into a rigorous, formal draft.',
      input: isZh ? '这个方案其实也还行，就是感觉有点复杂了。' : 'This plan is okay I guess, it just feels a bit complicated.',
      output: isZh
        ? '该方案整体可行，但复杂度偏高，建议精简核心流程，降低后续维护成本。'
        : 'The plan is viable overall but overly complex — streamline the core flow to reduce maintenance.',
    },
    {
      id: 'right-alt',
      keyLabel: 'Alt',
      name: isZh ? '轻度润色' : 'Light Polish',
      tag: isZh ? '默认' : 'Default',
      desc: isZh
        ? '只去掉口水话，保留你原本的语气和节奏。'
        : 'Strips the filler words, keeps your voice and rhythm.',
      input: isZh ? '呃，这个 bug 我看了一下，可能是接口超时了。' : 'So I looked into this bug, and, um, it might be the API timing out.',
      output: isZh
        ? '这个 bug 我看了一下，可能是接口超时了。'
        : 'I looked into this bug — it might be the API timing out.',
    },
    {
      id: 'right-shift',
      keyLabel: 'Shift',
      name: isZh ? '翻译' : 'Live Translation',
      tag: isZh ? '自定义' : 'Custom',
      desc: isZh
        ? '说完一句话，译文直接落到光标处，不用切换输入法。'
        : 'Finish a sentence, and the translation lands right at your cursor.',
      input: isZh ? '我们把这个功能放到下周上线。' : "Let's ship this feature next week.",
      output: isZh ? 'We will ship this feature next week.' : '我们下周上线这个功能。',
    },
    {
      id: 'f5',
      keyLabel: 'F5',
      name: isZh ? '会议纪要' : 'Meeting Notes',
      tag: isZh ? '自定义' : 'Custom',
      desc: isZh
        ? '开完会说一段，自动整理成结构化纪要。'
        : 'Talk after the meeting, get structured minutes back.',
      input: isZh
        ? '今天定了三件事：需求通过评审，下周三提测，再招一个前端。'
        : 'Three decisions today: requirements approved, QA next Wednesday, hire one more frontend dev.',
      output: isZh
        ? '· 需求评审：已通过\n· 提测时间：下周三\n· 招聘计划：前端工程师 ×1'
        : '• Requirements: approved\n• QA hand-off: next Wednesday\n• Hiring: 1 frontend engineer',
    },
  ];

  const active = scenes.find((s) => s.id === activeId);
  const isSpace = activeId === 'space';

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      setActiveId((prev) => {
        const idx = CAROUSEL_IDS.indexOf(prev);
        return CAROUSEL_IDS[(idx + 1) % CAROUSEL_IDS.length];
      });
    }, 4500);
    return () => clearInterval(timer);
  }, [autoPlay]);

  const handleSelect = (id: string) => {
    setActiveId(id);
    setAutoPlay(false);
  };

  // 键帽通用样式：3D 厚底 + 按压下沉
  const keycapBase =
    'relative select-none rounded-lg font-body font-semibold transition-all duration-150 flex items-center justify-center cursor-pointer';
  const keycapStyle = (pressed: boolean) => ({
    background: pressed ? 'rgba(0, 212, 170, 0.12)' : 'rgba(255, 255, 255, 0.05)',
    border: '1px solid',
    borderColor: pressed ? 'rgba(0, 212, 170, 0.5)' : 'rgba(255, 255, 255, 0.12)',
    color: pressed ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.75)',
    boxShadow: pressed
      ? '0 1px 0 rgba(0, 0, 0, 0.5), 0 0 18px rgba(0, 212, 170, 0.25)'
      : '0 4px 0 rgba(0, 0, 0, 0.45), 0 6px 10px rgba(0, 0, 0, 0.35)',
    transform: pressed ? 'translateY(3px)' : 'translateY(0)',
  });

  const steps: string[] = isZh
    ? ['按下按键', '对着麦克风说话', '松开，文字落在光标处']
    : ['Press the key', 'Speak into the mic', 'Release — text lands at cursor'];

  const moreKeys = ['Win', 'Caps Lock', 'F1–F14', 'Insert', 'Pause', 'Menu'];

  return (
    <section id="shortcuts" className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
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
              {isZh ? '02 · 键位工作流' : '02 · Key Workflows'}
            </span>
            <span className="w-8 h-px" style={{ background: 'var(--color-accent)' }} />
          </div>
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {isZh ? '每个键，都是一种工作方式' : 'One Key, One Workflow'}
          </h2>
          <p className="font-body text-lg text-white/50 max-w-2xl mx-auto">
            {isZh
              ? '为不同场景绑定不同的键 —— 按下即说，松开即得。键位完全由你定义'
              : 'Bind a different key to each scenario — press to speak, release to done. Every key is yours to define.'}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* 键盘交互区 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-5"
          >
            <div
              className="rounded-xl p-6 sm:p-8 h-full flex flex-col justify-center"
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)',
              }}
            >
              {/* 第一行：Ctrl / Alt / F5 */}
              <div className="grid grid-cols-5 gap-2 mb-2">
                <div className="col-span-2" />
                <button
                  aria-label={isZh ? '右 Ctrl，专业润色' : 'Right Ctrl, Professional Polish'}
                  onClick={() => handleSelect('right-ctrl')}
                  className={`${keycapBase} h-14 sm:h-16 text-sm sm:text-base`}
                  style={keycapStyle(activeId === 'right-ctrl')}
                >
                  <span className="absolute top-1 left-1.5 text-[10px] text-white/40 font-normal">{isZh ? '右' : 'R'}</span>
                  Ctrl
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={
                      activeId === 'right-ctrl'
                        ? { background: 'var(--color-accent)', boxShadow: '0 0 6px rgba(0,212,170,0.6)' }
                        : { background: 'rgba(255,255,255,0.25)' }
                    }
                  />
                </button>
                <button
                  aria-label={isZh ? '右 Alt，轻度润色' : 'Right Alt, Light Polish'}
                  onClick={() => handleSelect('right-alt')}
                  className={`${keycapBase} h-14 sm:h-16 text-sm sm:text-base`}
                  style={keycapStyle(activeId === 'right-alt')}
                >
                  <span className="absolute top-1 left-1.5 text-[10px] text-white/40 font-normal">{isZh ? '右' : 'R'}</span>
                  Alt
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={
                      activeId === 'right-alt'
                        ? { background: 'var(--color-accent)', boxShadow: '0 0 6px rgba(0,212,170,0.6)' }
                        : { background: 'rgba(255,255,255,0.25)' }
                    }
                  />
                </button>
                <button
                  aria-label={isZh ? 'F5，会议纪要' : 'F5, Meeting Notes'}
                  onClick={() => handleSelect('f5')}
                  className={`${keycapBase} h-14 sm:h-16 text-sm sm:text-base`}
                  style={keycapStyle(activeId === 'f5')}
                >
                  F5
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={
                      activeId === 'f5'
                        ? { background: 'var(--color-accent)', boxShadow: '0 0 6px rgba(0,212,170,0.6)' }
                        : { background: 'rgba(255,255,255,0.25)' }
                    }
                  />
                </button>
              </div>

              {/* 第二行：Shift / Space */}
              <div className="grid grid-cols-5 gap-2">
                <button
                  aria-label={isZh ? '右 Shift，翻译' : 'Right Shift, Live Translation'}
                  onClick={() => handleSelect('right-shift')}
                  className={`${keycapBase} col-span-2 h-14 sm:h-16 text-sm sm:text-base`}
                  style={keycapStyle(activeId === 'right-shift')}
                >
                  <span className="absolute top-1 left-1.5 text-[10px] text-white/40 font-normal">{isZh ? '右' : 'R'}</span>
                  Shift
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={
                      activeId === 'right-shift'
                        ? { background: 'var(--color-accent)', boxShadow: '0 0 6px rgba(0,212,170,0.6)' }
                        : { background: 'rgba(255,255,255,0.25)' }
                    }
                  />
                </button>
                <button
                  aria-label={isZh ? '空格键，未绑定' : 'Space, unbound'}
                  onClick={() => handleSelect('space')}
                  className={`${keycapBase} col-span-3 h-14 sm:h-16 text-xs sm:text-sm`}
                  style={{
                    ...keycapStyle(activeId === 'space'),
                    color: activeId === 'space' ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.35)',
                    borderColor: activeId === 'space' ? 'rgba(0, 212, 170, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                    background: activeId === 'space' ? 'rgba(0, 212, 170, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  {activeId === 'space' ? 'Space' : isZh ? '空格 · 还空着' : 'Space · unbound'}
                </button>
              </div>

              {/* 图例说明 */}
              <div className="flex items-center gap-4 mt-6">
                <span className="inline-flex items-center gap-2 font-body text-xs text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
                  {isZh ? '已绑定' : 'Bound'}
                </span>
                <span className="inline-flex items-center gap-2 font-body text-xs text-white/40">
                  <Keyboard className="w-3.5 h-3.5" />
                  {isZh ? '点击键帽试试' : 'Click a keycap'}
                </span>
              </div>
            </div>
          </motion.div>

          {/* 场景面板 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-7"
          >
            <div
              className="rounded-xl p-6 sm:p-8 h-full flex flex-col justify-center min-h-[340px]"
              style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', boxShadow: 'inset 0 2px 12px rgba(0, 0, 0, 0.4)' }}
            >
              <AnimatePresence mode="wait">
                {isSpace ? (
                  // 未绑定键：邀请用户自定义
                  <motion.div
                    key="space"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 border border-dashed border-white/20">
                        <Keyboard className="w-5 h-5 text-white/50" />
                      </div>
                      <h3 className="font-body text-xl font-semibold text-white">
                        {isZh ? '这个键，还空着' : 'This key is still free'}
                      </h3>
                    </div>
                    <p className="font-body text-white/50 leading-relaxed mb-5">
                      {isZh
                        ? '你的键盘还有 100 多个键位。在设置里把任意键绑成听写、翻译、邮件速记……让每一个键都为你所用。'
                        : 'Your keyboard has 100+ keys. Bind any of them to dictation, translation, email drafts… and make every key work for you.'}
                    </p>
                    <div className="flex items-start gap-2">
                      <Settings2 className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0 mt-0.5" />
                      <span className="font-body text-sm text-white/40">
                        {isZh ? '在「快捷键设置」中一键绑定' : 'One click to bind in Shortcut Settings'}
                      </span>
                    </div>
                  </motion.div>
                ) : active ? (
                  <motion.div
                    key={active.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25 }}
                  >
                    {/* 场景标题行 */}
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span
                        className="inline-flex items-center h-7 px-2.5 rounded-md font-body text-xs font-semibold"
                        style={{
                          background: 'rgba(0, 212, 170, 0.1)',
                          border: '1px solid rgba(0, 212, 170, 0.4)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {isZh ? '右' : 'Right '} {active.keyLabel}
                      </span>
                      <h3 className="font-body text-xl font-semibold text-white">{active.name}</h3>
                      {active.tag && (
                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 text-[10px] font-body">
                          {active.tag}
                        </span>
                      )}
                    </div>
                    <p className="font-body text-white/50 leading-relaxed mb-5">{active.desc}</p>

                    {/* 输入 / 输出示例 */}
                    <div className="space-y-3">
                      <div className="flex items-start gap-2.5">
                        <Mic className="w-4 h-4 text-white/30 flex-shrink-0 mt-1" />
                        <p className="font-body text-sm text-white/40 leading-relaxed italic">
                          {isZh ? '你说：' : 'You say: '}
                          {active.input}
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <CornerDownRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--color-accent)' }} />
                        <p
                          className="font-body text-sm text-white/85 leading-relaxed whitespace-pre-line pl-3"
                          style={{ borderLeft: '2px solid var(--color-accent)' }}
                        >
                          {active.output}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* 三步流程 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-8 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {steps.map((step, i) => (
                  <span key={i} className="inline-flex items-center gap-2 font-body text-xs text-white/40">
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: 'rgba(0, 212, 170, 0.12)', color: 'var(--color-accent)' }}
                    >
                      {i + 1}
                    </span>
                    {step}
                    {i < steps.length - 1 && <span className="text-white/20 ml-1 hidden sm:inline">→</span>}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* 底部提示：更多可绑定键位 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-8"
        >
          <span className="font-body text-sm text-white/40">
            {isZh ? '开箱即用：右 Alt 轻度润色、右 Ctrl 专业润色。更多可绑定的键位：' : 'Works out of the box: Right Alt for light polish, Right Ctrl for professional polish. More bindable keys: '}
          </span>
          {moreKeys.map((k) => (
            <span
              key={k}
              className="px-2.5 py-1 rounded-md font-body text-xs text-white/60"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 2px 0 rgba(0, 0, 0, 0.35)',
              }}
            >
              {k}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
