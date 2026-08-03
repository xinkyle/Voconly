export type Language = 'zh' | 'en';

export interface Translation {
  nav: {
    features: string;
    pricing: string;
    download: string;
    learnMore: string;
  };
  hero: {
    title: string;
    subtitle: string;
    description: string;
    downloadBtn: string;
    learnMoreBtn: string;
    shortcutHint: string;
    platformInfo: string;
    badge: string;
    freeOpenSource: string;
    trustBadges: {
      offline: string;
      multiLang: string;
      crossPlatform: string;
    };
  };
  features: {
    title: string;
    subtitle: string;
    scenarios: {
      title: string;
      description: string;
    };
    shortcut: {
      title: string;
      description: string;
    };
    smart: {
      title: string;
      description: string;
    };
    realtime: {
      title: string;
      description: string;
    };
    privacy: {
      title: string;
      description: string;
    };
    multiLang: {
      title: string;
      description: string;
    };
  };
  pricing: {
    title: string;
    subtitle: string;
    opensource: {
      name: string;
      price: string;
      description: string;
      features: string[];
      badge: string;
      cta: string;
      github: string;
    };
    trust: {
      whisper: string;
      platforms: string;
      opensource: string;
    };
  };
  testimonials: {
    title: string;
    subtitle: string;
    stats: {
      users: { value: string; label: string };
      languages: { value: string; label: string };
      accuracy: { value: string; label: string };
      platforms: { value: string; label: string };
    };
  };
  download: {
    title: string;
    subtitle: string;
    windows: {
      name: string;
      available: string;
      comingSoon: string;
    };
    mac: {
      name: string;
      available: string;
      comingSoon: string;
    };
    linux: {
      name: string;
      available: string;
      comingSoon: string;
    };
    info: {
      opensource: string;
      changelog: string;
      requirements: string;
      docs: string;
    };
    shortcutHint: string;
    shortcutKey: string;
  };
  footer: {
    description: string;
    ctaTitle: string;
    ctaSubtitle: string;
    downloadBtn: string;
    freeInfo: string;
    links: {
      product: { title: string; items: string[] };
      support: { title: string; items: string[] };
      company: { title: string; items: string[] };
    };
    copyright: string;
    legal: {
      privacy: string;
      terms: string;
    };
  };
}

// 中文翻译
export const zh: Translation = {
  nav: {
    features: '功能',
    pricing: '定价',
    download: '下载',
    learnMore: '了解更多',
  },
  hero: {
    title: '说出来，就行了',
    subtitle: '不用联网，无需切换窗口，在任何应用中直接语音输入',
    description: '写文档手指累？开会腾不出手？Voconly 让你按一下快捷键就能语音输入。更棒的是——可为不同场景配置不同快捷键：简单润色、专业改写、会议总结、翻译……双击直出结果，效率翻倍。本地运行，隐私无忧。',
    downloadBtn: '免费下载',
    learnMoreBtn: '看看怎么用',
    shortcutHint: '或按下',
    platformInfo: '支持 Windows / Mac / Linux',
    badge: '1,000+ 用户每天省下 30 分钟打字时间',
    freeOpenSource: '免费开源',
    trustBadges: {
      offline: '断网也能用',
      multiLang: '说中文/英文都行',
      crossPlatform: '三平台',
    },
  },
  features: {
    title: '解决这些烦恼',
    subtitle: '不是替代键盘，而是让输入更轻松',
    scenarios: {
      title: '多场景快捷键',
      description: '为不同场景配置专属快捷键：简单润色、专业润色、会议总结、翻译……一键直达，随说随得。',
    },
    shortcut: {
      title: '不用切换窗口',
      description: '按一下说话，双击直出转录结果。Word、微信、VS Code……在哪都能用，不打断思路。',
    },
    smart: {
      title: '自动整理成稿',
      description: '支持在线或离线大模型，自动润色、分段、生成摘要。口语秒变正式文稿，隐私与智能兼得。',
    },
    realtime: {
      title: '说完就出字',
      description: '本地识别速度快，边说边看文字上屏。支持中文、英文、甚至中英夹杂。',
    },
    privacy: {
      title: '你的声音留在本地',
      description: '会议记录、私密想法、商业机密——不会被上传到任何服务器。本地处理，比任何云端识别都安心。',
    },
    multiLang: {
      title: '说外语也行',
      description: '自动识别 99 种语言，不用切换输入法。跟外国同事开会、看外文资料，说就行。',
    },
  },
  pricing: {
    title: '完全免费',
    subtitle: '开源项目，永久免费使用',
    opensource: {
      name: '免费开源',
      price: '¥0',
      description: '基于 Whisper.cpp 和 Tauri 构建的开源语音输入工具',
      features: ['无限次语音输入', '本地运行，隐私无忧', '智能润色、自动生成摘要', 'Windows/Mac/Linux 三平台通用', '所有未来更新免费', '开源代码，安全可信'],
      badge: '开源',
      cta: '立即下载',
      github: '查看源码',
    },
    trust: {
      whisper: '完全本地运行，声音不上传',
      platforms: 'Windows / Mac / Linux 三平台',
      opensource: '开源技术，安全可信',
    },
  },
  testimonials: {
    title: '1,000+ 用户正在用',
    subtitle: '内容创作者、程序员、会议记录员每天都在省时间',
    stats: {
      users: { value: '1K+', label: '活跃用户' },
      languages: { value: '99+', label: '支持语言' },
      accuracy: { value: '本地', label: '隐私保护' },
      platforms: { value: '3', label: '跨平台' },
    },
  },
  download: {
    title: '开始使用',
    subtitle: '免费下载 Voconly，体验全新的语音输入方式',
    windows: {
      name: 'Windows',
      available: '下载',
      comingSoon: '即将推出',
    },
    mac: {
      name: 'macOS',
      available: '下载',
      comingSoon: '即将推出',
    },
    linux: {
      name: 'Linux',
      available: '下载',
      comingSoon: '即将推出',
    },
    info: {
      opensource: '开源项目，基于 Whisper.cpp 和 Tauri 构建',
      changelog: '查看更新日志',
      requirements: '系统要求',
      docs: '使用文档',
    },
    shortcutHint: '安装后立即可用',
    shortcutKey: 'Command + T',
  },
  footer: {
    description: '说出来，就行了。本地语音输入，隐私无忧，三平台通用。',
    ctaTitle: '每天省下 30 分钟打字时间',
    ctaSubtitle: '已有 1,000+ 用户在使用，免费版无需注册，下载即用',
    downloadBtn: '立即下载 Voconly',
    freeInfo: 'Windows · macOS · Linux 三平台通用',
    links: {
      product: {
        title: '产品',
        items: ['功能介绍', '定价方案', '更新日志', '路线图'],
      },
      support: {
        title: '支持',
        items: ['使用文档', '常见问题', '反馈建议', '联系我们'],
      },
      company: {
        title: '关于',
        items: ['关于我们', '开源项目', '隐私政策', '服务条款'],
      },
    },
    copyright: '© 2024 Voconly. All rights reserved.',
    legal: {
      privacy: '隐私政策',
      terms: '服务条款',
    },
  },
};

