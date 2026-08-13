import Script from 'next/script';

interface StructuredDataProps {
  lang: 'zh' | 'en';
  path: string;
}

export function StructuredData({ lang, path }: StructuredDataProps) {
  const baseUrl = 'https://voconly.com';
  const currentUrl = `${baseUrl}/${lang}${path}`;

  const organizationData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Voconly',
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    description: lang === 'zh'
      ? 'Voconly - AI驱动的智能语音笔记助手，支持实时语音转文字、智能摘要、多语言翻译'
      : 'Voconly - AI-powered intelligent voice note assistant with real-time speech-to-text, smart summaries, and multi-language translation',
    sameAs: [],
  };

  const websiteData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Voconly',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: lang === 'zh' ? '首页' : 'Home',
        item: `${baseUrl}/${lang}/`,
      },
    ],
  };

  // Add breadcrumb items based on path
  if (path !== '/' && path !== '') {
    const pathParts = path.split('/').filter(Boolean);
    pathParts.forEach((part, index) => {
      const itemName = part === 'about'
        ? (lang === 'zh' ? '关于我们' : 'About')
        : part === 'faq'
        ? (lang === 'zh' ? '常见问题' : 'FAQ')
        : part === 'pricing'
        ? (lang === 'zh' ? '价格' : 'Pricing')
        : part === 'blog'
        ? (lang === 'zh' ? '博客' : 'Blog')
        : part === 'feedback'
        ? (lang === 'zh' ? '用户反馈' : 'Feedback')
        : part;

      breadcrumbData.itemListElement.push({
        '@type': 'ListItem',
        position: index + 2,
        name: itemName,
        item: `${baseUrl}/${lang}/${pathParts.slice(0, index + 1).join('/')}/`,
      });
    });
  }

  return (
    <>
      <Script
        id="organization-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationData) }}
      />
      <Script
        id="website-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteData) }}
      />
      {path !== '/' && (
        <Script
          id="breadcrumb-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }}
        />
      )}
    </>
  );
}