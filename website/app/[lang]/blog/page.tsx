import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '../../lib/blog';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import type { Language } from '../../lib/locales';

interface PageProps {
  params: Promise<{ lang: Language }>;
}

const metadataByLang: Record<Language, Metadata> = {
  zh: {
    title: '博客 - Voconly',
    description: 'Voconly 博客：语音识别技术、AI 模型选择、本地部署等深度内容，帮助你更好地使用语音输入工具。',
    alternates: {
      canonical: 'https://www.voconly.com/zh/blog/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/blog/',
        'en': 'https://www.voconly.com/en/blog/',
      },
    },
    openGraph: {
      title: '博客 - Voconly',
      description: '语音识别、AI 模型选择、本地部署等深度内容。',
      type: 'website',
      locale: 'zh_CN',
    },
  },
  en: {
    title: 'Blog - Voconly',
    description: 'Voconly Blog: Deep dives into speech recognition, AI model selection, local deployment, and more to help you make the most of voice typing.',
    alternates: {
      canonical: 'https://www.voconly.com/en/blog/',
      languages: {
        'zh-CN': 'https://www.voconly.com/zh/blog/',
        'en': 'https://www.voconly.com/en/blog/',
      },
    },
    openGraph: {
      title: 'Blog - Voconly',
      description: 'Deep dives into speech recognition, AI model selection, and more.',
      type: 'website',
      locale: 'en_US',
    },
  },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  return metadataByLang[lang] || metadataByLang.zh;
}

export default async function BlogPage({ params }: PageProps) {
  const { lang } = await params;
  const posts = getAllPosts(lang);

  const translations = {
    zh: {
      title: '博客',
      subtitle: '探索语音识别、AI 模型选择的深度内容',
      empty: '暂无文章',
      backToBlog: '返回博客',
    },
    en: {
      title: 'Blog',
      subtitle: 'Deep dive into speech recognition and AI model selection',
      empty: 'No posts yet',
      backToBlog: 'Back to Blog',
    },
  };

  const t = translations[lang] || translations.zh;

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-display text-4xl sm:text-5xl text-white mb-4">
            {t.title}
          </h1>
          <p className="font-body text-white/60 text-lg">
            {t.subtitle}
          </p>
        </div>
      </section>

      {/* Blog List */}
      <section className="pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-body text-white/60">{t.empty}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/${lang}/blog/${post.slug}`}
                  className="block py-6 border-b border-white/10 last:border-0 hover:bg-white/5 -mx-4 px-4 transition-colors"
                >
                  <div className="flex items-center gap-4 text-sm text-white/40 mb-2">
                    <time>{new Date(post.date).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')}</time>
                  </div>
                  <h2 className="font-display text-lg text-white mb-1 hover:text-[var(--color-accent)] transition-colors">
                    {post.title}
                  </h2>
                  <p className="font-body text-white/50 text-sm line-clamp-1">
                    {post.description}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}