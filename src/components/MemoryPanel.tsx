import { useState, useMemo, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import type { HistoryRecord } from '../types';
import { useToast } from './ui/Toast';
import { createLogger } from '../services/log';
import { searchHistory, type HistorySearchResult } from '../services/history';

// 创建日志记录器
const log = createLogger('MemoryPanel');

interface MemoryPanelProps {
  records: HistoryRecord[];
  onClear: () => void;
  onDelete: (id: string) => void;
}

interface SearchResponse {
  query: string;
  page: number;
  history: HistoryRecord[];
  result: HistorySearchResult | null;
}

// 每页显示条数
const PAGE_SIZE = 10;

// 文本差异对比
function diffText(original: string, modified: string): Array<{ type: 'same' | 'added' | 'removed'; text: string }> {
  const result: Array<{ type: 'same' | 'added' | 'removed'; text: string }> = [];

  // 简单的逐字对比算法
  const origChars = original.split('');
  const modChars = modified.split('');

  let origIdx = 0;
  let modIdx = 0;

  while (origIdx < origChars.length || modIdx < modChars.length) {
    if (origIdx >= origChars.length) {
      // 原文已结束，修改文本还有内容 -> 新增
      result.push({ type: 'added', text: modChars.slice(modIdx).join('') });
      break;
    }
    if (modIdx >= modChars.length) {
      // 修改文本已结束，原文还有内容 -> 删除
      result.push({ type: 'removed', text: origChars.slice(origIdx).join('') });
      break;
    }

    if (origChars[origIdx] === modChars[modIdx]) {
      // 相同字符
      result.push({ type: 'same', text: origChars[origIdx] });
      origIdx++;
      modIdx++;
    } else {
      // 字符不同，需要判断是新增、删除还是替换
      // 查找原文后续是否有匹配
      let foundInOrig = -1;
      for (let i = origIdx + 1; i < Math.min(origIdx + 5, origChars.length); i++) {
        if (origChars[i] === modChars[modIdx]) {
          foundInOrig = i;
          break;
        }
      }

      let foundInMod = -1;
      for (let i = modIdx + 1; i < Math.min(modIdx + 5, modChars.length); i++) {
        if (modChars[i] === origChars[origIdx]) {
          foundInMod = i;
          break;
        }
      }

      if (foundInOrig >= 0 && (foundInMod < 0 || foundInOrig - origIdx <= foundInMod - modIdx)) {
        // 原文后续有匹配 -> 原文部分被删除
        result.push({ type: 'removed', text: origChars.slice(origIdx, foundInOrig).join('') });
        origIdx = foundInOrig;
      } else if (foundInMod >= 0) {
        // 修改文本后续有匹配 -> 修改文本部分是新增
        result.push({ type: 'added', text: modChars.slice(modIdx, foundInMod).join('') });
        modIdx = foundInMod;
      } else {
        // 都没找到匹配 -> 替换
        result.push({ type: 'removed', text: origChars[origIdx] });
        result.push({ type: 'added', text: modChars[modIdx] });
        origIdx++;
        modIdx++;
      }
    }
  }

  // 合并相邻的相同类型
  const merged: Array<{ type: 'same' | 'added' | 'removed'; text: string }> = [];
  for (const item of result) {
    if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
      merged[merged.length - 1].text += item.text;
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

// Icons
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TextIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CompareIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Group records by date
function groupByDate(records: HistoryRecord[], t: (key: string) => string): Record<string, HistoryRecord[]> {
  const groups: Record<string, HistoryRecord[]> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  records.forEach((record) => {
    const date = new Date(record.timestamp);
    date.setHours(0, 0, 0, 0);

    let dateKey: string;
    if (date.getTime() === today.getTime()) {
      dateKey = t('memory.today');
    } else if (date.getTime() === yesterday.getTime()) {
      dateKey = t('memory.yesterday');
    } else {
      dateKey = `${date.getMonth() + 1}月${date.getDate()}日`;
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(record);
  });

  return groups;
}

// Format duration as mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format timestamp as HH:mm
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export default function MemoryPanel({ records, onClear, onDelete }: MemoryPanelProps) {
  const { t } = useTranslation();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [compareRecord, setCompareRecord] = useState<HistoryRecord | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const searchFieldId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();
  const query = searchInput.trim();
  const activeSearch = searchResponse?.query === query &&
    searchResponse.page === currentPage && searchResponse.history === records
    ? searchResponse
    : null;
  const searchResult = activeSearch?.result;

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!query) return;

    let cancelled = false;
    const request = { query, page: currentPage, history: records };
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchHistory(query, currentPage, PAGE_SIZE);
        if (cancelled) return;

        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (currentPage > lastPage) {
          setCurrentPage(lastPage);
        } else {
          setSearchResponse({ ...request, result });
        }
      } catch (error) {
        if (cancelled) return;
        log.error(`Failed to search history: ${error}`);
        setSearchResponse({ ...request, result: null });
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, currentPage, records]);

  const updateSearchInput = (value: string) => {
    setSearchInput(value);
    if (value.trim() !== query) {
      setCurrentPage(1);
      setSearchResponse(null);
    }
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    updateSearchInput('');
    searchToggleRef.current?.focus({ preventScroll: true });
  };

  // Copy text to clipboard
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({
        type: 'success',
        title: t('memory.copied'),
      });
    } catch (err) {
      log.error(`Failed to copy: ${err}`);
    }
  };

  // Pagination logic
  const totalRecords = query ? searchResult?.total ?? 0 : records.length;
  const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
  const paginatedRecords = useMemo(() => {
    if (query) return searchResult?.records ?? [];

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return records.slice(start, end);
  }, [query, searchResult, records, currentPage]);

  // Group paginated records by date
  const groupedRecords = useMemo(() => groupByDate(paginatedRecords, t), [paginatedRecords, t]);

  // Keep the current history page valid after a deletion.
  useEffect(() => {
    const lastPage = Math.max(1, totalPages);
    if (!query && currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [query, currentPage, totalPages]);

  const handleClear = () => {
    onClear();
    setShowClearConfirm(false);
    updateSearchInput('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="shrink-0 text-xl font-semibold text-gray-900">{t('memory.title')}</h1>
          <div className="flex min-w-0 items-center gap-1">
            <div
              role="search"
              className="flex min-w-0 items-center"
              onKeyDown={event => {
                if (isSearchOpen && event.key === 'Escape' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  closeSearch();
                }
              }}
            >
              <div
                id={searchFieldId}
                aria-hidden={!isSearchOpen}
                className={`relative min-w-0 overflow-hidden transition-[width,opacity,margin-right] duration-200 ease-out motion-reduce:transition-none ${
                  isSearchOpen ? 'mr-1 w-56 opacity-100' : 'w-0 opacity-0'
                }`}
              >
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label={t('memory.search')}
                  placeholder={t('memory.searchPlaceholder')}
                  value={searchInput}
                  disabled={!isSearchOpen}
                  onChange={event => updateSearchInput(event.target.value)}
                  className={`h-8 w-full rounded-lg border border-gray-200 bg-white pl-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden ${
                    searchInput ? 'pr-8' : 'pr-2.5'
                  }`}
                />
                {searchInput && (
                  <button
                    type="button"
                    aria-label={t('memory.clearSearch')}
                    title={t('memory.clearSearch')}
                    onClick={() => {
                      updateSearchInput('');
                      searchInputRef.current?.focus({ preventScroll: true });
                    }}
                    className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                ref={searchToggleRef}
                type="button"
                aria-label={t(isSearchOpen ? 'memory.closeSearch' : 'memory.search')}
                title={t(isSearchOpen ? 'memory.closeSearch' : 'memory.search')}
                aria-expanded={isSearchOpen}
                aria-controls={searchFieldId}
                onClick={() => {
                  if (isSearchOpen) closeSearch();
                  else setIsSearchOpen(true);
                }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 hover:text-gray-900 ${
                  isSearchOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600'
                }`}
              >
                <Search aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={records.length === 0 && totalRecords === 0}
            >
              <TrashIcon />
              {t('memory.clear')}
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-gray-600">{t('memory.subtitle')}</p>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {query && (
          <p role="status" className="text-sm text-gray-500">
            {!activeSearch
              ? t('memory.searching')
              : !searchResult
                ? t('memory.searchFailed')
                : searchResult.total === 0
                  ? t('memory.noSearchResults')
                  : t('memory.searchResults', { count: totalRecords })}
          </p>
        )}
        {!query && paginatedRecords.length === 0 && (
          <div className="text-center py-16 bg-gray-50 rounded-xl">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-600">{t('memory.noRecords')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('memory.noRecordsHint')}</p>
          </div>
        )}
        {paginatedRecords.length > 0 && (
          <>
            {Object.entries(groupedRecords).map(([date, dateRecords]) => (
              <div key={date} className="space-y-2">
                {/* Date Header */}
                <h3 className="text-sm font-semibold text-gray-600 px-1">{date}</h3>

                {/* Records for this date */}
                <div className="space-y-2">
                  {dateRecords.map((record, index) => (
                    <div
                      key={record.id}
                      className="group bg-white rounded-xl p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200 cursor-pointer"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Time */}
                        <div className="flex-shrink-0 w-12 text-sm font-medium text-gray-500 pt-0.5">
                          {formatTime(record.timestamp)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                            {record.content}
                          </p>

                          {/* Meta info */}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <ClockIcon />
                                {formatDuration(record.duration)}
                              </span>
                              <span className="flex items-center gap-1">
                                <TextIcon />
                                {t('memory.words', { count: record.wordCount })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {record.rawContent && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCompareRecord(record);
                                  }}
                                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                  title={t('memory.compareOriginal')}
                                >
                                  <CompareIcon />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(record.content);
                                }}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                title={t('memory.copy')}
                              >
                                <CopyIcon />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(record);
                                }}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title={t('memory.delete')}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4 pb-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  title={t('memory.prevPage')}
                >
                  <ChevronLeftIcon />
                </button>

                {query ? (
                  <span className="px-2 text-sm text-gray-600">
                    {t('memory.pageOf', { page: currentPage, total: totalPages })}
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  title={t('memory.nextPage')}
                >
                  <ChevronRightIcon />
                </button>

                {!query && (
                  <span className="ml-4 text-sm text-gray-500">
                    {t('memory.totalRecords', { count: totalRecords })}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl animate-scale-in">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <TrashIcon />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">{t('memory.confirmClear')}</h3>
              <p className="text-sm text-gray-600 mb-6">
                {t('memory.confirmClearDesc')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('memory.cancel')}
                </button>
                <button
                  onClick={handleClear}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  {t('memory.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Single Record Confirmation Modal */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl animate-scale-in">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <TrashIcon />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">{t('memory.confirmDelete')}</h3>
              <p className="text-sm text-gray-600 mb-6">
                {t('memory.confirmDeleteDesc')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('memory.cancel')}
                </button>
                <button
                  onClick={() => {
                    onDelete(deleteTarget.id);
                    setDeleteTarget(null);
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  {t('memory.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Compare Modal */}
      {compareRecord && compareRecord.rawContent && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-4xl w-full mx-4 shadow-xl animate-scale-in max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{t('memory.compareTitle')}</h3>
              <button
                onClick={() => setCompareRecord(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Original Text */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">{t('memory.originalText')}</h4>
                    <button
                      onClick={() => handleCopy(compareRecord.rawContent!)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    >
                      <CopyIcon />
                      {t('memory.copy')}
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
                    {compareRecord.rawContent}
                  </div>
                </div>

                {/* Polished Text */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">{t('memory.polishedText')}</h4>
                    <button
                      onClick={() => handleCopy(compareRecord.content)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    >
                      <CopyIcon />
                      {t('memory.copy')}
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
                    {compareRecord.content}
                  </div>
                </div>
              </div>

              {/* Diff Highlight Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('memory.diffHighlight')}</h4>
                <div className="bg-gray-50 rounded-lg p-4 text-sm leading-relaxed">
                  {(() => {
                    const diff = diffText(compareRecord.rawContent, compareRecord.content);
                    return diff.map((item, idx) => {
                      if (item.type === 'removed') {
                        return (
                          <span key={idx} className="bg-red-100 text-red-700 line-through">
                            {item.text}
                          </span>
                        );
                      } else if (item.type === 'added') {
                        return (
                          <span key={idx} className="bg-green-100 text-green-700 font-medium">
                            {item.text}
                          </span>
                        );
                      }
                      return <span key={idx}>{item.text}</span>;
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
