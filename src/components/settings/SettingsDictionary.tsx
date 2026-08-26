import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getUserDictionary,
  saveUserDictionary,
} from '../../services/dictionary';
import { createLogger } from '../../services/log';
import { useToast } from '../ui/Toast';

// 创建日志记录器
const log = createLogger('SettingsDictionary');

// 默认阈值
const DEFAULT_THRESHOLD = 0.13;
// 每行显示的词语数量
const WORDS_PER_LINE = 12;

export default function SettingsDictionary() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [wordsText, setWordsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载词典配置
  useEffect(() => {
    loadDictionary();
  }, []);

  const loadDictionary = async () => {
    setLoading(true);
    try {
      const result = await getUserDictionary();
      setEnabled(result.enabled);
      // 从 entries 格式化为固定列数显示
      const allEntries: { word: string }[] = [];
      for (const entry of result.entries) {
        allEntries.push({ word: entry.word });
        if (entry.aliases && entry.aliases.length > 0) {
          allEntries.push(...entry.aliases.map(a => ({ word: a })));
        }
      }
      setWordsText(formatWordsForDisplay(allEntries));
      log.debug(`Loaded dictionary: ${result.entries.length} entries, ${allEntries.length} total words`);
    } catch (err) {
      log.error(`Failed to load dictionary: ${err}`);
      setError(t('dictionary.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // 解析文本为词条数组，支持空格、逗号或换行分隔
  const parseWordsText = (text: string): { word: string }[] => {
    return text
      .split(/[\n,\s]+/)  // 支持换行、逗号、空格分隔
      .map(word => word.trim())
      .filter(word => word.length > 0)
      .map(word => ({ word }));
  };

  // 将词条数组格式化为固定列数显示（用于展示）
  const formatWordsForDisplay = (entries: { word: string }[]): string => {
    const words = entries.map(e => e.word);
    const lines: string[] = [];
    for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
      const lineWords = words.slice(i, i + WORDS_PER_LINE);
      lines.push(lineWords.join(', '));
    }
    return lines.join('\n');
  };

  // 保存词典配置
  const saveDictionary = useCallback(async (newEnabled: boolean, newWordsText: string) => {
    try {
      const entries = parseWordsText(newWordsText);

      // 静默去重（忽略大小写）
      const seen = new Set<string>();
      const deduped: { word: string }[] = [];
      for (const entry of entries) {
        const lower = entry.word.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          deduped.push(entry);
        }
      }

      const removedCount = entries.length - deduped.length;
      const dedupedText = formatWordsForDisplay(deduped);

      // 更新显示文本为去重后的版本，避免重复触发
      if (removedCount > 0) {
        setWordsText(dedupedText);
        showToast({
          type: 'info',
          title: t('dictionary.dedupToast', { count: removedCount }),
        });
      }

      await saveUserDictionary({
        enabled: newEnabled,
        entries: deduped,
        threshold: DEFAULT_THRESHOLD,
        rawText: dedupedText,
      });
    } catch (err) {
      log.error(`Failed to save dictionary: ${err}`);
      setError(t('dictionary.saveError'));
    }
  }, [t, showToast]);

  // 编辑后更新本地状态并保存
  const handleWordsChange = async (value: string) => {
    setWordsText(value);
    if (enabled) {
      await saveDictionary(enabled, value);
    }
  };

  // 切换启用状态
  const handleToggleEnabled = async () => {
    // 暂时未开放，弹出提示
    showToast({
      type: 'info',
      title: t('dictionary.comingSoon'),
    });
  };

  // 渲染加载状态
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500">{t('dictionary.loading')}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">{t('dictionary.title')}</h2>
          <span className="px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
            {t('dictionary.comingSoon')}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">{t('dictionary.subtitle')}</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Settings list */}
      <div className="space-y-2">
        {/* Enable toggle */}
        <div className={`flex items-center justify-between p-3 rounded-xl border border-gray-100 transition-all duration-200 ${
          enabled ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'
        }`}>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className={`w-4 h-4 ${enabled ? 'text-gray-900' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('dictionary.enable')}</p>
              <p className="text-xs text-gray-500">{t('dictionary.enableDesc')}</p>
            </div>
          </div>
          <button
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 ${
              enabled ? 'bg-gray-900' : 'bg-gray-200'
            } cursor-pointer`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Words textarea */}
        <div className="p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all duration-200">
          <div className="flex items-center mb-3">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className={`w-4 h-4 ${enabled ? 'text-gray-900' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('dictionary.wordList')}</p>
              <p className="text-xs text-gray-500">{t('dictionary.wordListDesc')}</p>
            </div>
          </div>
          <textarea
            value={wordsText}
            onChange={(e) => handleWordsChange(e.target.value)}
            disabled={!enabled}
            rows={8}
            placeholder={enabled ? t('dictionary.placeholder') : t('dictionary.enableFirst')}
            className={`w-full px-3 py-2.5 text-sm leading-relaxed border border-gray-200 rounded-lg resize-none transition-colors ${
              enabled
                ? 'bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          />
          {enabled && (
            <p className="mt-2 text-xs text-gray-500">
              {t('dictionary.totalWords', { count: parseWordsText(wordsText).length })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}