'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Github, Twitter } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// CTA 区块
function CTA() {
  const { t } = useI18n();

  return (
    <section className="relative py-24 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 背景光晕 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] opacity-20"
          style={{
            background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0, 212, 170, 0.25), transparent 70%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {t('footer.ctaTitle')}
          </h2>
          <p className="font-body text-lg text-white/50 mb-8 max-w-lg mx-auto">
            {t('footer.ctaSubtitle')}
          </p>

          <a
            href="https://github.com/xinkyle/Voconly/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-base py-4 px-8 inline-flex items-center gap-2 group"
          >
            {t('footer.downloadBtn')}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>

          <p className="mt-6 font-body text-sm text-white/30">
            {t('footer.freeInfo')}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// Footer 内容组件
function FooterContent() {
  const { t, get } = useI18n();
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  const footerLinks = [
    {
      title: t('footer.links.product.title'),
      links: get<string[]>('footer.links.product.items'),
    },
    {
      title: t('footer.links.support.title'),
      links: get<string[]>('footer.links.support.items'),
    },
    {
      title: t('footer.links.company.title'),
      links: get<string[]>('footer.links.company.items'),
    },
  ];

  // 锚点链接映射
  const anchorLinks: Record<string, string> = {
    '功能介绍': '#features',
    '定价方案': '#pricing',
    'Features': '#features',
    'Pricing': '#pricing',
  };

  // 外部链接映射
  const externalLinks: Record<string, string> = {
    '联系我们': 'mailto:voconly@139.com',
    '反馈建议': 'https://github.com/xinkyle/Voconly/issues',
    '开源项目': 'https://github.com/xinkyle/Voconly',
    'Contact': 'mailto:voconly@139.com',
    'Feedback': 'https://github.com/xinkyle/Voconly/issues',
    'Open Source': 'https://github.com/xinkyle/Voconly',
  };

  // 获取链接地址
  const getLinkHref = (link: string): string => {
    // 常见问题
    if (link === '常见问题' || link === 'FAQ') return '/faq';
    // 关于我们
    if (link === '关于我们' || link === 'About Us') return '/about';
    // 外部链接
    if (externalLinks[link]) return externalLinks[link];
    // 锚点链接
    if (anchorLinks[link]) {
      return isHomePage ? anchorLinks[link] : '/' + anchorLinks[link];
    }
    // 其他
    return '#';
  };

  // 判断链接类型
  const isInternalPageLink = (link: string): boolean => {
    return link === '常见问题' || link === 'FAQ' ||
           link === '关于我们' || link === 'About Us';
  };

  const isExternalLink = (link: string): boolean => {
    return !!externalLinks[link];
  };

  const socialLinks = [
    { icon: Twitter, href: '#', label: 'Twitter' },
    { icon: Github, href: 'https://github.com/xinkyle/Voconly', label: 'GitHub' },
  ];

  return (
    <footer className="relative py-16 border-t border-white/5" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-6xl mx-auto px-6 lg:px-12">
        <div className="grid md:grid-cols-6 gap-12 mb-12">
          {/* Logo 和描述 */}
          <div className="md:col-span-3">
            <div className="flex items-center gap-2.5 mb-4">
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
            </div>
            <p className="font-body text-sm text-white/40 mb-6 max-w-xs">
              {t('footer.description')}
            </p>

            {/* 社交链接 */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-white/40 hover:text-[var(--color-accent)] hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
                  aria-label={social.label}
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* 链接列表 */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="font-body text-sm font-semibold text-white mb-4">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link) => {
                  const href = getLinkHref(link);

                  return (
                    <li key={link}>
                      {isInternalPageLink(link) ? (
                        <Link
                          href={href}
                          className="font-body text-sm text-white/40 hover:text-white transition-colors"
                        >
                          {link}
                        </Link>
                      ) : isExternalLink(link) ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-body text-sm text-white/40 hover:text-white transition-colors"
                        >
                          {link}
                        </a>
                      ) : (
                        <a
                          href={href}
                          className="font-body text-sm text-white/40 hover:text-white transition-colors"
                        >
                          {link}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* 底部版权 */}
        <div className="pt-8 border-t border-white/5 text-center">
          <p className="font-body text-xs text-white/30">
            {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Footer() {
  return (
    <>
      <CTA />
      <FooterContent />
    </>
  );
}
