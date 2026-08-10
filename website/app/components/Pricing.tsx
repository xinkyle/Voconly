'use client';

import { motion } from 'framer-motion';
import { Check, Heart, ArrowRight, Github } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

export default function Pricing() {
  const { t, get } = useI18n();

  const features = get<string[]>('pricing.opensource.features');

  return (
    <section id="pricing" className="relative py-24 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 背景光晕 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] opacity-15"
          style={{
            background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0, 212, 170, 0.3), transparent 70%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-12">
        {/* 标题区域 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {t('pricing.title')}
          </h2>
          <p className="font-body text-lg text-white/50 max-w-xl mx-auto">
            {t('pricing.subtitle')}
          </p>
        </motion.div>

        {/* 单卡片 - 免费开源 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          {/* 开源标签 */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--color-accent)] text-caption text-[var(--color-bg-primary)] font-semibold">
              <Heart className="w-3 h-3" />
              {t('pricing.opensource.badge')}
            </div>
          </div>

          {/* 卡片 */}
          <div
            className="relative rounded-xl p-8 border border-[var(--color-accent)]/50"
            style={{ background: 'rgba(0, 212, 170, 0.05)' }}
          >
            {/* 名称和价格 */}
            <div className="text-center mb-6">
              <h3 className="font-body text-xl font-semibold text-white mb-3">
                {t('pricing.opensource.name')}
              </h3>
              <div className="mb-2">
                <span className="font-display text-5xl text-white">{t('pricing.opensource.price')}</span>
              </div>
              <p className="font-body text-sm text-white/50">
                {t('pricing.opensource.description')}
              </p>
            </div>

            {/* 功能列表 */}
            <ul className="grid sm:grid-cols-2 gap-3 mb-8 max-w-xl mx-auto">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 font-body text-sm text-white/70">
                  <Check className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            {/* CTA 按钮 */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://github.com/xinkyle/Voconly/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-3 rounded-lg font-body font-medium transition-all flex items-center justify-center gap-2 group bg-[var(--color-accent)] text-[var(--color-bg-primary)] hover:shadow-lg hover:shadow-[var(--color-accent)]/20"
              >
                {t('pricing.opensource.cta')}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="https://github.com/xinkyle/Voconly"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-3 rounded-lg font-body font-medium transition-all flex items-center justify-center gap-2 bg-white/5 text-white hover:bg-white/10 border border-white/10"
              >
                <Github className="w-4 h-4" />
                {t('pricing.opensource.github')}
              </a>
            </div>
          </div>
        </motion.div>

        {/* 信任徽章 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-6 text-white/40 text-sm font-body"
        >
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[var(--color-accent)]" />
            {t('pricing.trust.whisper')}
          </span>
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[var(--color-accent)]" />
            {t('pricing.trust.platforms')}
          </span>
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[var(--color-accent)]" />
            {t('pricing.trust.opensource')}
          </span>
        </motion.div>
      </div>
    </section>
  );
}
