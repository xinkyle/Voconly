'use client';

import { motion } from 'framer-motion';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';
import { featuredFaqData } from '../lib/faq-data';
import { FaqAccordion } from './FaqAccordion';
import Link from 'next/link';

export default function FaqSection() {
  const { lang } = useI18n();
  const featuredQuestions = featuredFaqData[lang];

  return (
    <section id="faq" className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-[1fr_1.6fr] gap-12 lg:gap-16">
          {/* 左栏：标题 + 全部问题入口 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 mb-5">
              <span className="w-8 h-px" style={{ background: 'var(--color-accent)' }} />
              <span className="font-body text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>
                {lang === 'zh' ? '05 · 常见问题' : '05 · FAQ'}
              </span>
              <span className="w-8 h-px" style={{ background: 'var(--color-accent)' }} />
            </div>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-5xl text-white leading-[1.15] tracking-tight mb-4">
              {lang === 'zh' ? '还有疑问？' : 'Got Questions?'}
            </h2>
            <p className="font-body text-white/50 leading-relaxed mb-8">
              {lang === 'zh' ? (
                <>
                  如果没找到想要的答案，
                  <a
                    href="mailto:voconly@139.com"
                    className="text-white underline underline-offset-4 hover:text-[var(--color-accent)] transition-colors"
                  >
                    直接联系我们
                  </a>
                  。
                </>
              ) : (
                <>
                  If you can&apos;t find what you&apos;re looking for,{' '}
                  <a
                    href="mailto:voconly@139.com"
                    className="text-white underline underline-offset-4 hover:text-[var(--color-accent)] transition-colors"
                  >
                    get in touch
                  </a>
                  .
                </>
              )}
            </p>
            <Link
              href={`/${lang}/faq`}
              className="inline-flex items-center gap-2 font-body text-sm font-medium text-[var(--color-accent)] hover:gap-3 transition-all group"
            >
              {lang === 'zh' ? '查看全部问题' : 'View all questions'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>

          {/* 右栏：手风琴 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="space-y-1">
              {featuredQuestions.map((item, index) => (
                <FaqAccordion key={index} item={item} />
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}