'use client';

import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Check localStorage for preferred language
    const storedLang = localStorage.getItem('voconly-lang');

    if (storedLang && (storedLang === 'zh' || storedLang === 'en')) {
      window.location.replace(`/${storedLang}/`);
      return;
    }

    // Check browser language
    const browserLang = navigator.language.toLowerCase();
    const lang = browserLang.startsWith('zh') ? 'zh' : 'en';

    // Redirect to detected language
    window.location.replace(`/${lang}/`);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}