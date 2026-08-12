import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 深色主色调
        canvas: '#0a0a0f',
        'canvas-dark': '#050508',
        'canvas-darker': '#020204',

        // 表面颜色
        surface: 'rgba(255, 255, 255, 0.03)',
        'surface-hover': 'rgba(255, 255, 255, 0.05)',
        'surface-elevated': 'rgba(255, 255, 255, 0.07)',

        // 边框颜色
        hairline: 'rgba(255, 255, 255, 0.06)',
        'hairline-hover': 'rgba(255, 255, 255, 0.1)',
        'hairline-strong': 'rgba(255, 255, 255, 0.15)',

        // 文字颜色
        ink: '#ffffff',
        body: 'rgba(255, 255, 255, 0.8)',
        mute: 'rgba(255, 255, 255, 0.5)',
        ash: 'rgba(255, 255, 255, 0.35)',

        // 强调色 - Raycast 蓝紫系
        primary: '#ffffff',
        'primary-hover': 'rgba(255, 255, 255, 0.9)',

        // 光晕颜色
        'glow-blue': 'rgba(4, 63, 150, 0.4)',
        'glow-purple': 'rgba(82, 48, 145, 0.4)',
        'glow-cyan': 'rgba(6, 182, 212, 0.3)',
        'glow-pink': 'rgba(236, 72, 153, 0.3)',

        // 功能色
        'accent-blue': '#60a5fa',
        'accent-purple': '#a78bfa',
        'accent-cyan': '#22d3ee',
        'accent-pink': '#f472b6',
        'accent-green': '#4ade80',
        'accent-yellow': '#facc15',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '10px',
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      fontSize: {
        'display-xl': ['72px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['56px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-md': ['48px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'heading-xl': ['32px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'heading-lg': ['28px', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
        'heading-md': ['24px', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'heading-sm': ['20px', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'body-lg': ['18px', { lineHeight: '1.6' }],
        'body-md': ['16px', { lineHeight: '1.6' }],
        'body-sm': ['14px', { lineHeight: '1.6' }],
        'caption': ['12px', { lineHeight: '1.5' }],
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
