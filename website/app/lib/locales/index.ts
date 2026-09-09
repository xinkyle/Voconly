export type Language = 'zh' | 'en';

export interface Translation {
  nav: {
    features: string;
    pricing: string;
    faq: string;
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
      speed: string;
    };
    painPoint: string;
    valuePromise: string;
    workflow: {
      step1: string;
      step2: string;
      step3: string;
      step4: string;
    };
    differentiation: {
      traditional: string;
      voconly: string;
      highlight: string;
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
    downloadCta: string;
  };
  comparison: {
    title: string;
    subtitle: string;
    items: {
      label: string;
      voconly: string;
      traditional: string;
    }[];
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
      languages: { value: string; label: string };
      accuracy: { value: string; label: string };
      platforms: { value: string; label: string };
      models: { value: string; label: string };
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
    pricing: '定价（免费）',
    faq: '常见问题',
    download: '下载更多',
    learnMore: '了解更多',
  },
  hero: {
    title: '说话，就是最自然的输入',
    subtitle: '你只管说出来，剩下的交给 AI',
    description: 'Voconly 将你的语音实时转成文字，并理解、润色、整理成可以直接使用的内容',
    downloadBtn: '免费下载',
    learnMoreBtn: '看看怎么用',
    shortcutHint: '或按下',
    platformInfo: '支持 Windows / Mac',
    badge: '本地运行，离线可用，数据安全',
    freeOpenSource: '免费开源',
    trustBadges: {
      offline: '免费开源，无限量使用',
      multiLang: '本地运行，离线可用',
      crossPlatform: '数据从不上传',
      speed: '4× 效率提升',
    },
    painPoint: '说话是本能，打字却很慢。大多数灵感，都死在这两者之间的空隙。',
    valuePromise: 'Voconly 填平了这个空隙 —— 语音进，文字出，搞定。',
    workflow: {
      step1: '自然说话',
      step2: '本地转录',
      step3: 'AI 润色',
      step4: '成品文字',
    },
    differentiation: {
      traditional: '传统工具止步于"转文字"——然后你复制、粘贴、再编辑',
      voconly: 'Voconly 把语音变成成品文字——说完就出现在光标处',
      highlight: '成品文字，不是转录稿',
    },
  },
  features: {
    title: '离线语音输入，隐私无忧',
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
      description: '本地识别速度快，边说边看文字上屏。支持中文、英文及中英文混合输入。',
    },
    privacy: {
      title: '本地语音识别，数据不上传',
      description: '会议记录、私密想法、商业机密——不会被上传到任何服务器。本地处理，比任何云端识别都安心。',
    },
    multiLang: {
      title: '说外语也行',
      description: '自动识别 99 种语言，不用切换输入法。跟外国同事开会、看外文资料，说就行。',
    },
    downloadCta: '免费下载，每天无限使用',
  },
  comparison: {
    title: '为什么选择 Voconly？',
    subtitle: '与传统语音工具的对比',
    items: [
      { label: '隐私', voconly: '语音绝不出设备', traditional: '经常上传云端' },
      { label: '限制', voconly: '无额度限制', traditional: '订阅或付费' },
      { label: '输出', voconly: '成品级文字', traditional: '原始转录稿' },
      { label: '流程', voconly: '直接出现在光标处', traditional: '复制 → 粘贴 → 编辑' },
      { label: '长时使用', voconly: '数小时保持稳定', traditional: '准确度可能下降' },
    ],
  },
  pricing: {
    title: '完全免费',
    subtitle: '开源项目，永久免费使用',
    opensource: {
      name: '免费开源',
      price: '¥0',
      description: '本地语音识别，隐私安全',
      features: ['无限次语音输入', '本地运行，隐私无忧', '智能润色、自动生成摘要', 'Windows/Mac 双平台通用', '所有未来更新免费', '开源代码，安全可信'],
      badge: '开源',
      cta: '下载更多',
      github: '查看源码',
    },
    trust: {
      whisper: '完全本地运行，声音不上传',
      platforms: 'Windows / Mac 双平台',
      opensource: '开源技术，安全可信',
    },
  },
  testimonials: {
    title: '核心优势',
    subtitle: '多种本地模型 + 量化方案，自由平衡速度与质量',
    stats: {
      languages: { value: '99+', label: '支持语言' },
      accuracy: { value: '本地', label: '隐私保护' },
      platforms: { value: '4×', label: '效率提升' },
      models: { value: '9+', label: '本地语音模型' },
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
      opensource: '开源项目，本地运行',
      changelog: '查看更新日志',
      requirements: '系统要求',
      docs: '使用文档',
    },
    shortcutHint: '安装后立即可用',
    shortcutKey: 'Command + T',
  },
  footer: {
    description: '说出来，就行了。本地语音输入，隐私无忧。',
    ctaTitle: '每天省下 30 分钟打字时间',
    ctaSubtitle: '本地运行，离线可用，数据安全',
    downloadBtn: '下载更多',
    freeInfo: 'Windows · macOS 双平台通用',
    links: {
      product: {
        title: '产品',
        items: ['功能介绍', '定价方案', '博客'],
      },
      support: {
        title: '支持',
        items: ['常见问题', '反馈建议', '联系我们'],
      },
      company: {
        title: '关于',
        items: ['关于我们', '开源项目'],
      },
    },
    copyright: '© 2026 Voconly. All rights reserved.',
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
    pricing: 'Pricing (Free)',
    faq: 'FAQ',
    download: 'More Downloads',
    learnMore: 'Learn More',
  },
  hero: {
    title: 'Speaking is the Most Natural Input',
    subtitle: 'Just speak, leave the rest to AI.',
    description: 'Voconly converts your voice to text in real-time, understanding, polishing, and organizing it into ready-to-use content.',
    downloadBtn: 'Free Download',
    learnMoreBtn: 'See How It Works',
    shortcutHint: 'or press',
    platformInfo: 'Available for Windows / Mac',
    badge: 'Local processing, offline ready, data stays private',
    freeOpenSource: 'Free & Open Source',
    trustBadges: {
      offline: 'Free & open source, unlimited use',
      multiLang: 'Local & offline ready',
      crossPlatform: 'Data never leaves your device',
      speed: '4× Efficiency Boost',
    },
    painPoint: 'Speaking is natural. Typing is slow. Most ideas die in the gap between them.',
    valuePromise: 'Voconly closes that gap — Voice in. Text out. Done.',
    workflow: {
      step1: 'Speak',
      step2: 'Local Transcription',
      step3: 'AI Polish',
      step4: 'Finished Text',
    },
    differentiation: {
      traditional: 'Traditional tools stop at "transcription" — then you copy, paste, and edit',
      voconly: 'Voconly turns speech into finished writing — appears right at your cursor',
      highlight: 'Finished writing, not raw transcript',
    },
  },
  features: {
    title: 'Offline Voice Input, Privacy First',
    subtitle: 'Not replacing the keyboard, but making input easier',
    scenarios: {
      title: 'Scenario Shortcuts',
      description: 'Configure dedicated shortcuts for different scenarios: light polish, professional polish, meeting summary, translation... One-tap access, speak and get.',
    },
    shortcut: {
      title: 'No Window Switching',
      description: 'One tap to speak, double-tap for instant transcription. Works in Word, WeChat, VS Code... anywhere without breaking your flow.',
    },
    smart: {
      title: 'Auto-organize into Drafts',
      description: 'Supports online or offline LLMs. Auto-polish, segment, and summarize. Casual speech becomes professional text — privacy and intelligence combined.',
    },
    realtime: {
      title: 'Real-time Transcription',
      description: 'Fast local recognition, text appears as you speak. Supports Chinese, English, and Chinese-English mixed input.',
    },
    privacy: {
      title: 'Local Voice Recognition, Data Never Uploads',
      description: 'Meeting notes, private journals, business secrets — never uploaded to any server. Local processing, safer than any cloud recognition.',
    },
    multiLang: {
      title: 'Speak Foreign Languages Too',
      description: 'Auto-detects 99+ languages and dialects. No need to switch input methods. Perfect for meetings with foreign colleagues or reading foreign materials.',
    },
    downloadCta: 'Free Download, Unlimited Daily Use',
  },
  comparison: {
    title: 'Why Choose Voconly?',
    subtitle: 'Compared to traditional voice tools',
    items: [
      { label: 'Privacy', voconly: 'Audio never leaves your device', traditional: 'Often uploaded to cloud' },
      { label: 'Limits', voconly: 'No quotas, unlimited', traditional: 'Subscriptions or fees' },
      { label: 'Output', voconly: 'Finished, polished text', traditional: 'Raw transcript' },
      { label: 'Workflow', voconly: 'Appears at your cursor', traditional: 'Copy → Paste → Edit' },
      { label: 'Long sessions', voconly: 'Stable for hours', traditional: 'Accuracy may degrade' },
    ],
  },
  pricing: {
    title: 'Completely Free',
    subtitle: 'Open source project, free forever',
    opensource: {
      name: 'Free & Open Source',
      price: '$0',
      description: 'Local voice recognition, privacy safe',
      features: ['Unlimited voice inputs', 'Local processing, zero privacy risk', 'Smart polish & auto summary', 'Dual-platform: Windows/Mac', 'All future updates free', 'Open source, trusted & secure'],
      badge: 'Open Source',
      cta: 'More Downloads',
      github: 'View Source',
    },
    trust: {
      whisper: 'Runs entirely locally, audio never uploads',
      platforms: 'Windows / Mac dual platform',
      opensource: 'Open source tech, trusted & secure',
    },
  },
  testimonials: {
    title: 'Key Advantages',
    subtitle: 'Multiple local models + quantization options, balance speed and quality freely',
    stats: {
      languages: { value: '99+', label: 'Languages' },
      accuracy: { value: 'Local', label: 'Privacy' },
      platforms: { value: '4×', label: 'Efficiency' },
      models: { value: '9+', label: 'Voice Models' },
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
      opensource: 'Open source, runs locally',
      changelog: 'Changelog',
      requirements: 'System Requirements',
      docs: 'Documentation',
    },
    shortcutHint: 'Ready to use after install',
    shortcutKey: 'Command + T',
  },
  footer: {
    description: 'Just speak, and it\'s done. Local voice input, privacy first.',
    ctaTitle: 'Save 30 minutes of typing every day',
    ctaSubtitle: 'Local processing, offline ready, data safe',
    downloadBtn: 'More Downloads',
    freeInfo: 'Windows · macOS dual platform',
    links: {
      product: {
        title: 'Product',
        items: ['Features', 'Pricing', 'Blog'],
      },
      support: {
        title: 'Support',
        items: ['FAQ', 'Feedback', 'Contact'],
      },
      company: {
        title: 'About',
        items: ['About Us', 'Open Source'],
      },
    },
    copyright: '© 2026 Voconly. All rights reserved.',
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
  | 'nav.faq'
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
  | 'hero.trustBadges.speed'
  | 'hero.painPoint'
  | 'hero.valuePromise'
  | 'hero.workflow.step1'
  | 'hero.workflow.step2'
  | 'hero.workflow.step3'
  | 'hero.workflow.step4'
  | 'hero.differentiation.traditional'
  | 'hero.differentiation.voconly'
  | 'hero.differentiation.highlight'
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
  | 'features.downloadCta'
  | 'comparison.title'
  | 'comparison.subtitle'
  | 'comparison.items'
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
  | 'testimonials.stats.languages.value'
  | 'testimonials.stats.languages.label'
  | 'testimonials.stats.accuracy.value'
  | 'testimonials.stats.accuracy.label'
  | 'testimonials.stats.platforms.value'
  | 'testimonials.stats.platforms.label'
  | 'testimonials.stats.models.value'
  | 'testimonials.stats.models.label'
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