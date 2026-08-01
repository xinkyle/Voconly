'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Github, Box, Palette, MessageSquare, FileText, Zap, CreditCard, Layers } from 'lucide-react';

// 扩展展示数据
const extensions = [
  { name: 'GitHub', icon: Github, color: '#6b7280', description: 'Search repositories, issues, and PRs', installs: '41k' },
  { name: 'Linear', icon: Box, color: '#5e6ad2', description: 'Manage your Linear issues and projects', installs: '49k' },
  { name: 'Figma', icon: Palette, color: '#a259ff', description: 'Quick access to your Figma files', installs: '41k' },
  { name: 'Slack', icon: MessageSquare, color: '#4a154b', description: 'Send messages and search channels', installs: '25k' },
  { name: 'Notion', icon: FileText, color: '#ffffff', description: 'Search and create Notion pages', installs: '32k' },
  { name: 'Vercel', icon: Zap, color: '#ffffff', description: 'Deploy and manage your projects', installs: '23k' },
  { name: 'Stripe', icon: CreditCard, color: '#635bff', description: 'Check payments and subscriptions', installs: '54k' },
  { name: 'Jira', icon: Layers, color: '#0052cc', description: 'Manage your Jira tickets', installs: '15k' },
];

// 扩展卡片组件
function ExtensionCard({ extension, index }: { extension: typeof extensions[0]; index: number }) {
  const Icon = extension.icon;

  return (
    <motion.div
      initial={{ opacity: 1, y: 0 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="extension-card group cursor-pointer"
    >
      <div className="p-4">
        {/* 图标和标题行 */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${extension.color}20` }}
          >
            <Icon className="w-6 h-6" style={{ color: extension.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-body-md font-semibold text-white group-hover:text-white/90 transition-colors">
              {extension.name}
            </h3>
            <p className="text-caption text-white/40 line-clamp-2">
              {extension.description}
            </p>
          </div>
        </div>

        {/* 底部信息 */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <span className="text-caption text-white/30">{extension.installs} installs</span>
          <div className="flex items-center gap-1 text-caption text-white/50 group-hover:text-white/70 transition-colors">
            <span>Install</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// 命令面板展示
function CommandPalette() {
  return (
    <motion.div
      initial={{ opacity: 1, scale: 1 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="glass-card rounded-2xl overflow-hidden max-w-3xl mx-auto"
    >
      {/* 顶部搜索栏 */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <span className="text-white/60 text-sm">⌘</span>
          </div>
          <span className="text-body-md text-white/40">Search for apps and commands...</span>
        </div>
      </div>

      {/* 命令列表 */}
      <div className="p-2">
        {[
          { name: 'Open GitHub', icon: Github, shortcut: 'GH' },
          { name: 'Search Linear Issues', icon: Box, shortcut: 'LI' },
          { name: 'Open Figma File', icon: Palette, shortcut: 'FF' },
          { name: 'Send Slack Message', icon: MessageSquare, shortcut: 'SM' },
        ].map((cmd, index) => (
          <div
            key={cmd.name}
            className={`flex items-center gap-3 p-3 rounded-xl ${index === 0 ? 'bg-white/10' : 'hover:bg-white/5'} transition-colors cursor-pointer`}
          >
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <cmd.icon className="w-4 h-4 text-white/70" />
            </div>
            <span className="flex-1 text-body-sm text-white/80">{cmd.name}</span>
            <span className="keyboard-key keyboard-key-sm">{cmd.shortcut}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Extensions() {
  return (
    <section className="relative py-32 overflow-hidden" style={{ background: '#05081a' }}>
      {/* 背景光晕 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 right-0 w-[800px] h-[500px]"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 100% 0%, rgba(82, 48, 145, 0.25), transparent 60%)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[600px] h-[400px]"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 0% 100%, rgba(4, 63, 150, 0.2), transparent 60%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12">
        {/* 标题区域 */}
        <div className="text-center mb-16">
          <h2 className="text-display-md font-bold text-white mb-4">
            There&apos;s an extension for that.
          </h2>
          <p className="text-body-lg text-white/50 max-w-2xl mx-auto mb-8">
            Extend Raycast with thousands of extensions built by the community. From productivity tools to developer utilities, find what you need.
          </p>
          <a href="#" className="inline-flex items-center gap-2 text-body-md text-white/70 hover:text-white transition-colors group">
            Browse the Store
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>

        {/* 命令面板展示 */}
        <div className="mb-20">
          <CommandPalette />
        </div>

        {/* 扩展卡片网格 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {extensions.map((extension, index) => (
            <ExtensionCard key={extension.name} extension={extension} index={index} />
          ))}
        </div>

        {/* 底部 CTA */}
        <div className="text-center mt-12">
          <span className="text-body-sm text-white/40">
            and 1,500+ more extensions
          </span>
        </div>
      </div>
    </section>
  );
}