// 英文翻译
export const en: Translation = {
  nav: {
    features: 'Features',
    pricing: 'Pricing',
    download: 'Download',
    learnMore: 'Learn More',
  },
  hero: {
    title: 'Voice Input, Hands Free',
    subtitle: 'Offline Whisper Recognition × Global Shortcut × LLM Smart Processing',
    description: 'Tired of typing? In a meeting with no free hands? Voconly lets you voice input with a shortcut. Even better — configure different shortcuts for different scenarios: light polish, professional rewrite, meeting summary, translation... Double-tap for instant results. Local processing, zero privacy risk.',
    downloadBtn: 'Download Voconly',
    learnMoreBtn: 'Learn More',
    shortcutHint: 'or press',
    platformInfo: 'Available for Windows / Mac / Linux',
    badge: '1,000+ users save 30 minutes of typing every day',
    freeOpenSource: 'Free & Open Source',
    trustBadges: {
      offline: 'Local Run',
      multiLang: 'Multi-Language',
      crossPlatform: 'Cross-Platform',
    },
  },
  features: {
    title: 'Core Features',
    subtitle: 'Privacy-focused, high-quality speech recognition without internet',
    scenarios: {
      title: 'Scenario Shortcuts',
      description: 'Configure shortcuts for different scenarios: light polish, professional polish, meeting summary, translation... One-tap access to what you need.',
    },
    shortcut: {
      title: 'Global Shortcut',
      description: 'One tap to speak, double-tap for instant transcription. Works in Word, WeChat, VS Code... anywhere without breaking your flow.',
    },
    smart: {
      title: 'Smart Post-processing',
      description: 'Supports online or offline LLMs. Auto-polish, format, and summarize. Casual speech becomes professional text — configure API and go.',
    },
    realtime: {
      title: 'Real-time Transcription',
      description: 'Instant text output after recording ends. Supports streaming display - see recognition results as you speak.',
    },
    privacy: {
      title: 'Zero Privacy Risk',
      description: 'Meeting notes, private journals, business secrets - speak freely. All data processed locally, zero cloud exposure.',
    },
    multiLang: {
      title: 'Multi-language Support',
      description: 'Auto-detects Chinese, English, Japanese, Korean and 10+ other languages. No need to switch input methods.',
    },
  },
  pricing: {
    title: 'Free & Open Source',
    subtitle: 'Built with Whisper.cpp and Tauri, free forever',
    opensource: {
      name: 'Free & Open Source',
      price: '$0',
      description: 'Open source voice input tool based on Whisper.cpp and Tauri',
      features: ['Unlimited voice inputs', 'Local processing, zero privacy risk', 'Smart polish & auto summary', 'Cross-platform: Windows/Mac/Linux', 'All future updates free', 'Open source, trusted & secure'],
      badge: 'Open Source',
      cta: 'Download Now',
      github: 'View Source',
    },
    trust: {
      whisper: 'Local Whisper model, zero privacy risk',
      platforms: 'Supports Windows / Mac / Linux',
      opensource: 'Open source tech, trusted & secure',
    },
  },
  testimonials: {
    title: 'Built for Professionals',
    subtitle: 'Developers, content creators, multilingual workers love it',
    stats: {
      users: { value: '10+', label: 'Languages' },
      languages: { value: '99%', label: 'Offline' },
      accuracy: { value: 'Local', label: 'Privacy' },
      platforms: { value: '3', label: 'Platforms' },
    },
  },
  download: {
    title: 'Get Started',
    subtitle: 'Download Voconly for free and experience a new way of voice input',
    windows: {
      name: 'Windows',
      available: 'Download',
      comingSoon: 'Coming Soon',
    },
    mac: {
      name: 'macOS',
      available: 'Download',
      comingSoon: 'Coming Soon',
    },
    linux: {
      name: 'Linux',
      available: 'Download',
      comingSoon: 'Coming Soon',
    },
    info: {
      opensource: 'Open source project, built with Whisper.cpp and Tauri',
      changelog: 'Changelog',
      requirements: 'System Requirements',
      docs: 'Documentation',
    },
    shortcutHint: 'Ready to use after install',
    shortcutKey: 'Command + T',
  },
  footer: {
    description: 'Desktop voice input tool with offline Whisper recognition. Privacy-first, hands-free in any app.',
    ctaTitle: 'Try It Now',
    ctaSubtitle: 'Start free, 50 inputs per day - try before you buy',
    downloadBtn: 'Download Voconly',
    freeInfo: 'Free version forever',
    links: {
      product: {
        title: 'Product',
        items: ['Features', 'Pricing', 'Changelog', 'Roadmap'],
      },
      support: {
        title: 'Support',
        items: ['Documentation', 'FAQ', 'Feedback', 'Contact'],
      },
      company: {
        title: 'About',
        items: ['About Us', 'Open Source', 'Privacy Policy', 'Terms of Service'],
      },
    },
    copyright: '© 2024 Voconly. All rights reserved.',
    legal: {
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
    },
  },
};

