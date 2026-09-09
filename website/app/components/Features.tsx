'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PenLine, Briefcase, Languages, FileText, ArrowRight, Zap, Clock, Globe, ChevronRight } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

export default function Features() {
  const { t, lang } = useI18n();

  // 场景模式展示（使用完整的转换示例）
  const scenarios = [
    {
      icon: PenLine,
      title: lang === 'zh' ? '轻度润色' : 'Light Polish',
      input: lang === 'zh'
        ? '"呃，我觉得这个方案其实还可以，就是有几个地方吧，可能还是得再改一下，尤其是时间安排，感觉有点长。"'
        : '"I mean, I think this plan is actually pretty good, you know, it\'s just that the timeline is kind of a little too long, and maybe we could, like, make some adjustments and try to shorten it a bit."',
      output: lang === 'zh'
        ? '"我觉得这个方案其实还可以，就是有几个地方可能还是得再改一下，尤其是时间安排，感觉有点长。"'
        : '"I think this plan is actually pretty good, it\'s just that the timeline is a little too long, and maybe we could make some adjustments and try to shorten it a bit."',
    },
    {
      icon: Briefcase,
      title: lang === 'zh' ? '专业润色' : 'Professional Polish',
      input: lang === 'zh'
        ? '"呃，我觉得这个方案其实还可以，就是有几个地方吧，可能还是得再改一下，尤其是时间安排，感觉有点长。"'
        : '"I mean, I think this plan is actually pretty good, you know, it\'s just that the timeline is kind of a little too long, and maybe we could, like, make some adjustments and try to shorten it a bit."',
      output: lang === 'zh'
        ? '"整体来看，这个方案是可行的，但部分环节仍需进一步优化，尤其是当前的时间安排偏长。"'
        : '"I think this plan is solid overall, but the current timeline is a bit too long. We could make some adjustments to shorten it."',
    },
    {
      icon: Languages,
      title: lang === 'zh' ? '翻译' : 'Translate',
      input: lang === 'zh'
        ? '"嗯，我觉得这个方案整体还是不错的，就是时间周期有点长，我们是不是可以再优化一下？"'
        : '"I think the plan is pretty good overall, but the timeline is a bit too long. Maybe we could optimize it a little further."',
      output: lang === 'zh'
        ? '"I think the plan is pretty good overall, but the timeline is a bit too long. Maybe we could optimize it a little further."'
        : '"嗯，我觉得这个方案整体其实还不错，就是这个时间周期吧，感觉还是有点长，我们是不是可以再优化一下？"',
    },
    {
      icon: FileText,
      title: lang === 'zh' ? '会议秘书' : 'Meeting Secretary',
      input: lang === 'zh'
        ? '"今天讨论 Q4 营销策略。社交媒体需要加大投入，预算可能要增加 20%。小李，你那边的数据分析本周能给到吗？"'
        : '"Discussing Q4 marketing strategy. Need to increase social media investment, budget may increase by 20%. Li, can you get the data analysis done this week?"',
      output: lang === 'zh'
        ? '【会议纪要】\n\n议题：Q4营销策略讨论\n\n要点：\n1. 加大社交媒体投入\n2. 预算增加约20%\n3. 李：本周提供数据分析\n\n下一步：确认预算，制定方案'
        : '【Meeting Minutes】\n\nTopic: Q4 Marketing Strategy\n\nKey Points:\n1. Increase social media investment\n2. Budget increase by ~20%\n3. Li: Provide data analysis this week\n\nNext Steps: Confirm budget, finalize plan',
    },
  ];

  return (
    <section id="features" className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 背景：单一光晕 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0, 212, 170, 0.2), transparent 70%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12">
        {/* 标题区域 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {lang === 'zh' ? '同一条语音，不同的意图' : 'One Voice. Different Intentions.'}
          </h2>
          <p className="font-body text-lg text-white/50 max-w-xl mx-auto">
            {lang === 'zh'
              ? '同一句话，可以有完全不同的用途——为每种工作流指定一个快捷键，一键切换模式。'
              : 'The same voice can mean different things. Assign each workflow its own hotkey.'}
          </p>
        </motion.div>

        {/* 场景卡片 */}
        <div className="grid md:grid-cols-2 gap-4 mb-16">
          {scenarios.map((scenario, index) => (
            <ScenarioCard key={scenario.title} scenario={scenario} index={index} isZh={lang === 'zh'} />
          ))}
        </div>

{/* 底部 CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <a
            href="https://github.com/xinkyle/Voconly/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:text-white transition-colors group font-body"
          >
            <span>{t('features.downloadCta')}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

// 交互式功能卡片组件
function InteractiveFeatureCards({ lang }: { lang: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const features = [
    {
      icon: Zap,
      title: lang === 'zh' ? '边说边见文字' : 'Real-time Transcription',
      description: lang === 'zh'
        ? '文字逐句出现，说完的那一刻就绪。没有转圈等待。'
        : "Text appears while you speak — ready the moment you stop.",
      scenario: lang === 'zh'
        ? {
            app: 'Slack',
            context: '频道消息',
            example: '"项目已经完成测试，准备提交审核"',
            note: lang === 'zh' ? '即时发送，无需等待' : 'Instant send, no waiting',
          }
        : {
            app: 'Slack',
            context: 'Channel Message',
            example: '"Project testing complete, ready for review"',
            note: 'Instant send, no waiting',
          },
    },
    {
      icon: Clock,
      title: lang === 'zh' ? '长时稳定转录' : 'Long-form Stability',
      description: lang === 'zh'
        ? '无论说几分钟还是几小时，避免准确度衰减。'
        : 'Maintains accuracy over long sessions.',
      scenario: lang === 'zh'
        ? {
            app: '会议记录',
            context: '45分钟会议',
            example: '"会议讨论了三个主要议题：产品路线图、市场策略、技术架构优化..."',
            note: lang === 'zh' ? '全程稳定，无准确度衰减' : 'Consistent accuracy throughout',
          }
        : {
            app: 'Meeting Notes',
            context: '45 min meeting',
            example: '"Meeting covered three main topics: product roadmap, market strategy, technical architecture optimization..."',
            note: 'Consistent accuracy throughout',
          },
    },
    {
      icon: Globe,
      title: lang === 'zh' ? '在哪都能用' : 'Works Everywhere',
      description: lang === 'zh'
        ? '浏览器、Word、Notion、VS Code、微信——只要能打字就能用。'
        : 'Works in any app where you can type.',
      scenario: lang === 'zh'
        ? {
            app: 'VS Code',
            context: '代码注释',
            example: '"// 这个函数用于处理用户认证逻辑"',
            note: lang === 'zh' ? '无缝集成到开发环境' : 'Seamlessly integrated into dev workflow',
          }
        : {
            app: 'VS Code',
            context: 'Code Comment',
            example: '"// This function handles user authentication logic"',
            note: 'Seamlessly integrated into dev workflow',
          },
    },
  ];

  return (
    <div className="space-y-4">
      {/* 标签页按钮 */}
      <div className="flex justify-center gap-2 mb-4">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-body text-sm transition-all ${
                activeIndex === index
                  ? 'bg-[var(--color-accent)] text-[var(--color-bg-primary)]'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{feature.title}</span>
            </button>
          );
        })}
      </div>

      {/* 功能卡片内容 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="p-6 rounded-xl border border-white/10 bg-white/5"
        >
          <div className="grid md:grid-cols-2 gap-6">
            {/* 左侧：功能描述 */}
            <div>
              <h4 className="font-display text-xl text-white mb-3 flex items-center gap-2">
                <IconComponent icon={features[activeIndex].icon} />
                {features[activeIndex].title}
              </h4>
              <p className="font-body text-white/60 leading-relaxed mb-4">
                {features[activeIndex].description}
              </p>
            </div>

            {/* 右侧：场景演示 */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs px-2 py-1 rounded bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-body">
                  {features[activeIndex].scenario.app}
                </span>
                <span className="text-xs text-white/40 font-body">{features[activeIndex].scenario.context}</span>
              </div>
              <div className="font-body text-sm text-white/80 leading-relaxed mb-3 p-3 rounded bg-white/5 border border-white/5">
                {features[activeIndex].scenario.example}
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--color-accent)] font-body">
                <ChevronRight className="w-3 h-3" />
                {features[activeIndex].scenario.note}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// 图标组件辅助函数
