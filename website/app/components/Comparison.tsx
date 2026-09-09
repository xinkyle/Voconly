'use client';

import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

export default function Comparison() {
  const { get, lang } = useI18n();

  const items = get<{ label: string; voconly: string; traditional: string }[]>('comparison.items');

  return (
    <section className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 背景 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0, 212, 170, 0.15), transparent 70%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-12">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            <span className="text-white">
              {lang === 'zh' ? '别人给你转录稿，' : 'Others give you transcripts.'}
            </span>
            <br />
            <span className="text-white/50">
              {lang === 'zh' ? 'Voconly 给你成品文字' : 'Voconly gives you finished text.'}
            </span>
          </h2>
          <p className="font-body text-lg text-white/50 max-w-xl mx-auto">
            {lang === 'zh' ? '逐项对比，一眼看清差别' : 'A side-by-side look at the difference'}
          </p>
        </motion.div>

        {/* 对比表格 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="rounded-2xl border border-white/[0.08] overflow-hidden"
          style={{ background: 'rgba(255, 255, 255, 0.02)' }}
        >
          {/* 表头 */}
          <div className="grid grid-cols-[1fr_1.3fr_1.3fr] border-b border-white/10 bg-white/[0.03]">
            <div className="p-4 sm:p-5" />
            <div className="p-4 sm:p-5 flex items-center gap-2 border-l border-white/5">
              <div className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
              <span className="text-[var(--color-accent)] font-semibold font-body text-sm sm:text-base">Voconly</span>
            </div>
            <div className="p-4 sm:p-5 flex items-center text-white/40 font-body text-sm sm:text-base border-l border-white/5">
              <span>{lang === 'zh' ? '传统工具' : 'Traditional tools'}</span>
            </div>
          </div>

          {/* 对比项 */}
          {items.map((item, index) => (
            <div
              key={item.label}
              className={`grid grid-cols-[1fr_1.3fr_1.3fr] ${index < items.length - 1 ? 'border-b border-white/5' : ''}`}
            >
              <div className="p-4 sm:p-5 text-white/60 font-body text-xs sm:text-sm flex items-center">{item.label}</div>
              <div className="p-4 sm:p-5 border-l border-white/5 bg-[var(--color-accent)]/5">
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span className="text-white text-xs sm:text-sm font-body font-medium leading-relaxed">{item.voconly}</span>
                </div>
              </div>
              <div className="p-4 sm:p-5 border-l border-white/5">
                <div className="flex items-start gap-2.5">
                  <X className="w-4 h-4 text-white/25 flex-shrink-0 mt-0.5" />
                  <span className="text-white/40 text-xs sm:text-sm font-body leading-relaxed">{item.traditional}</span>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}