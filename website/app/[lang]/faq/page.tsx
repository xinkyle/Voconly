'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { faqData, type FaqCategory, type FaqItem } from '../../lib/faq-data';
import { useI18n } from '../../lib/i18n-context';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { FaqAccordion } from '../../components/FaqAccordion';

interface FaqCategoryProps {
  category: string;
  items: FaqItem[];
}

function FaqCategorySection({ category, items }: FaqCategoryProps) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl text-white mb-4">{category}</h2>
      <div className="space-y-3">
        {items.map((item, index) => (
          <FaqAccordion key={index} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function FaqPage() {
  const { lang } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const faqCategories = faqData[lang];

  // 过滤 FAQ
  const filteredCategories: FaqCategory[] = searchQuery
    ? faqCategories
        .map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (item) =>
              item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.answer.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    : faqCategories;

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {lang === 'zh' ? '常见问题' : 'FAQ'}
          </h1>
          <p className="font-body text-white/60 text-lg mb-8">
            {lang === 'zh'
              ? '找到关于 Voconly 的所有问题的答案'
              : 'Find answers to all your questions about Voconly'}
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'zh' ? '搜索问题...' : 'Search questions...'}
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg font-body text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--color-accent)]/50 focus:bg-white/10 transition-all"
            />
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((cat, index) => (
              <FaqCategorySection key={index} category={cat.category} items={cat.items} />
            ))
          ) : (
            <div className="text-center py-12">
              <p className="font-body text-white/60">
                {lang === 'zh' ? '没有找到相关问题' : 'No matching questions found'}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 px-4 border-t border-white/10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-body text-white/60 mb-4">
            {lang === 'zh' ? '还有其他问题？' : 'Still have questions?'}
          </p>
          <a
            href="https://github.com/xinkyle/Voconly/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            {lang === 'zh' ? '提交 Issue' : 'Submit an Issue'}
          </a>
        </div>
      </section>

      <Footer />
    </main>
  );
}