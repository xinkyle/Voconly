import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import type { Language } from '../../lib/locales';

interface PageProps {
  params: Promise<{ lang: Language }>;
}

const metadataByLang: Record<Language, Metadata> = {
  zh: {
    title: '反馈建议 - Voconly',
    description: '有问题或建议？通过 GitHub Issues 或邮件联系 Voconly 团队，我们重视每一条反馈。',
    alternates: {
      canonical: 'https://www.voconly.com/zh/feedback/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/feedback/',
        'en': 'https://www.voconly.com/en/feedback/',
      },
    },
    openGraph: {
      title: '反馈建议 - Voconly',
      description: '有问题或建议？联系我们，我们重视每一条反馈。',
      type: 'website',
      locale: 'zh_CN',
    },
  },
  en: {
    title: 'Feedback - Voconly',
    description: 'Have questions or suggestions? Contact the Voconly team via GitHub Issues or email. We value every piece of feedback.',
    alternates: {
      canonical: 'https://www.voconly.com/en/feedback/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/feedback/',
        'en': 'https://www.voconly.com/en/feedback/',
      },
    },
    openGraph: {
      title: 'Feedback - Voconly',
      description: 'Have questions or suggestions? Contact us, we value every piece of feedback.',
      type: 'website',
      locale: 'en_US',
    },
  },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  return metadataByLang[lang] || metadataByLang.zh;
}

export default async function FeedbackPage({ params }: PageProps) {
  const { lang } = await params;

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {lang === 'zh' ? '反馈建议' : 'Feedback'}
          </h1>
          <p className="font-body text-white/60 text-lg">
            {lang === 'zh'
              ? '您的意见对我们很重要，欢迎通过以下方式联系我们'
              : 'Your feedback matters. Reach out through one of the channels below.'}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            {/* GitHub Issues */}
            <div className="p-6 rounded-lg bg-white/[0.02]">
              <h2 className="font-display text-2xl text-white mb-4">
                {lang === 'zh' ? 'GitHub Issues' : 'GitHub Issues'}
              </h2>
              <p className="font-body text-base text-white/70 leading-relaxed mb-3">
                {lang === 'zh'
                  ? '适合提交功能建议、Bug 报告，或参与讨论。'
                  : 'For feature requests, bug reports, and discussions.'}
              </p>
              <a
                href="https://github.com/xinkyle/Voconly/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm text-[var(--color-accent)] hover:underline"
              >
                {lang === 'zh' ? '前往提交' : 'Submit an issue'}
              </a>
            </div>

            {/* 邮件 */}
            <div className="p-6 rounded-lg bg-white/[0.02]">
              <h2 className="font-display text-2xl text-white mb-4">
                {lang === 'zh' ? '邮件联系' : 'Email'}
              </h2>
              <p className="font-body text-base text-white/70 leading-relaxed mb-3">
                {lang === 'zh'
                  ? '适合一般咨询、合作洽谈或私密反馈。'
                  : 'For general inquiries, partnerships, or private feedback.'}
              </p>
              <a
                href="mailto:voconly@139.com"
                className="font-body text-sm text-[var(--color-accent)] hover:underline"
              >
                voconly@139.com
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}