import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import type { Language } from '../../lib/locales';

interface PageProps {
  params: Promise<{ lang: Language }>;
}

const metadataByLang: Record<Language, Metadata> = {
  zh: {
    title: '关于 Voconly - 开源AI语音输入工具',
    description: 'Voconly 是一款开源的本地语音转文字工具，所有语音识别在本地完成，无需联网，数据永不上传。由独立开发者老幸.AI 创建。',
    alternates: {
      canonical: 'https://www.voconly.com/zh/about/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/about/',
        'en': 'https://www.voconly.com/en/about/',
        'x-default': 'https://www.voconly.com/',
      },
    },
    openGraph: {
      title: '关于 Voconly',
      description: '开源本地语音转文字工具，隐私安全，永久免费。',
      type: 'website',
      locale: 'zh_CN',
    },
  },
  en: {
    title: 'About Voconly - Open Source AI Voice Typing',
    description: 'Voconly is an open source local speech-to-text tool. All voice recognition runs locally, no internet needed, your data never leaves your device. Created by indie developer 老幸.AI.',
    alternates: {
      canonical: 'https://www.voconly.com/en/about/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/about/',
        'en': 'https://www.voconly.com/en/about/',
        'x-default': 'https://www.voconly.com/',
      },
    },
    openGraph: {
      title: 'About Voconly',
      description: 'Open source local speech-to-text tool. Private, secure, free forever.',
      type: 'website',
      locale: 'en_US',
    },
  },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  return metadataByLang[lang] || metadataByLang.zh;
}

export default async function AboutPage({ params }: PageProps) {
  const { lang } = await params;

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {lang === 'zh' ? '关于 Voconly' : 'About Voconly'}
          </h1>
          <p className="font-body text-white/60 text-lg">
            {lang === 'zh'
              ? '本地语音转文字工具，让语音输入更简单'
              : 'Local speech-to-text tool, making voice input simpler'}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="pb-20 px-4">
        <div className="max-w-3xl mx-auto space-y-12">

          {/* 项目简介 */}
          <div>
            <h2 className="font-display text-2xl text-white mb-4">
              {lang === 'zh' ? '项目简介' : 'Project Introduction'}
            </h2>
            <p className="font-body text-base text-white/70 leading-relaxed">
              {lang === 'zh'
                ? 'Voconly 是一款本地运行的语音转文字工具。所有语音识别过程均在本地完成，无需联网，您的语音数据永远不会离开您的设备。我们相信语音输入应该是自然的、无缝的。无论您是在写文档、回复消息、还是记录灵感，Voconly 都能让您用声音高效表达，同时保护您的隐私。'
                : 'Voconly is a locally-run speech-to-text tool. All speech recognition processes are completed locally without requiring an internet connection. Your voice data never leaves your device. We believe voice input should be natural and seamless. Whether you\'re writing documents, replying to messages, or recording ideas, Voconly lets you express yourself efficiently with your voice while protecting your privacy.'}
            </p>
          </div>

          {/* 作者 */}
          <div>
            <h2 className="font-display text-2xl text-white mb-4">
              {lang === 'zh' ? '作者' : 'Author'}
            </h2>
            <p className="font-body text-base text-white/70 leading-relaxed mb-2">老幸.AI</p>
            <p className="font-body text-base text-white/50 mb-3">
              {lang === 'zh'
                ? '独立开发者，专注于生产力工具和 AI 应用'
                : 'Independent developer focused on productivity tools and AI applications'}
            </p>
            <a
              href="mailto:voconly@139.com"
              className="font-body text-sm text-[var(--color-accent)] hover:underline"
            >
              voconly@139.com
            </a>
          </div>

          {/* 开源 */}
          <div>
            <h2 className="font-display text-2xl text-white mb-4">
              {lang === 'zh' ? '开源协议' : 'Open Source'}
            </h2>
            <p className="font-body text-base text-white/70 leading-relaxed mb-3">
              {lang === 'zh'
                ? 'Voconly 采用 MIT 协议开源，您可以自由使用、修改和分发。'
                : 'Voconly is open sourced under the MIT license.'}
            </p>
            <div className="flex gap-4">
              <a
                href="https://github.com/xinkyle/Voconly"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm text-[var(--color-accent)] hover:underline"
              >
                {lang === 'zh' ? '查看源码' : 'View Source'}
              </a>
              <a
                href="https://github.com/xinkyle/Voconly/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm text-white/50 hover:text-white transition-colors"
              >
                MIT License
              </a>
            </div>
          </div>

          {/* 联系方式 */}
          <div>
            <h2 className="font-display text-2xl text-white mb-4">
              {lang === 'zh' ? '联系我们' : 'Contact'}
            </h2>
            <p className="font-body text-base text-white/70 leading-relaxed mb-3">
              {lang === 'zh'
                ? '有问题或建议？欢迎通过以下方式联系我们。'
                : 'Have questions or suggestions? Feel free to reach out.'}
            </p>
            <div className="flex gap-4">
              <a
                href="mailto:voconly@139.com"
                className="font-body text-sm text-white/60 hover:text-white transition-colors"
              >
                voconly@139.com
              </a>
              <span className="text-white/30">·</span>
              <a
                href="https://github.com/xinkyle/Voconly/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm text-white/60 hover:text-white transition-colors"
              >
                {lang === 'zh' ? '提交 Issue' : 'Submit an Issue'}
              </a>
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </main>
  );
}