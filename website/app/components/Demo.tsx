'use client';

import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Play, Pause, Mic, Sparkles, Clock } from 'lucide-react';

// 模拟波形动画组件
function Waveform({ isPlaying }: { isPlaying: boolean }) {
  const bars = 35;
  // 使用 useMemo 生成固定的随机值，避免 hydration 不匹配
  const barConfigs = useMemo(() => {
    return Array.from({ length: bars }).map((_, i) => ({
      height: 28 + (i % 5) * 10, // 固定的高度变化
      duration: 0.6 + (i % 3) * 0.1, // 固定的持续时间
    }));
  }, []);

  return (
    <div className="flex items-center justify-center gap-[2px] h-20 relative">
      {/* 背景光晕 */}
      <div
        className="absolute inset-0 rounded-lg opacity-30"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(87, 193, 255, 0.3), transparent)',
        }}
      />

      {barConfigs.map((config, i) => (
        <motion.div
          key={i}
          className="w-1.5 bg-accent-blue rounded-full relative"
          animate={{
            height: isPlaying ? [8, config.height, 8] : 6,
            opacity: isPlaying ? [0.5, 1, 0.5] : 0.4,
          }}
          transition={{
            duration: config.duration,
            repeat: isPlaying ? Infinity : 0,
            repeatType: 'reverse',
            delay: i * 0.02,
            ease: 'easeInOut',
          }}
          style={{
            boxShadow: isPlaying ? '0 0 8px rgba(87, 193, 255, 0.5)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

// 转录文本展示组件
function TranscriptDemo() {
  const [showResult, setShowResult] = useState(false);

  const transcript = [
    { time: '00:00', text: '大家好，今天我们来讨论一下项目进度。', speaker: '主讲' },
    { time: '00:05', text: '首先，前端部分已经基本完成了。', speaker: '主讲' },
    { time: '00:08', text: '后端 API 也通过了测试。', speaker: '主讲' },
    { time: '00:12', text: '预计下周可以正式发布。', speaker: '主讲' },
  ];

  return (
    <div className="relative bg-surface border border-hairline rounded-xl overflow-hidden">
      {/* 顶部光照 */}
      <div
        className="absolute inset-x-0 top-0 h-24 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.04), transparent)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
        }}
      />

      {/* 顶部工具栏 */}
      <div className="relative px-4 py-3 border-b border-hairline flex items-center justify-between bg-surface-elevated/50">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2.5 h-2.5 rounded-full bg-accent-green"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-caption-md text-accent-green font-medium">实时转录中</span>
          <span className="text-caption-sm text-mute">时长 00:32</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowResult(!showResult)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption-md transition-all ${
              showResult
                ? 'bg-accent-green-soft text-accent-green'
                : 'bg-surface-elevated text-body hover:text-ink'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {showResult ? '已润色' : '润色'}
          </button>
        </div>
      </div>

      {/* 波形区域 */}
      <div className="relative px-6 py-8 border-b border-hairline bg-surface-card/30">
        <Waveform isPlaying={true} />
      </div>

      {/* 转录文本 */}
      <div className="relative p-4 space-y-4 max-h-64 overflow-y-auto">
        {transcript.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.15, duration: 0.3 }}
            className={`flex gap-4 p-3 rounded-lg ${
              showResult && index === 1 ? 'bg-accent-green-soft/30' : ''
            }`}
          >
            <span className="text-caption-sm text-mute font-mono w-12 shrink-0">{item.time}</span>
            <div className="flex-1">
              <span
                className={`text-body-md leading-relaxed ${
                  showResult && index === 1 ? 'text-accent-green' : 'text-body'
                }`}
              >
                {showResult && index === 1
                  ? '首先，前端部分的开发工作已经基本完成，所有核心功能均已实现并通过验收测试。'
                  : item.text}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 底部状态栏 */}
      <div className="px-4 py-2 border-t border-hairline flex items-center justify-between text-caption-sm text-mute bg-surface-elevated/30">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-accent-blue" />
            中文 (简体)
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            智能场景: 默认
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="keyboard-key">Esc</span>
          <span>停止</span>
        </div>
      </div>
    </div>
  );
}

// 应用界面截图占位组件
function AppScreenshot() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="relative"
    >
      {/* 光照效果 */}
      <div
        className="absolute -inset-4 rounded-2xl opacity-40"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(89, 212, 153, 0.15), transparent)',
        }}
      />

      {/* 截图容器 */}
      <div
        className="relative bg-surface border border-hairline rounded-xl overflow-hidden"
        style={{
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 20px 40px -20px rgba(0,0,0,0.5)',
        }}
      >
        {/* 顶部标题栏 */}
        <div className="px-4 py-3 border-b border-hairline flex items-center justify-between bg-surface-elevated/50">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
          </div>
          <span className="text-caption-sm text-mute">Voconly - 主界面</span>
          <div className="w-16" />
        </div>

        {/* 占位图片 - 用户可替换为真实截图 */}
        <div className="relative aspect-[16/10] bg-surface-card flex items-center justify-center">
          {/* 占位提示 */}
          <div className="text-center">
            <div className="text-body-sm text-mute mb-2">
              产品截图占位区域
            </div>
            <div className="text-caption-sm text-ash">
              请替换为真实的 Voconly 应用界面截图
            </div>
          </div>

          {/* 装饰网格 */}
          <div className="absolute inset-0 opacity-5">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        </div>
      </div>

      {/* 底部反射光 */}
      <div
        className="absolute -bottom-6 inset-x-8 h-12 blur-2xl opacity-20"
        style={{
          background: 'linear-gradient(to top, rgba(89, 212, 153, 0.3), transparent)',
        }}
      />
    </motion.div>
  );
}

