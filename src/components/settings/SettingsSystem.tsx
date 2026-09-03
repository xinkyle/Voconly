import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { enableAutostart, disableAutostart, isAutostartEnabled } from '../../services/autostart';
import { getMicrophones, requestMicrophonePermission } from '../../services/audio';
import { invoke } from '../../utils/tauri';
import { createLogger } from '../../services/log';
import type { AppConfig, MicrophoneDevice, PreviewHeight } from '../../types';

// 创建日志记录器
const log = createLogger('SettingsSystem');

interface SettingsSystemProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function SettingsSystem({ config, onSave }: SettingsSystemProps) {
  const { t, i18n } = useTranslation();
  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(config.autoStart ?? true);
  const [checkUpdates, setCheckUpdates] = useState<boolean>(config.checkUpdates ?? false);
  const [previewHeight, setPreviewHeight] = useState<PreviewHeight>(config.previewHeight ?? 'low');
  const [asrIdleTimeout, setAsrIdleTimeout] = useState<number>(config.asrIdleTimeoutSeconds ?? 300);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Microphone state
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>(config.defaultMicrophone || '');
  const [micLoading, setMicLoading] = useState(true);

  // Log directory state
  const [logDir, setLogDir] = useState<string>('');

  // Load current autostart status on mount
  useEffect(() => {
    loadAutostartStatus();
    loadMicrophones();
    loadLogDir();
  }, []);

  // Sync state when config changes
  useEffect(() => {
    setAutostartEnabled(config.autoStart ?? true);
    setCheckUpdates(config.checkUpdates ?? false);
    setPreviewHeight(config.previewHeight ?? 'low');
    setSelectedMic(config.defaultMicrophone || '');
    setAsrIdleTimeout(config.asrIdleTimeoutSeconds ?? 300);
  }, [config.autoStart, config.checkUpdates, config.previewHeight, config.defaultMicrophone, config.asrIdleTimeoutSeconds]);

  const loadAutostartStatus = async () => {
    setLoading(true);
    try {
      const enabled = await isAutostartEnabled();
      setAutostartEnabled(enabled);
    } catch (err) {
      log.error(`Failed to load autostart status: ${err}`);
      setError(t('settings.system.loadAutostartError'));
    } finally {
      setLoading(false);
    }
  };

  const loadMicrophones = async () => {
    setMicLoading(true);
    try {
      const granted = await requestMicrophonePermission();
      if (granted) {
        const devices = await getMicrophones();
        setMicrophones(devices);
      }
    } catch (err) {
      log.error(`Failed to load microphones: ${err}`);
    } finally {
      setMicLoading(false);
    }
  };

  const loadLogDir = async () => {
    try {
      const dir = await invoke<string>('get_log_dir_path');
      setLogDir(dir);
    } catch (err) {
      log.error(`Failed to get log directory: ${err}`);
    }
  };

  const handleOpenLogDir = async () => {
    try {
      await invoke('open_log_dir');
    } catch (err) {
      log.error(`Failed to open log directory: ${err}`);
      setError(t('settings.system.openLogDirError'));
    }
  };

