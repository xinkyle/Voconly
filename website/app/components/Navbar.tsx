'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Languages, ChevronDown, Download, Github } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

export default function Navbar() {
  const { lang, setLang, t } = useI18n();
  const [isScrolled, setIsScrolled] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinks = [
    { name: t('nav.features'), href: '#features' },
    { name: t('nav.pricing'), href: '#pricing' },
    { name: t('nav.download'), href: '#download' },
  ];

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 lg:px-12 transition-all duration-300 ${
        isScrolled
          ? 'bg-[var(--color-bg-primary)]/95 backdrop-blur-xl border-b border-white/5'
          : 'bg-transparent'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <a href="#" className="flex items-center gap-2.5">
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-white"
          >
            {/* T字Logo */}
            <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.1" />
            <path
              d="M8 8h16v4h-6v12h-4V12H8V8z"
              fill="currentColor"
            />
          </svg>
          <span className="font-display text-xl text-white">Voconly</span>
        </a>
        <a
          href="https://github.com/xinkyle/Voconly"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          title="GitHub"
        >
          <Github className="w-4 h-4 text-white/70 hover:text-white" />
        </a>
      </div>

      {/* Navigation Links - Desktop */}
      <div className="hidden md:flex items-center gap-8">
        {navLinks.map((link) => (
          <a
            key={link.name}
            href={link.href}
            className="font-body text-sm text-white/60 hover:text-white transition-colors"
          >
            {link.name}
          </a>
        ))}
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Language Switcher */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all font-body text-sm text-white/70"
          >
            <Languages className="w-4 h-4" />
            <span>{lang === 'zh' ? '中文' : 'EN'}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
          </button>

          {langOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full right-0 mt-2 py-1 bg-[var(--color-bg-secondary)] border border-white/10 rounded-lg shadow-xl min-w-[90px]"
            >
              <button
                onClick={() => { setLang('zh'); setLangOpen(false); }}
                className={`w-full px-4 py-2 text-sm text-left hover:bg-white/5 transition-colors font-body ${lang === 'zh' ? 'text-white' : 'text-white/60'}`}
              >
                中文
              </button>
              <button
                onClick={() => { setLang('en'); setLangOpen(false); }}
                className={`w-full px-4 py-2 text-sm text-left hover:bg-white/5 transition-colors font-body ${lang === 'en' ? 'text-white' : 'text-white/60'}`}
              >
                English
              </button>
            </motion.div>
          )}
        </div>

        {/* Download Button */}
        <a
          href="https://github.com/xinkyle/Voconly/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {t('nav.download')}
        </a>
      </div>
    </motion.nav>
  );
}
