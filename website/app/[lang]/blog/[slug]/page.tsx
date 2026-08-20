import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { getPostBySlug, getAllPosts } from '../../../lib/blog';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';
import type { Language } from '../../../lib/locales';

interface PageProps {
  params: Promise<{ slug: string; lang: Language }>;
}

// 预生成所有博客文章页面
export async function generateStaticParams() {
  const slugs: Array<{ slug: string; lang: string }> = [];

  for (const lang of ['zh', 'en'] as Language[]) {
    const posts = getAllPosts(lang);
    for (const post of posts) {
      slugs.push({ slug: post.slug, lang });
    }
  }

  return slugs;
}

// 动态生成元数据
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, lang } = await params;
  const post = getPostBySlug(slug, lang);

  if (!post) {
    return {
      title: lang === 'zh' ? '文章不存在 - Voconly' : 'Post Not Found - Voconly',
    };
  }

  return {
    title: `${post.title} - Voconly`,
    description: post.description,
    alternates: {
      canonical: `https://www.voconly.com/${lang}/blog/${slug}/`,
      languages: {
        'zh-CN': `https://www.voconly.com/zh/blog/${slug}/`,
        'en': `https://www.voconly.com/en/blog/${slug}/`,
        'x-default': 'https://www.voconly.com/',
      },
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      locale: lang === 'zh' ? 'zh_CN' : 'en_US',
      url: `https://www.voconly.com/${lang}/blog/${slug}/`,
      publishedTime: post.date,
      authors: ['老幸.AI'],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug, lang } = await params;
  const post = getPostBySlug(slug, lang);

  if (!post) {
    notFound();
  }

  const translations = {
    zh: {
      backToBlog: '← 返回博客',
    },
    en: {
      backToBlog: '← Back to Blog',
    },
  };

  const t = translations[lang] || translations.zh;

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      <article className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link
              href={`/${lang}/blog`}
              className="font-body text-sm text-white/50 hover:text-white transition-colors"
            >
              {t.backToBlog}
            </Link>
          </div>

          {/* Header */}
          <header className="mb-10">
            <time className="font-body text-sm text-white/50 mb-2 block">
              {new Date(post.date).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')}
            </time>
            <h1 className="font-display text-3xl sm:text-4xl text-white mb-4">
              {post.title}
            </h1>
            <p className="font-body text-white/60 text-lg">
              {post.description}
            </p>
          </header>

          {/* Content */}
          <div className="prose prose-invert prose-lg max-w-none">
            <ReactMarkdown>{post.content}</ReactMarkdown>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}