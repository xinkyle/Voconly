import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { getPostBySlug, getAllPosts } from '../../../lib/blog';
import Navbar from '../../../components/Navbar';
import Footer from '../../../components/Footer';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// 预生成所有博客文章页面
export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

// 动态生成元数据
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: '文章不存在 - Voconly',
    };
  }

  return {
    title: `${post.title} - Voconly`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      <article className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link
              href="/blog"
              className="font-body text-sm text-white/50 hover:text-white transition-colors"
            >
              ← 返回博客
            </Link>
          </div>

          {/* Header */}
          <header className="mb-10">
            <time className="font-body text-sm text-white/50 mb-2 block">
              {new Date(post.date).toLocaleDateString('zh-CN')}
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