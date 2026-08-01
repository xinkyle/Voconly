import type { Metadata } from 'next';
import { DM_Serif_Display, DM_Sans } from 'next/font/google';
import './globals.css';
import { I18nProvider } from './lib/i18n-context';

// 优雅的衬线显示字体用于标题
const dmSerif = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

// 简洁的无衬线用于正文
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Voconly - 一键语音输入，解放双手',
  description: 'Voconly 是一款桌面语音输入工具，通过本地 Whisper 模型实现离线语音识别，配合全局快捷键和可选的 LLM 后处理模块，让你在任何应用中都能快速、私密、智能地将语音转为文字。',
  keywords: ['voice input', 'speech recognition', 'whisper', 'offline', 'voice to text', '语音输入', '语音识别'],
  openGraph: {
    title: 'Voconly - 一键语音输入，解放双手',
    description: '离线 Whisper 识别 × 全局快捷键 × LLM 智能处理',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh" className="dark">
      <body className={`${dmSerif.variable} ${dmSans.variable} antialiased`}>
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