export default function Demo() {
  return (
    <section id="demo" className="py-32 px-6 lg:px-12 relative">
      {/* 背景效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-0 right-0 h-64"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,87,87,0.05), transparent)',
          }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(89, 212, 153, 0.06), transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-display-lg font-medium text-ink mb-4">
            实时转录演示
          </h2>
          <p className="text-body-lg text-body max-w-2xl mx-auto">
            体验 Voconly 的实时语音识别能力，边说边转，无需等待
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* 左侧：演示卡片 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <TranscriptDemo />
          </motion.div>

          {/* 右侧：说明文字 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="space-y-8">
              {/* 特性列表 */}
              {[
                {
                  title: '实时转录',
                  desc: '采用先进的 Whisper 语音识别技术，边说边转，响应延迟小于 1 秒',
                  icon: Mic,
                  color: 'blue',
                },
                {
                  title: '智能润色',
                  desc: 'AI 自动优化表达，修正错别字，调整语气，让转录结果更加流畅自然',
                  icon: Sparkles,
                  color: 'green',
                },
                {
                  title: '多场景支持',
                  desc: '会议、采访、笔记、翻译等多种场景一键切换，满足不同需求',
                  icon: Clock,
                  color: 'yellow',
                },
              ].map((item, index) => {
                const Icon = item.icon;
                const colorConfig = {
                  blue: {
                    bg: 'bg-accent-blue-soft',
                    icon: 'text-accent-blue',
                    glow: 'rgba(87, 193, 255, 0.2)',
                  },
                  green: {
                    bg: 'bg-accent-green-soft',
                    icon: 'text-accent-green',
                    glow: 'rgba(89, 212, 153, 0.2)',
                  },
                  yellow: {
                    bg: 'bg-accent-yellow-soft',
                    icon: 'text-accent-yellow',
                    glow: 'rgba(255, 197, 51, 0.2)',
                  },
                };
                const config = colorConfig[item.color as keyof typeof colorConfig];

                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="relative group"
                  >
                    {/* 光晕背景 */}
                    <div
                      className="absolute left-0 top-0 w-12 h-12 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: `radial-gradient(circle at 50% 50%, ${config.glow}, transparent 70%)`,
                      }}
                    />

                    <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-surface/50 transition-colors">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${config.bg}`}>
                        <Icon className={`w-6 h-6 ${config.icon}`} />
                      </div>
                      <div>
                        <h3 className="text-heading-md font-medium text-ink mb-2">
                          {item.title}
                        </h3>
                        <p className="text-body-sm text-body leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* 底部提示 */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 pt-6 border-t border-hairline"
            >
              <p className="text-body-sm text-mute">
                所有处理都在本地完成，语音数据不上传云端，
                <span className="text-accent-green">保护您的隐私安全</span>
              </p>
            </motion.div>
          </motion.div>
        </div>

        {/* 应用截图区域 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-20"
        >
          <AppScreenshot />
        </motion.div>
      </div>
    </section>
  );
}