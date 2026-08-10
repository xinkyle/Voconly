'use client';

import { motion } from 'framer-motion';
import { Download as DownloadIcon, Monitor, Apple, Terminal } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';

const GITHUB_RELEASE_URL = 'https://github.com/xinkyle/Voconly/releases';

const platforms = [
  {
    nameKey: 'download.windows.name',
    icon: Monitor,
    version: 'v0.3.6',
    size: '~45 MB',
    href: GITHUB_RELEASE_URL,
    available: true,
    availableKey: 'download.windows.available',
    color: 'blue',
  },
  {
    nameKey: 'download.mac.name',
    icon: Apple,
    version: '',
    size: '',
    href: GITHUB_RELEASE_URL,
    available: false,
    availableKey: 'download.mac.comingSoon',
    color: 'green',
  },
  {
    nameKey: 'download.linux.name',
    icon: Terminal,
    version: '',
    size: '',
    href: GITHUB_RELEASE_URL,
    available: false,
    availableKey: 'download.linux.comingSoon',
    color: 'yellow',
  },
];

// 颜色配置
const colorConfig = {
  blue: {
    glow: 'rgba(87, 193, 255, 0.3)',
    bg: 'bg-accent-blue-soft',
    icon: 'text-accent-blue',
  },
  green: {
    glow: 'rgba(89, 212, 153, 0.3)',
    bg: 'bg-accent-green-soft',
    icon: 'text-accent-green',
  },
  yellow: {
    glow: 'rgba(255, 197, 51, 0.3)',
    bg: 'bg-accent-yellow-soft',
    icon: 'text-accent-yellow',
  },
};

export default function Download() {
  const { t } = useI18n();

  return (
    <section id="download" className="py-32 px-6 lg:px-12 relative">
      {/* 背景效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 底部渐变 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-64"
          style={{
            background: 'linear-gradient(to top, rgba(255,87,87,0.05), transparent)',
          }}
        />
        {/* 中心光晕 */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(87, 193, 255, 0.06), transparent)',
          }}
        />
      </div>

      <div className="max-w-4xl mx-auto text-center relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-display-lg font-medium text-ink mb-4">{t('download.title')}</h2>
          <p className="text-body-lg text-body mb-12 max-w-2xl mx-auto">
            {t('download.subtitle')}
          </p>
        </motion.div>

        {/* Download Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {platforms.map((platform, index) => {
            const Icon = platform.icon;
            const config = colorConfig[platform.color as keyof typeof colorConfig];

            return (
              <motion.div
                key={platform.nameKey}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="download-card group relative"
              >
                {/* 光晕背景 */}
                <div
                  className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                    platform.available ? '' : 'opacity-0'
                  }`}
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${config.glow}, transparent 50%)`,
                  }}
                />

                {/* 卡片内容 */}
                <div
                  className={`relative h-full ${
                    platform.available
                      ? 'bg-surface border border-hairline hover:border-hairline-strong hover:bg-surface-elevated'
                      : 'bg-surface/50 border border-hairline/50 opacity-60'
                  } rounded-xl p-6 transition-all duration-300`}
                  style={{
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="flex flex-col items-center">
                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${config.bg}`}>
                      <Icon className={`w-7 h-7 ${config.icon}`} />
                    </div>

                    {/* Platform Name */}
                    <h3 className="text-heading-md font-medium text-ink mb-1">
                      {t(platform.nameKey as any)}
                    </h3>

                    {/* Version Info */}
                    <p className="text-caption-sm text-mute mb-6">
                      {platform.version} · {platform.size}
                    </p>

                    {/* Download Button */}
                    {platform.available ? (
                      <motion.a
                        href={platform.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="download-button inline-flex items-center gap-2 bg-primary text-on-primary text-button-md font-medium px-5 py-2.5 rounded-md transition-all duration-200"
                      >
                        <DownloadIcon className="w-4 h-4" />
                        {t(platform.availableKey as any)}
                      </motion.a>
                    ) : (
                      <span className="inline-flex items-center gap-2 bg-surface-elevated text-ash text-button-md px-5 py-2.5 rounded-md cursor-not-allowed">
                        {t(platform.availableKey as any)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-body-sm text-mute space-y-3"
        >
          <p>
            {t('download.info.opensource')}
          </p>
          <p className="flex items-center justify-center gap-4">
            <a href={GITHUB_RELEASE_URL} target="_blank" rel="noopener noreferrer" className="text-body hover:text-ink underline underline-offset-2 transition-colors">
              {t('download.info.changelog')}
            </a>
            <span className="text-hairline">·</span>
            <a href="#" className="text-body hover:text-ink underline underline-offset-2 transition-colors">
              {t('download.info.requirements')}
            </a>
            <span className="text-hairline">·</span>
            <a href="#" className="text-body hover:text-ink underline underline-offset-2 transition-colors">
              {t('download.info.docs')}
            </a>
          </p>
        </motion.div>

        {/* 快捷键提示 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 inline-flex items-center gap-3 bg-surface/80 border border-hairline rounded-lg px-5 py-3 backdrop-blur-sm"
        >
          <span className="text-body-sm text-mute">{t('download.shortcutHint')}</span>
          <div className="flex items-center gap-1.5">
            <span className="keyboard-key">Command</span>
            <span className="text-mute">+</span>
            <span className="keyboard-key">T</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}