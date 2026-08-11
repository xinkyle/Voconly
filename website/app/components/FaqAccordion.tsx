'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FaqItem } from '../lib/faq-data';

interface FaqAccordionProps {
  item: FaqItem;
}

export function FaqAccordion({ item }: FaqAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
      >
        <span className="font-body text-white font-medium pr-4">{item.question}</span>
        <ChevronDown
          className={`w-5 h-5 text-white/50 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-5 pb-4 pt-0">
          <div className="font-body text-white/70 text-base leading-relaxed whitespace-pre-line">
            {item.answer}
          </div>
        </div>
      )}
    </div>
  );
}