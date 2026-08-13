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
  title: 'Voconly - Open Source AI Voice Typing | Offline, Private, Free',
  description: 'Voconly is an open source AI voice typing tool with offline Whisper recognition. Local processing, no internet needed, data stays private. Free forever.',
  keywords: ['ai voice typing', 'open source voice typing', 'offline voice typing', 'local voice typing', 'ai dictation', 'voice input', 'speech to text', 'whisper'],
  openGraph: {
    title: 'Voconly - Open Source AI Voice Typing',
    description: 'Offline Whisper recognition, global shortcut, LLM smart processing. Local, private, free.',
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
