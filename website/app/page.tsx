import type { Metadata, Viewport } from 'next';
import { DM_Serif_Display, DM_Sans } from 'next/font/google';
import './globals.css';
import { I18nProvider } from './lib/i18n-context';
import { StructuredData } from './components/StructuredData';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import Pricing from './components/Pricing';
import FaqSection from './components/FaqSection';
import Testimonials from './components/Testimonials';
import Footer from './components/Footer';

const dmSerif = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Voconly - 开源AI语音输入工具 | 离线识别，隐私安全，永久免费',
  description: 'Voconly 是一款开源的AI语音输入工具，支持离线Whisper语音识别，本地处理无需联网，数据隐私安全。全球热键唤起，LLM智能处理。永久免费。',
  keywords: ['语音输入', 'AI语音', '开源语音输入', '离线语音识别', '语音转文字', 'Whisper', '本地语音识别', '语音笔记'],
  alternates: {
    canonical: 'https://www.voconly.com/',
    languages: {
      'zh-CN': 'https://www.voconly.com/zh/',
      'en': 'https://www.voconly.com/en/',
      'x-default': 'https://www.voconly.com/',
    },
  },
  openGraph: {
    title: 'Voconly - 开源AI语音输入工具',
    description: '离线Whisper识别，全球热键，LLM智能处理。本地运行，隐私安全，永久免费。',
    type: 'website',
    locale: 'zh_CN',
    url: 'https://www.voconly.com/',
    siteName: 'Voconly',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Voconly - 开源AI语音输入工具',
    description: '离线Whisper识别，全球热键，LLM智能处理。本地运行，隐私安全，永久免费。',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
};

// 根路径直接渲染中文内容（静态导出）
export default function RootPage() {
  return (
    <html lang="zh" className="dark">
      <head>
        <StructuredData lang="zh" path="/" />
      </head>
      <body className={`${dmSerif.variable} ${dmSans.variable} antialiased`}>
        <I18nProvider initialLang="zh">
          <Navbar />
          <main className="min-h-screen pt-16" style={{ background: 'var(--color-bg-primary)' }}>
            <Hero />
            <Features />
            <Pricing />
            <FaqSection />
            <Testimonials />
            <Footer />
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}