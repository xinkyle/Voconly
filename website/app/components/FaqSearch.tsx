'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import type { FaqCategory } from '../lib/faq-data';
import { FaqAccordion } from './FaqAccordion';

interface FaqSearchProps {
  categories: FaqCategory[];
  lang: 'zh' | 'en';
}

export function FaqSearch({ categories, lang }: FaqSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories: FaqCategory[] = searchQuery
    ? categories
        .map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (item) =>
              item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.answer.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    : categories;

  return (
    <>
      {/* Search */}
      <div className="relative max-w-md mx-auto mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={lang === 'zh' ? '搜索问题...' : 'Search questions...'}
          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg font-body text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--color-accent)]/50 focus:bg-white/10 transition-all"
        />
      </div>

      {/* FAQ Content */}
      <div className="max-w-3xl mx-auto">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((cat, index) => (
            <section key={index} className="mb-10">
              <h2 className="font-display text-xl text-white mb-4">{cat.category}</h2>
              <div className="space-y-3">
                {cat.items.map((item, idx) => (
                  <FaqAccordion key={idx} item={item} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="font-body text-white/60">
              {lang === 'zh' ? '没有找到相关问题' : 'No matching questions found'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}