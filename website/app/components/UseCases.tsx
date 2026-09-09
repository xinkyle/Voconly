'use client';

import { motion } from 'framer-motion';
import { Code, PenTool, Users, GraduationCap, Briefcase, MessageSquare } from 'lucide-react';
import { useI18n } from '../lib/i18n-context';
import { useState } from 'react';

export default function UseCases() {
  const { lang } = useI18n();
  const [activeRole, setActiveRole] = useState(0);

  const roles = [
    {
      icon: Code,
      title: lang === 'zh' ? '工程师' : 'Developer',
      color: 'from-blue-500 to-cyan-500',
      scenarios: [
        {
          title: lang === 'zh' ? '写代码注释' : 'Code Comments',
          example: lang === 'zh' ? '"这个函数处理用户认证逻辑，包含密码加密和验证"' : '"This function handles user authentication logic, including password encryption and verification"',
          note: lang === 'zh' ? 'VS Code、Cursor 中直接生成' : 'Generate directly in VS Code, Cursor',
        },
        {
          title: lang === 'zh' ? '解释报错' : 'Explain Errors',
          example: lang === 'zh' ? '"TypeError: Cannot read properties of undefined..."' : '"TypeError: Cannot read properties of undefined..."',
          note: lang === 'zh' ? 'AI 自动分析问题原因' : 'AI automatically analyzes the cause',
        },
      ],
    },
    {
      icon: PenTool,
      title: lang === 'zh' ? '写作者' : 'Writer',
      color: 'from-purple-500 to-pink-500',
      scenarios: [
        {
          title: lang === 'zh' ? '长文档创作' : 'Long-form Writing',
          example: lang === 'zh' ? '"今天的主题是关于人工智能如何改变我们的工作方式..."' : '"Today\'s topic is about how AI is changing the way we work..."',
          note: lang === 'zh' ? 'Word、Notion 中持续口述' : 'Dictate continuously in Word, Notion',
        },
        {
          title: lang === 'zh' ? '文章润色' : 'Polish Articles',
          example: lang === 'zh' ? '"把这个观点表达得更专业一些"' : '"Make this point sound more professional"',
          note: lang === 'zh' ? '一键润色成成品文字' : 'One-click polish to finished text',
        },
      ],
    },
    {
      icon: Users,
      title: lang === 'zh' ? '创业团队' : 'Startup Team',
      color: 'from-orange-500 to-red-500',
      scenarios: [
        {
          title: lang === 'zh' ? '会议纪要' : 'Meeting Minutes',
          example: lang === 'zh' ? '"讨论了产品路线图，下周要完成 MVP..."' : '"Discussed product roadmap, need to finish MVP next week..."',
          note: lang === 'zh' ? '自动整理成结构化纪要' : 'Auto-organize into structured minutes',
        },
        {
          title: lang === 'zh' ? '团队沟通' : 'Team Communication',
          example: lang === 'zh' ? '"项目进度更新：前端完成 80%，后端还在调试"' : '"Project update: Frontend 80% done, backend still debugging"',
          note: lang === 'zh' ? 'Slack、飞书中快速发送' : 'Quick send in Slack, Feishu',
        },
      ],
    },
    {
      icon: GraduationCap,
      title: lang === 'zh' ? '学生' : 'Student',
      color: 'from-green-500 to-teal-500',
      scenarios: [
        {
          title: lang === 'zh' ? '课堂笔记' : 'Lecture Notes',
          example: lang === 'zh' ? '"教授讲了三个重点：历史背景、核心理论、应用案例..."' : '"Professor covered three key points: historical background, core theory, applications..."',
          note: lang === 'zh' ? '边听边记，不遗漏重点' : 'Listen and record, never miss key points',
        },
        {
          title: lang === 'zh' ? '论文大纲' : 'Paper Outline',
          example: lang === 'zh' ? '"引言部分要介绍研究背景，第一章讲理论框架..."' : '"Introduction should cover research background, Chapter 1 covers theoretical framework..."',
          note: lang === 'zh' ? '快速构建论文结构' : 'Quickly build paper structure',
        },
      ],
    },
  ];

  const Icon = roles[activeRole].icon;

  return (
    <section className="relative py-20 overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
      {/* 背景 */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0, 212, 170, 0.15), transparent 70%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-4xl sm:text-5xl text-white mb-4">
            <span className="text-white">{lang === 'zh' ? '一个快捷键，' : 'One Shortcut,'}</span>{' '}
            <span className="text-[var(--color-accent)]">
              {lang === 'zh' ? '每个人各得其用' : 'Everyone Gets Their Use'}
            </span>
          </h2>
          <p className="font-body text-lg text-white/50 max-w-xl mx-auto">
            {lang === 'zh' ? '选择你的角色，看看 Voconly 如何融入你的工作流' : 'Choose your role, see how Voconly fits into your workflow'}
          </p>
        </motion.div>

        {/* 角色选择按钮 */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {roles.map((role, index) => {
            const RoleIcon = role.icon;
            return (
              <button
                key={index}
                onClick={() => setActiveRole(index)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-body text-sm transition-all ${
                  activeRole === index
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg-primary)]'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-white/10'
                }`}
              >
                <RoleIcon className="w-4 h-4" />
                <span>{role.title}</span>
              </button>
            );
          })}
        </div>

        {/* 场景展示 */}
        <div className="grid md:grid-cols-2 gap-4">
          {roles[activeRole].scenarios.map((scenario, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="p-6 rounded-xl border border-white/10 bg-white/5 hover:border-[var(--color-accent)]/30 transition-all duration-300"
            >
              <h4 className="font-display text-lg text-white mb-3 flex items-center gap-2">
                <span className="text-[var(--color-accent)]">●</span>
                {scenario.title}
              </h4>
              <div className="font-body text-sm text-white/60 leading-relaxed mb-4 p-3 rounded bg-white/5 border border-white/5">
                {scenario.example}
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--color-accent)] font-body">
                <Icon className="w-3 h-3" />
                {scenario.note}
              </div>
            </motion.div>
          ))}
        </div>

        {/* 底部提示 */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 text-center"
        >
          <p className="font-body text-sm text-white/40">
            {lang === 'zh'
              ? '按下 Fn 键，开口说话，结果即刻呈现'
              : 'Press Fn key, start speaking, see results instantly'}
          </p>
        </motion.div>
      </div>
    </section>
  );
}