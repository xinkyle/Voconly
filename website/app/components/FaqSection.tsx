'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';
import { featuredFaqData } from '../lib/faq-data';
import { FaqAccordion } from './FaqAccordion';

export default function FaqSection() {
  const { lang } = useI18n();
  const featuredQuestions = featuredFaqData[lang];

  return (
    <section id="faq" className="py-24 px-6 lg:px-12" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-4xl mx-auto">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl sm:text-4xl text-white mb-4">
            {lang === 'zh' ? '常见问题' : 'FAQ'}
          </h2>
          <p className="font-body text-lg text-white/50">
            {lang === 'zh'
              ? '关于 Voconly 的常见问题解答'
              : 'Common questions about Voconly'}
          </p>
        </motion.div>

        {/* 精选问题列表 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="space-y-3 mb-8"
        >
          {featuredQuestions.map((item, index) => (
            <FaqAccordion key={index} item={item} />
          ))}
        </motion.div>

        {/* 查看更多按钮 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center"
        >
          <a
            href="/faq"
            className="btn-secondary inline-flex items-center gap-2 group"
          >
            {lang === 'zh' ? '查看更多问题' : 'View All Questions'}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}