export const translations: Record<Language, Translation> = { zh, en };

// 类型安全的翻译 key
export type TranslationKey =
  | 'nav.features'
  | 'nav.pricing'
  | 'nav.download'
  | 'nav.learnMore'
  | 'hero.title'
  | 'hero.subtitle'
  | 'hero.description'
  | 'hero.downloadBtn'
  | 'hero.learnMoreBtn'
  | 'hero.shortcutHint'
  | 'hero.platformInfo'
  | 'hero.badge'
  | 'hero.freeOpenSource'
  | 'hero.trustBadges.offline'
  | 'hero.trustBadges.multiLang'
  | 'hero.trustBadges.crossPlatform'
  | 'features.title'
  | 'features.subtitle'
  | 'features.scenarios.title'
  | 'features.scenarios.description'
  | 'features.shortcut.title'
  | 'features.shortcut.description'
  | 'features.smart.title'
  | 'features.smart.description'
  | 'features.realtime.title'
  | 'features.realtime.description'
  | 'features.privacy.title'
  | 'features.privacy.description'
  | 'features.multiLang.title'
  | 'features.multiLang.description'
  | 'pricing.title'
  | 'pricing.subtitle'
  | 'pricing.opensource.name'
  | 'pricing.opensource.price'
  | 'pricing.opensource.description'
  | 'pricing.opensource.features'
  | 'pricing.opensource.badge'
  | 'pricing.opensource.cta'
  | 'pricing.opensource.github'
  | 'pricing.trust.whisper'
  | 'pricing.trust.platforms'
  | 'pricing.trust.opensource'
  | 'testimonials.title'
  | 'testimonials.subtitle'
  | 'testimonials.stats.users.value'
  | 'testimonials.stats.users.label'
  | 'testimonials.stats.languages.value'
  | 'testimonials.stats.languages.label'
  | 'testimonials.stats.accuracy.value'
  | 'testimonials.stats.accuracy.label'
  | 'testimonials.stats.platforms.value'
  | 'testimonials.stats.platforms.label'
  | 'download.title'
  | 'download.subtitle'
  | 'download.windows.name'
  | 'download.windows.available'
  | 'download.windows.comingSoon'
  | 'download.mac.name'
  | 'download.mac.available'
  | 'download.mac.comingSoon'
  | 'download.linux.name'
  | 'download.linux.available'
  | 'download.linux.comingSoon'
  | 'download.info.opensource'
  | 'download.info.changelog'
  | 'download.info.requirements'
  | 'download.info.docs'
  | 'download.shortcutHint'
  | 'download.shortcutKey'
  | 'footer.description'
  | 'footer.ctaTitle'
  | 'footer.ctaSubtitle'
  | 'footer.downloadBtn'
  | 'footer.freeInfo'
  | 'footer.links.product.title'
  | 'footer.links.product.items'
  | 'footer.links.support.title'
  | 'footer.links.support.items'
  | 'footer.links.company.title'
  | 'footer.links.company.items'
  | 'footer.copyright'
  | 'footer.legal.privacy'
  | 'footer.legal.terms';