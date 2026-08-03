'use client';

import { motion } from 'framer-motion';
import { Keyboard, Zap, Sparkles, Clock, Lock, Globe, ArrowRight } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

export default function Features() {
  const { t } = useI18n();

  const features = [
    {
      icon: Keyboard,
      title: t('features.scenarios.title'),
      description: t('features.scenarios.description'),
    },
    {
      icon: Zap,
      title: t('features.shortcut.title'),
      description: t('features.shortcut.description'),
    },
    {
      icon: Sparkles,
      title: t('features.smart.title'),
      description: t('features.smart.description'),
    },
    {
      icon: Clock,
      title: t('features.realtime.title'),
      description: t('features.realtime.description'),
    },
    {
      icon: Lock,
      title: t('features.privacy.title'),
      description: t('features.privacy.description'),
    },
    {
      icon: Globe,
      title: t('features.multiLang.title'),
      description: t('features.multiLang.description'),
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
          className="text-center mb-20"
        >
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {t('features.title')}
          </h2>
          <p className="font-body text-lg text-white/50 max-w-xl mx-auto">
            {t('features.subtitle')}
          </p>
        </motion.div>

        {/* 功能网格 - 统一色调 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative p-6 rounded-xl border border-white/5 hover:border-[var(--color-accent)]/30 transition-all duration-300"
              style={{ background: 'rgba(255, 255, 255, 0.02)' }}
            >
              {/* 图标 */}
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-[var(--color-accent)]/10 group-hover:bg-[var(--color-accent)]/20 transition-colors">
                <feature.icon className="w-5 h-5 text-[var(--color-accent)]" />
              </div>

              {/* 标题 */}
              <h3 className="font-body text-lg font-semibold text-white mb-2 group-hover:text-[var(--color-accent)] transition-colors">
                {feature.title}
              </h3>

              {/* 描述 */}
              <p className="font-body text-sm text-white/50 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* 底部 CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-16 text-center"
        >
          <a
            href="#download"
            className="inline-flex items-center gap-2 text-[var(--color-accent)] hover:text-white transition-colors group font-body"
          >
            <span>免费下载，每天无限使用</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