  const handleAutostartToggle = async (enabled: boolean) => {
    setSaving(true);
    setError(null);

    try {
      if (enabled) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }

      setAutostartEnabled(enabled);

      // Save to config
      const newConfig = { ...config, autoStart: enabled };
      onSave(newConfig);
    } catch (err) {
      log.error(`Failed to toggle autostart: ${err}`);
      setError(t('settings.system.setAutostartError'));
      // Revert the state on error
      setAutostartEnabled(!enabled);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckUpdatesToggle = (enabled: boolean) => {
    setCheckUpdates(enabled);
    const newConfig = { ...config, checkUpdates: enabled };
    onSave(newConfig);
  };

  const handlePreviewHeightChange = (height: PreviewHeight) => {
    console.log(`[设置] 预览高度变更为: ${height}`);
    setPreviewHeight(height);
    // 同时保存到 localStorage，让 FloatPanelApp 实时读取
    try {
      localStorage.setItem('voconly-preview-height', height);
      console.log(`[设置] 已保存到 localStorage: voconly-preview-height = ${height}`);
      // 验证是否保存成功
      const saved = localStorage.getItem('voconly-preview-height');
      console.log(`[设置] 验证 localStorage 读取: ${saved}`);
    } catch (e) {
      console.error(`[设置] 保存到 localStorage 失败: ${e}`);
    }
    const newConfig = { ...config, previewHeight: height };
    onSave(newConfig);
  };

  const handleMicrophoneChange = (deviceId: string) => {
    setSelectedMic(deviceId);
    const newConfig = { ...config, defaultMicrophone: deviceId };
    onSave(newConfig);
  };

  const handleAsrIdleTimeoutChange = (minutes: number) => {
    // 分钟转换为秒
    const seconds = minutes === 0 ? 0 : minutes * 60;
    setAsrIdleTimeout(seconds);
    const newConfig = { ...config, asrIdleTimeoutSeconds: seconds };
    onSave(newConfig);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500">{t('settings.system.loadingSystem')}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{t('settings.system.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('settings.system.subtitle')}</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Settings list */}
      <div className="space-y-2">
        {/* Auto-start setting */}
        <div className={`flex items-center justify-between p-3 rounded-xl border border-gray-100 transition-all duration-200 ${
          autostartEnabled ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'
        }`}>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className={`w-4 h-4 ${autostartEnabled ? 'text-gray-900' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.system.autostart')}</p>
              <p className="text-xs text-gray-500">{t('settings.system.autostartDesc')}</p>
            </div>
          </div>
          <button
            onClick={() => handleAutostartToggle(!autostartEnabled)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 ${
              autostartEnabled ? 'bg-gray-700' : 'bg-gray-200'
            } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autostartEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Language setting */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all duration-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.system.language')}</p>
              <p className="text-xs text-gray-500">{t('settings.system.languageDesc')}</p>
            </div>
          </div>
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="px-3 py-1.5 bg-gray-100 border-0 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 cursor-pointer"
          >
            <option value="zh">{t('settings.system.languageZh')}</option>
            <option value="en">{t('settings.system.languageEn')}</option>
          </select>
        </div>

        {/* Check updates setting */}
        <div className={`flex items-center justify-between p-3 rounded-xl border border-gray-100 transition-all duration-200 ${
          checkUpdates ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'
        }`}>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className={`w-4 h-4 ${checkUpdates ? 'text-gray-900' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.system.checkUpdates')}</p>
              <p className="text-xs text-gray-500">{t('settings.system.checkUpdatesDesc')}</p>
            </div>
          </div>
          <button
            onClick={() => handleCheckUpdatesToggle(!checkUpdates)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 ${
              checkUpdates ? 'bg-gray-700' : 'bg-gray-200'
            } cursor-pointer`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                checkUpdates ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* ASR Idle Timeout setting */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all duration-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.system.asrIdleTimeout')}</p>
              <p className="text-xs text-gray-500">{t('settings.system.asrIdleTimeoutDesc')}</p>
            </div>
          </div>
          <select
            value={asrIdleTimeout === 0 ? 0 : Math.floor(asrIdleTimeout / 60)}
            onChange={(e) => handleAsrIdleTimeoutChange(parseInt(e.target.value))}
            className="px-3 py-1.5 bg-gray-100 border-0 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 cursor-pointer"
          >
            <option value={0}>{t('settings.system.asrIdleTimeoutDisabled')}</option>
            <option value={1}>{t('settings.system.asrIdleTimeout1min')}</option>
            <option value={3}>{t('settings.system.asrIdleTimeout3min')}</option>
            <option value={5}>{t('settings.system.asrIdleTimeout5min')}</option>
            <option value={10}>{t('settings.system.asrIdleTimeout10min')}</option>
            <option value={15}>{t('settings.system.asrIdleTimeout15min')}</option>
            <option value={30}>{t('settings.system.asrIdleTimeout30min')}</option>
          </select>
        </div>

        {/* Preview height setting */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all duration-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.system.previewHeight')}</p>
              <p className="text-xs text-gray-500">{t('settings.system.previewHeightDesc')}</p>
            </div>
          </div>
          <select
            value={previewHeight}
            onChange={(e) => handlePreviewHeightChange(e.target.value as PreviewHeight)}
            className="px-3 py-1.5 bg-gray-100 border-0 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 cursor-pointer"
          >
            <option value="high">{t('settings.system.previewHeightHigh')}</option>
            <option value="medium">{t('settings.system.previewHeightMedium')}</option>
            <option value="low">{t('settings.system.previewHeightLow')}</option>
          </select>
        </div>

        {/* Microphone setting */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all duration-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.system.defaultMic')}</p>
              <p className="text-xs text-gray-500">{t('settings.system.defaultMicDesc')}</p>
            </div>
          </div>
          <select
            value={selectedMic}
            onChange={(e) => handleMicrophoneChange(e.target.value)}
            disabled={micLoading}
            className="px-3 py-1.5 bg-gray-100 border-0 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 cursor-pointer w-auto min-w-[140px] max-w-[420px]"
          >
            <option value="">{t('settings.system.autoMic')}</option>
            {microphones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))}
          </select>
        </div>


        {/* Open log directory */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all duration-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{t('settings.system.logDirectory')}</p>
              <p className="text-xs text-gray-500 truncate max-w-[280px]" title={logDir}>{logDir || t('common.loading')}</p>
            </div>
          </div>
          <button
            onClick={handleOpenLogDir}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border-0 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-gray-900 cursor-pointer transition-colors"
          >
            {t('settings.system.openDirectory')}
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="mt-6 p-4 bg-gray-100 border border-gray-200 rounded-xl">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-gray-700">
              {t('settings.system.autostartTip')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}