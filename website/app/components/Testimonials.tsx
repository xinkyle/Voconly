'use client';

import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n-context';

export default function Testimonials() {
  const { t } = useI18n();

  const stats = [
    { value: '1K+', label: t('testimonials.stats.users.label') },
    { value: '99+', label: t('testimonials.stats.languages.label') },
    { value: '100%', label: t('testimonials.stats.accuracy.label') },
    { value: '3', label: t('testimonials.stats.platforms.label') },
  ];

  return (
    <section className="relative py-24 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 背景光晕 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-15"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0, 212, 170, 0.2), transparent 70%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-12">
        {/* 标题区域 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl sm:text-4xl text-white mb-3">
            {t('testimonials.title')}
          </h2>
          <p className="font-body text-base text-white/50 max-w-xl mx-auto">
            {t('testimonials.subtitle')}
          </p>
        </motion.div>

        {/* 统计数据 - 简洁卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center p-6 rounded-xl border border-white/5"
                style={{ background: 'rgba(255, 255, 255, 0.02)' }}
              >
                <div className="font-display text-3xl sm:text-4xl text-[var(--color-accent)] mb-1">
                  {stat.value}
                </div>
                <div className="font-body text-sm text-white/50">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
