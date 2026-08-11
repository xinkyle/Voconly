'use client';

import { motion } from 'framer-motion';
import { Download, Sparkles, Monitor, Apple, Terminal } from 'lucide-react';
import Navbar from './Navbar';
import { useI18n } from '../lib/i18n-context';

const GITHUB_RELEASE_URL = 'https://github.com/xinkyle/Voconly/releases';
const GITEE_WINDOWS_DOWNLOAD_URL = 'https://gitee.com/xingkyle/Voconly/releases/download/v0.3.7/Voconly_0.3.7_x64-setup.exe';
const GITHUB_WINDOWS_DOWNLOAD_URL = 'https://github.com/xinkyle/Voconly/releases/download/v0.3.7/Voconly_0.3.7_x64-setup.exe';

export default function Hero() {
  const { t, lang } = useI18n();

  // 中文用户从 Gitee 下载，英文用户从 GitHub 下载
  const windowsDownloadUrl = lang === 'zh' ? GITEE_WINDOWS_DOWNLOAD_URL : GITHUB_WINDOWS_DOWNLOAD_URL;

  const platforms = [
    {
      name: 'Windows',
      icon: Monitor,
      href: windowsDownloadUrl,
      available: true,
    },
    {
      name: 'macOS',
      icon: Apple,
      href: GITHUB_RELEASE_URL,
      available: false,
    },
    {
      name: 'Linux',
      icon: Terminal,
      href: GITHUB_RELEASE_URL,
      available: false,
    },
  ];

  return (
    <section className="relative min-h-screen overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 极简背景：单一光晕 + 网格 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 中心光晕 */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] opacity-35"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0, 212, 170, 0.3), transparent 70%)',
          }}
        />
        {/* 微妙网格 */}
        <div className="absolute inset-0 grid-bg opacity-50" />
      </div>

      <Navbar />

      {/* Hero 内容 - 居中对齐 */}
      <div className="relative z-10 px-6 lg:px-12 pt-32 lg:pt-40 pb-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* 顶部徽章 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <a
              href={GITHUB_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-[var(--color-accent)]" />
              <span className="font-bold text-[var(--color-accent)]">{t('hero.freeOpenSource')}</span>
              <span className="text-white/40">·</span>
              {t('hero.badge')}
            </a>
          </motion.div>

          {/* 主标题 - 使用衬线字体 */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-5xl sm:text-6xl lg:text-7xl text-white mb-20 leading-[1.1] tracking-tight"
          >
            {t('hero.title')}
          </motion.h1>

          {/* 副标题 */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="font-body text-xl sm:text-2xl text-white/60 mb-8 max-w-2xl mx-auto leading-relaxed"
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* 描述 */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="font-body text-base text-white/40 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            {t('hero.description')}
          </motion.p>

          {/* CTA 按钮 - 三个系统下载按钮 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            {platforms.map((platform) => {
              const Icon = platform.icon;
              // 直接下载文件不需要 target="_blank"，跳转页面需要
              const needNewTab = !platform.available;
              return (
                <motion.a
                  key={platform.name}
                  href={platform.href}
                  target={needNewTab ? '_blank' : undefined}
                  rel={needNewTab ? 'noopener noreferrer' : undefined}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`inline-flex items-center gap-2 py-3 px-5 rounded-lg font-body font-medium transition-all ${
                    platform.available
                      ? 'bg-[var(--color-accent)] text-[var(--color-bg-primary)] hover:shadow-lg hover:shadow-[var(--color-accent)]/20'
                      : 'bg-white/5 text-white/50 border border-white/10 cursor-default'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{platform.name}</span>
                  {platform.available && <Download className="w-4 h-4" />}
                  {!platform.available && (
                    <span className="text-xs opacity-60">{lang === 'zh' ? '即将推出' : 'Soon'}</span>
                  )}
                </motion.a>
              );
            })}
          </motion.div>

          {/* 应用截图 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-16 relative"
          >
            <div className="relative mx-auto max-w-3xl">
              {/* 截图光晕 */}
              <div
                className="absolute -inset-4 blur-3xl opacity-20"
                style={{
                  background: 'radial-gradient(ellipse 80% 50% at 50% 100%, var(--color-accent), transparent)',
                }}
              />
              <motion.div
                className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <img
                  src={lang === 'zh' ? '/demo_cn.gif' : '/demo_en.gif'}
                  alt="Voconly Demo"
                  className="w-full h-auto"
                />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
