import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Language } from './locales';

const contentDirectory = path.join(process.cwd(), 'content/blog');

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  content: string;
  lang: Language;
}

export function getAllPosts(lang: Language): BlogPost[] {
  const langDir = path.join(contentDirectory, lang);

  // 确保语言目录存在
  if (!fs.existsSync(langDir)) {
    return [];
  }

  const files = fs.readdirSync(langDir);
  const posts = files
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const filePath = path.join(langDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(fileContent);

      return {
        slug: file.replace(/\.md$/, ''),
        title: data.title || 'Untitled',
        description: data.description || '',
        date: data.date || '',
        content,
        lang,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return posts;
}

export function getPostBySlug(slug: string, lang: Language): BlogPost | null {
  const filePath = path.join(contentDirectory, lang, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  return {
    slug,
    title: data.title || 'Untitled',
    description: data.description || '',
    date: data.date || '',
    content,
    lang,
  };
}

// 获取所有语言的博客 slug（用于 sitemap）
export function getAllPostSlugs(): Array<{ slug: string; lang: Language }> {
  const slugs: Array<{ slug: string; lang: Language }> = [];

  for (const lang of ['zh', 'en'] as Language[]) {
    const langDir = path.join(contentDirectory, lang);
    if (!fs.existsSync(langDir)) continue;

    const files = fs.readdirSync(langDir);
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      slugs.push({
        slug: file.replace(/\.md$/, ''),
        lang,
      });
    }
  }

  return slugs;
}