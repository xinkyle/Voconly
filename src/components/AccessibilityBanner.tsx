import { useTranslation } from 'react-i18next';

interface AccessibilityBannerProps {
  /** accessibility: 缺少辅助功能权限（影响全局快捷键与自动粘贴）；keyhook: 全局键盘监听不可用（输入监控） */
  mode: 'accessibility' | 'keyhook';
  onAuthorize: () => void;
  onDismiss: () => void;
}

/**
 * macOS 权限引导横幅
 * 状态驱动：权限齐备时永不显示；授权后由窗口聚焦时的重新检查自动清除
 */
export default function AccessibilityBanner({ mode, onAuthorize, onDismiss }: AccessibilityBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="text-sm text-amber-800">
        {mode === 'accessibility'
          ? t('accessibility.bannerText')
          : t('accessibility.keyhookBannerText')}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onAuthorize}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          {t('accessibility.authorize')}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg px-2 py-1.5 text-sm text-amber-600 transition-colors hover:text-amber-800"
        >
          {t('accessibility.dismiss')}
        </button>
      </div>
    </div>
  );
}
