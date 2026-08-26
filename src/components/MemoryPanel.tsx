import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { HistoryRecord } from '../types';
import { getFullStats, type FullStats } from '../services/history';
import { useToast } from './ui/Toast';
import { createLogger } from '../services/log';

// 创建日志记录器
const log = createLogger('MemoryPanel');

interface MemoryPanelProps {
  records: HistoryRecord[];
  onClear: () => void;
}

// 每页显示条数
const PAGE_SIZE = 10;

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

const MicIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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

export default function MemoryPanel({ records, onClear }: MemoryPanelProps) {
  const { t } = useTranslation();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [fullStats, setFullStats] = useState<FullStats>({
    totalDuration: 0,
    totalWords: 0,
    totalCount: 0,
    todayCount: 0,
    activeDays: 0,
  });
  const { showToast } = useToast();

  // 计算平均值
  const avgStats = useMemo(() => {
    const days = fullStats.activeDays || 1;
    return {
      avgWordsPerDay: Math.round(fullStats.totalWords / days),
      avgRecordsPerDay: Math.round(fullStats.totalCount / days),
    };
  }, [fullStats]);

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

  // 加载完整统计（当前 + 归档）
  useEffect(() => {
    getFullStats()
      .then(stats => {
        setFullStats({
          totalDuration: stats?.totalDuration ?? 0,
          totalWords: stats?.totalWords ?? 0,
          totalCount: stats?.totalCount ?? 0,
          todayCount: stats?.todayCount ?? 0,
          activeDays: stats?.activeDays ?? 0,
        });
      })
      .catch(() => {
        setFullStats({ totalDuration: 0, totalWords: 0, totalCount: 0, todayCount: 0, activeDays: 0 });
      });
  }, [records]); // records 变化时重新获取

  // Pagination logic
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return records.slice(start, end);
  }, [records, currentPage]);

  // Group paginated records by date
  const groupedRecords = useMemo(() => groupByDate(paginatedRecords, t), [paginatedRecords, t]);

  // Reset to first page when records change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleClear = () => {
    onClear();
    setShowClearConfirm(false);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">{t('memory.title')}</h2>
        <button
          onClick={() => records.length > 0 && setShowClearConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={records.length === 0}
        >
          <TrashIcon />
          {t('memory.clear')}
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Duration */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <ClockIcon />
            <span className="text-sm font-semibold">{t('memory.totalDuration')}</span>
          </div>
          <div className="text-xl font-semibold text-gray-900">
            {formatDuration(fullStats.totalDuration)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {fullStats.activeDays > 0 ? t('memory.activeDays', { count: fullStats.activeDays }) : t('memory.totalDurationDesc')}
          </div>
        </div>

        {/* Total Words */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <TextIcon />
            <span className="text-sm font-semibold">{t('memory.totalWords')}</span>
          </div>
          <div className="text-xl font-semibold text-gray-900">
            {(fullStats.totalWords ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {fullStats.activeDays > 0 ? t('memory.avgWordsPerDay', { count: avgStats.avgWordsPerDay.toLocaleString() }) : t('memory.totalWordsDesc')}
          </div>
        </div>

        {/* Total Records */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <MicIcon />
            <span className="text-sm font-semibold">{t('memory.totalCount')}</span>
          </div>
          <div className="text-xl font-semibold text-gray-900">
            {fullStats.totalCount}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {fullStats.activeDays > 0 ? t('memory.avgRecordsPerDay', { count: avgStats.avgRecordsPerDay }) : t('memory.totalCountDesc')}
          </div>
        </div>

        {/* Today's Records */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <CalendarIcon />
            <span className="text-sm font-semibold">{t('memory.todayCount')}</span>
          </div>
          <div className="text-xl font-semibold text-gray-900">
            {fullStats.todayCount}
          </div>
          <div className="text-xs text-gray-500 mt-1">{t('memory.todayCountDesc')}</div>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {Object.entries(groupedRecords).length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-500">{t('memory.noRecords')}</p>
            <p className="text-sm text-gray-400 mt-1">{t('memory.noRecordsHint')}</p>
          </div>
        ) : (
          <>
            {Object.entries(groupedRecords).map(([date, dateRecords]) => (
              <div key={date} className="space-y-2">
                {/* Date Header */}
                <h3 className="text-sm font-semibold text-gray-500 px-1">{date}</h3>

                {/* Records for this date */}
                <div className="space-y-2">
                  {dateRecords.map((record, index) => (
                    <div
                      key={record.id}
                      className="group bg-white rounded-xl p-3 border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Time */}
                        <div className="flex-shrink-0 w-12 text-sm font-medium text-gray-400 pt-0.5">
                          {formatTime(record.timestamp)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 leading-relaxed line-clamp-3">
                            {record.content}
                          </p>

                          {/* Meta info */}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <span className="flex items-center gap-1">
                                <ClockIcon />
                                {formatDuration(record.duration)}
                              </span>
                              <span className="flex items-center gap-1">
                                <TextIcon />
                                {t('memory.words', { count: record.wordCount })}
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(record.content);
                              }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                              title={t('memory.copied')}
                            >
                              <CopyIcon />
                            </button>
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

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  title={t('memory.nextPage')}
                >
                  <ChevronRightIcon />
                </button>

                <span className="ml-4 text-sm text-gray-400">
                  {t('memory.totalRecords', { count: records.length })}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl animate-scale-in">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <TrashIcon />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">{t('memory.confirmClear')}</h3>
              <p className="text-sm text-gray-500 mb-6">
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
        </div>
      )}
    </div>
  );
}