function IconComponent({ icon: Icon }: { icon: React.ElementType }) {
  return <Icon className="w-5 h-5 text-[var(--color-accent)]" />;
}

// 单张场景卡片：hover 光斑状态属于每张卡片，独立成组件才能持有自己的 Hook
function ScenarioCard({
  scenario,
  index,
  isZh,
}: {
  scenario: { icon: React.ElementType; title: string; input: string; output: string };
  index: number;
  isZh: boolean;
}) {
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const Icon = scenario.icon;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePosition({ x, y });
  };

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    setMousePosition({ x: 50, y: 50 });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.05 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group p-6 rounded-xl border border-white/5 hover:border-[var(--color-accent)]/50 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,212,170,0.15)]"
      style={{
        background: isHovered
          ? `radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.01) 100%)`
          : 'linear-gradient(to bottom, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        transition: 'background 0.3s ease-out',
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-accent)]/10 group-hover:bg-[var(--color-accent)]/20 transition-colors flex-shrink-0">
          <Icon className="w-4 h-4 text-[var(--color-accent)]" />
        </div>
        <h4 className="font-body font-semibold text-white text-base">{scenario.title}</h4>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-white/40 mb-1">{isZh ? '你说的是……' : 'You say...'}</div>
          <p className="font-body text-sm text-white/60 leading-relaxed">{scenario.input}</p>
        </div>

        <div className="flex items-center gap-2 text-white/20">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs">↓</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <div>
          <div className="text-xs text-white/40 mb-1">{isZh ? '你得到的是……' : 'You get...'}</div>
          <p className="font-body text-sm text-white/90 leading-relaxed font-medium">{scenario.output}</p>
        </div>
      </div>
    </motion.div>
  );
}