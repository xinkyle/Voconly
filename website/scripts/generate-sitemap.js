import fs from 'fs';
import path from 'path';

const baseUrl = 'https://voconly.com';
const contentDir = path.join(process.cwd(), 'content/blog');

// 博客文章slug列表
function getBlogSlugs(lang) {
  const langDir = path.join(contentDir, lang);
  if (!fs.existsSync(langDir)) return [];
  return fs.readdirSync(langDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

// 生成sitemap.xml
function generateSitemap() {
  const zhSlugs = getBlogSlugs('zh');
  const enSlugs = getBlogSlugs('en');

  const urls = [];

  // 首页
  urls.push({
    loc: `${baseUrl}/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/` },
      { hreflang: 'en', href: `${baseUrl}/en/` },
      { hreflang: 'x-default', href: `${baseUrl}/` },
    ],
    priority: '1.0',
  });

  // 中文首页
  urls.push({
    loc: `${baseUrl}/zh/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/` },
      { hreflang: 'en', href: `${baseUrl}/en/` },
      { hreflang: 'x-default', href: `${baseUrl}/` },
    ],
    priority: '1.0',
  });

  // 英文首页
  urls.push({
    loc: `${baseUrl}/en/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/` },
      { hreflang: 'en', href: `${baseUrl}/en/` },
      { hreflang: 'x-default', href: `${baseUrl}/` },
    ],
    priority: '1.0',
  });

  // 博客列表页
  urls.push({
    loc: `${baseUrl}/zh/blog/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/blog/` },
      { hreflang: 'en', href: `${baseUrl}/en/blog/` },
    ],
    priority: '0.8',
  });

  urls.push({
    loc: `${baseUrl}/en/blog/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/blog/` },
      { hreflang: 'en', href: `${baseUrl}/en/blog/` },
    ],
    priority: '0.8',
  });

  // 博客文章 - 使用两个语言的交集（两边都有的文章才生成hreflang）
  const commonSlugs = zhSlugs.filter(slug => enSlugs.includes(slug));

  for (const slug of commonSlugs) {
    // 中文版
    urls.push({
      loc: `${baseUrl}/zh/blog/${slug}/`,
      hreflangs: [
        { hreflang: 'zh-CN', href: `${baseUrl}/zh/blog/${slug}/` },
        { hreflang: 'en', href: `${baseUrl}/en/blog/${slug}/` },
      ],
      priority: '0.7',
    });

    // 英文版
    urls.push({
      loc: `${baseUrl}/en/blog/${slug}/`,
      hreflangs: [
        { hreflang: 'zh-CN', href: `${baseUrl}/zh/blog/${slug}/` },
        { hreflang: 'en', href: `${baseUrl}/en/blog/${slug}/` },
      ],
      priority: '0.7',
    });
  }

  // FAQ页面
  urls.push({
    loc: `${baseUrl}/zh/faq/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/faq/` },
      { hreflang: 'en', href: `${baseUrl}/en/faq/` },
    ],
    priority: '0.6',
  });

  urls.push({
    loc: `${baseUrl}/en/faq/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/faq/` },
      { hreflang: 'en', href: `${baseUrl}/en/faq/` },
    ],
    priority: '0.6',
  });

  // About页面
  urls.push({
    loc: `${baseUrl}/zh/about/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/about/` },
      { hreflang: 'en', href: `${baseUrl}/en/about/` },
    ],
    priority: '0.5',
  });

  urls.push({
    loc: `${baseUrl}/en/about/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/about/` },
      { hreflang: 'en', href: `${baseUrl}/en/about/` },
    ],
    priority: '0.5',
  });

  // Feedback页面
  urls.push({
    loc: `${baseUrl}/zh/feedback/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/feedback/` },
      { hreflang: 'en', href: `${baseUrl}/en/feedback/` },
    ],
    priority: '0.4',
  });

  urls.push({
    loc: `${baseUrl}/en/feedback/`,
    hreflangs: [
      { hreflang: 'zh-CN', href: `${baseUrl}/zh/feedback/` },
      { hreflang: 'en', href: `${baseUrl}/en/feedback/` },
    ],
    priority: '0.4',
  });

  // 生成XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;

  for (const url of urls) {
    xml += `  <url>
    <loc>${url.loc}</loc>
`;

    // 添加hreflang标签
    if (url.hreflangs) {
      for (const hl of url.hreflangs) {
        xml += `    <xhtml:link rel="alternate" hreflang="${hl.hreflang}" href="${hl.href}"/>
`;
      }
    }

    xml += `    <changefreq>weekly</changefreq>
    <priority>${url.priority}</priority>
  </url>
`;
  }

  xml += `</urlset>
`;

  // 写入文件
  const outputPath = path.join(process.cwd(), 'public/sitemap.xml');
  fs.writeFileSync(outputPath, xml);
  console.log('sitemap.xml generated successfully!');
}

generateSitemap();