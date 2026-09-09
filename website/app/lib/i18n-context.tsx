'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, type Language, type Translation, type TranslationKey } from './locales';

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  get: <T>(key: string) => T;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'voconly-lang';

interface I18nProviderProps {
  children: ReactNode;
  initialLang?: Language;
}

export function I18nProvider({ children, initialLang = 'zh' }: I18nProviderProps) {
  const [lang, setLangState] = useState<Language>(initialLang);

  useEffect(() => {
    // 只有当 initialLang 是默认值时才读取 localStorage
    // 如果 URL 明确指定了语言（/zh/ 或 /en/），则使用 URL 指定的语言
    const urlLang = window.location.pathname.split('/')[1] as Language;
    const isUrlLangValid = urlLang === 'zh' || urlLang === 'en';

    if (isUrlLangValid) {
      // URL 指定了语言，使用 URL 的语言并保存到 localStorage
      setLangState(urlLang);
      localStorage.setItem(STORAGE_KEY, urlLang);
    } else {
      // URL 没有指定语言（如根路径 /），才读取 localStorage
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored && (stored === 'zh' || stored === 'en')) {
        setLangState(stored);
      }
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  };

  const t = (key: TranslationKey): string => {
    const keys = key.split('.');
    let value: unknown = translations[lang];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }

    return typeof value === 'string' ? value : key;
  };

  const get = <T,>(key: string): T => {
    const keys = key.split('.');
    let value: unknown = translations[lang];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key as unknown as T;
      }
    }

    return value as T;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t, get }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}