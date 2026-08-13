'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Languages, ChevronDown, Download, Github, Menu, X, ArrowLeft } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Navbar() {
  const { lang, setLang, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // 关闭移动菜单时禁止背景滚动
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  // Escape 键关闭移动菜单
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  // 获取带语言前缀的链接
  const getLocalizedLink = (path: string): string => {
    if (path.startsWith('#')) return path;
    return `/${lang}${path}`;
  };

  // 切换语言并导航到对应路径
  const switchLanguage = (newLang: 'zh' | 'en') => {
    setLang(newLang);
    setLangOpen(false);
    setMobileMenuOpen(false);

    // 替换 URL 中的语言前缀并导航
    const currentPath = pathname;
    const pathWithoutLang = currentPath.replace(/^\/(zh|en)(\/|$)/, '/');
    const newPath = `/${newLang}${pathWithoutLang === '/' ? '' : pathWithoutLang}`;
    router.replace(newPath);
  };

  // 判断是否为详情页（非首页）
  const isDetailPage = pathname !== '/' && pathname !== `/${lang}/`;

  const navLinks = [
    { name: t('nav.features'), href: '#features' },
    { name: t('nav.pricing'), href: '#pricing' },
    { name: t('nav.faq'), href: getLocalizedLink('/faq') },
    { name: t('nav.download'), href: '#download' },
  ];

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`fixed top-0 left-0 right-0 z-50 h-14 sm:h-16 flex items-center px-4 sm:px-6 lg:px-12 transition-all duration-300 ${
          isScrolled
            ? 'bg-[var(--color-bg-primary)]/95 backdrop-blur-xl border-b border-white/5'
            : 'bg-transparent'
        }`}
      >
        {/* Logo - 左侧 */}
        {isDetailPage ? (
          <Link href={`/${lang}/`} className="flex items-center gap-2 flex-shrink-0">
            <svg
              width="28"
              height="28"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-white"
            >
              <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.1" />
              <path d="M8 8h16v4h-6v12h-4V12H8V8z" fill="currentColor" />
            </svg>
            <span className="font-display text-lg sm:text-xl text-white">Voconly</span>
          </Link>
        ) : (
          <a href="#" className="flex items-center gap-2 flex-shrink-0">
            <svg
              width="28"
              height="28"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-white"
            >
              <rect width="32" height="32" rx="8" fill="currentColor" fillOpacity="0.1" />
              <path d="M8 8h16v4h-6v12h-4V12H8V8z" fill="currentColor" />
            </svg>
            <span className="font-display text-lg sm:text-xl text-white">Voconly</span>
          </a>
        )}

        {/* 导航链接 - 绝对居中（仅首页显示） */}
        {!isDetailPage && (
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="font-body text-sm text-white/60 hover:text-white transition-colors"
              >
                {link.href === '#pricing' ? (
                  <>
                    {lang === 'zh' ? (
                      <>定价（<span className="text-[var(--color-accent)] font-bold">免费</span>）</>
                    ) : (
                      <>Pricing (<span className="text-[var(--color-accent)] font-bold">Free</span>)</>
                    )}
                  </>
                ) : (
                  link.name
                )}
              </a>
            ))}
          </div>
        )}

        {/* 详情页：返回首页按钮 */}
        {isDetailPage && (
          <Link
            href={`/${lang}/`}
            className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-2 font-body text-sm text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {lang === 'zh' ? '返回首页' : 'Back to Home'}
          </Link>
        )}

        {/* 右侧按钮 - 右对齐 */}
        <div className="hidden md:flex items-center gap-3 ml-auto">
          {/* Language Switcher */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="h-9 flex items-center gap-1.5 px-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all font-body text-sm text-white/70"
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
                  onClick={() => switchLanguage('zh')}
                  className={`w-full px-4 py-2 text-sm text-left hover:bg-white/5 transition-colors font-body ${lang === 'zh' ? 'text-white' : 'text-white/60'}`}
                >
                  中文
                </button>
                <button
                  onClick={() => switchLanguage('en')}
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
            className="h-9 btn-primary text-sm px-4 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t('nav.download')}
          </a>

          {/* GitHub */}
          <a
            href="https://github.com/xinkyle/Voconly"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            title="GitHub"
          >
            <Github className="w-4 h-4 text-white/70 hover:text-white" />
          </a>
        </div>

        {/* Mobile: Hamburger Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          aria-label={lang === 'zh' ? '打开菜单' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 border border-white/10 ml-auto"
        >
          <Menu className="w-5 h-5 text-white/70" />
        </button>
      </motion.nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />

            {/* 菜单面板 */}
            <motion.div
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label={lang === 'zh' ? '导航菜单' : 'Navigation menu'}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-[var(--color-bg-primary)] border-l border-white/10 md:hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <span className="font-display text-lg text-white">{lang === 'zh' ? '菜单' : 'Menu'}</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={lang === 'zh' ? '关闭菜单' : 'Close menu'}
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/5"
                >
                  <X className="w-5 h-5 text-white/70" />
                </button>
              </div>

              {/* 导航链接 */}
              <div className="flex-1 p-4 space-y-2">
                {isDetailPage ? (
                  <>
                    <Link
                      href={`/${lang}/`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 py-3 px-4 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors font-body"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      {lang === 'zh' ? '返回首页' : 'Back to Home'}
                    </Link>
                    <Link
                      href={getLocalizedLink('/about')}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-3 px-4 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors font-body"
                    >
                      {lang === 'zh' ? '关于我们' : 'About Us'}
                    </Link>
                  </>
                ) : (
                  <>
                    {navLinks.map((link) => (
                      <a
                        key={link.name}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block py-3 px-4 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors font-body"
                      >
                        {link.href === '#pricing' ? (
                          <>
                            {lang === 'zh' ? (
                              <>定价（<span className="text-[var(--color-accent)] font-bold">免费</span>）</>
                            ) : (
                              <>Pricing (<span className="text-[var(--color-accent)] font-bold">Free</span>)</>
                            )}
                          </>
                        ) : (
                          link.name
                        )}
                      </a>
                    ))}
                    <Link
                      href={getLocalizedLink('/about')}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-3 px-4 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors font-body"
                    >
                      {lang === 'zh' ? '关于我们' : 'About Us'}
                    </Link>
                  </>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="p-4 space-y-3 border-t border-white/10">
                {/* 语言切换 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => switchLanguage('zh')}
                    className={`flex-1 py-2.5 px-4 rounded-lg border font-body text-sm transition-colors ${
                      lang === 'zh'
                        ? 'bg-[var(--color-accent)] text-[var(--color-bg-primary)] border-[var(--color-accent)]'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    中文
                  </button>
                  <button
                    onClick={() => switchLanguage('en')}
                    className={`flex-1 py-2.5 px-4 rounded-lg border font-body text-sm transition-colors ${
                      lang === 'en'
                        ? 'bg-[var(--color-accent)] text-[var(--color-bg-primary)] border-[var(--color-accent)]'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    English
                  </button>
                </div>

                {/* 下载按钮 */}
                <a
                  href="https://github.com/xinkyle/Voconly/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-sm py-3 w-full justify-center"
                >
                  <Download className="w-4 h-4" />
                  {t('nav.download')}
                </a>

                {/* GitHub */}
                <a
                  href="https://github.com/xinkyle/Voconly"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/5 border border-white/10 text-white/70 font-body text-sm"
                >
                  <Github className="w-4 h-4" />
                  GitHub
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
