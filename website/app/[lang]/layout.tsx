import type { Metadata } from 'next';
import { DM_Serif_Display, DM_Sans } from 'next/font/google';
import '../globals.css';
import { I18nProvider } from '../lib/i18n-context';
import { StructuredData } from '../components/StructuredData';
import Navbar from '../components/Navbar';
import type { Language } from '../lib/locales';

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

const metadataByLang: Record<Language, Metadata> = {
  zh: {
    title: 'Voconly - 开源AI语音输入工具 | 离线识别，隐私安全，永久免费',
    description: 'Voconly 是一款开源的AI语音输入工具，支持离线Whisper语音识别，本地处理无需联网，数据隐私安全。全球热键唤起，LLM智能处理。永久免费。',
    keywords: ['语音输入', 'AI语音', '开源语音输入', '离线语音识别', '语音转文字', 'Whisper', '本地语音识别', '语音笔记'],
    alternates: {
      canonical: 'https://www.voconly.com/zh/',
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
    },
  },
  en: {
    title: 'Voconly - Open Source AI Voice Typing | Offline, Private, Free',
    description: 'Voconly is an open source AI voice typing tool with offline Whisper recognition. Local processing, no internet needed, data stays private. Free forever.',
    keywords: ['ai voice typing', 'open source voice typing', 'offline voice typing', 'local voice typing', 'ai dictation', 'voice input', 'speech to text', 'whisper'],
    alternates: {
      canonical: 'https://www.voconly.com/en/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/',
        'en': 'https://www.voconly.com/en/',
        'x-default': 'https://www.voconly.com/',
      },
    },
    openGraph: {
      title: 'Voconly - Open Source AI Voice Typing',
      description: 'Offline Whisper recognition, global shortcut, LLM smart processing. Local, private, free.',
      type: 'website',
      locale: 'en_US',
    },
  },
};

export async function generateStaticParams() {
  return [{ lang: 'zh' }, { lang: 'en' }];
}

export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
  const lang = params.lang as Language;
  return metadataByLang[lang] || metadataByLang.zh;
}

export default function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { lang: Language };
}) {
  const { lang } = params;

  return (
    <html lang={lang} className="dark">
      <head>
        <StructuredData lang={lang} path="/" />
        {/* Umami Analytics - 隐私友好的访问统计 */}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <script
            defer
            src="https://cloud.umami.is/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        )}
      </head>
      <body className={`${dmSerif.variable} ${dmSans.variable} antialiased`}>
        <I18nProvider initialLang={lang}>
          <Navbar />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}