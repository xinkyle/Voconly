import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { FaqSearch } from '../../components/FaqSearch';
import { faqData } from '../../lib/faq-data';
import type { Language } from '../../lib/locales';

interface PageProps {
  params: Promise<{ lang: Language }>;
}

const metadataByLang: Record<Language, Metadata> = {
  zh: {
    title: '常见问题 - Voconly',
    description: 'Voconly 使用常见问题解答：如何安装、如何使用、支持哪些系统、隐私安全等问题的详细解答。',
    alternates: {
      canonical: 'https://www.voconly.com/zh/faq/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/faq/',
        'en': 'https://www.voconly.com/en/faq/',
      },
    },
    openGraph: {
      title: '常见问题 - Voconly',
      description: 'Voconly 使用常见问题解答：安装、使用、系统支持、隐私安全等。',
      type: 'website',
      locale: 'zh_CN',
    },
  },
  en: {
    title: 'FAQ - Voconly',
    description: 'Frequently asked questions about Voconly: installation, usage, system support, privacy and security, and more.',
    alternates: {
      canonical: 'https://www.voconly.com/en/faq/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/faq/',
        'en': 'https://www.voconly.com/en/faq/',
      },
    },
    openGraph: {
      title: 'FAQ - Voconly',
      description: 'Frequently asked questions about Voconly: installation, usage, system support, and more.',
      type: 'website',
      locale: 'en_US',
    },
  },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  return metadataByLang[lang] || metadataByLang.zh;
}

export default async function FaqPage({ params }: PageProps) {
  const { lang } = await params;
  const faqCategories = faqData[lang];

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {lang === 'zh' ? '常见问题' : 'FAQ'}
          </h1>
          <p className="font-body text-white/60 text-lg">
            {lang === 'zh'
              ? '找到关于 Voconly 的所有问题的答案'
              : 'Find answers to all your questions about Voconly'}
          </p>
        </div>
      </section>

      {/* FAQ Content with Search */}
      <section className="pb-20 px-4">
        <FaqSearch categories={faqCategories} lang={lang} />
      </section>

      {/* Footer CTA */}
      <section className="py-16 px-4 border-t border-white/10">
        <div className="max-w-3xl mx-auto text-center">
          <p className="font-body text-white/60 mb-4">
            {lang === 'zh' ? '还有其他问题？' : 'Still have questions?'}
          </p>
          <a
            href="https://github.com/xinkyle/Voconly/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            {lang === 'zh' ? '提交 Issue' : 'Submit an Issue'}
          </a>
        </div>
      </section>

      <Footer />
    </main>
  );
}