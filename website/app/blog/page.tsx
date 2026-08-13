import Link from 'next/link';
import { getAllPosts } from '../lib/blog';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-display text-4xl sm:text-5xl text-white mb-4">
            博客
          </h1>
          <p className="font-body text-white/60 text-lg">
            探索语音识别、AI 模型选择的深度内容
          </p>
        </div>
      </section>

      {/* Blog List */}
      <section className="pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-body text-white/60">暂无文章</p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="block py-6 border-b border-white/10 last:border-0 hover:bg-white/5 -mx-4 px-4 transition-colors"
                >
                  <div className="flex items-center gap-4 text-sm text-white/40 mb-2">
                    <time>{new Date(post.date).toLocaleDateString('zh-CN')}</time>
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