import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getMicrophones, requestMicrophonePermission } from '../../services/audio';
import type { MicrophoneDevice, AppConfig } from '../../types';
import { createLogger } from '../../services/log';

// 创建日志记录器
const log = createLogger('SettingsMic');

interface SettingsMicrophoneProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

export default function SettingsMicrophone({ config, onSave }: SettingsMicrophoneProps) {
  const { t } = useTranslation();
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>(config.defaultMicrophone || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load microphones on mount
  useEffect(() => {
    loadMicrophones();
  }, []);

  // Update selected mic when config changes
  useEffect(() => {
    setSelectedMic(config.defaultMicrophone || '');
  }, [config.defaultMicrophone]);

  const loadMicrophones = async () => {
    setLoading(true);
    setError(null);

    try {
      // First request permission
      const granted = await requestMicrophonePermission();

      if (!granted) {
        setError(t('microphone.permissionRequired'));
        setLoading(false);
        return;
      }

      // Then get microphone list
      const devices = await getMicrophones();
      setMicrophones(devices);

      if (devices.length === 0) {
        setError(t('microphone.noDevice'));
      }
    } catch (err) {
      log.error(`Failed to load microphones: ${err}`);
      setError(t('microphone.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMicrophone = (deviceId: string) => {
    setSelectedMic(deviceId);
    // Save to config
    const newConfig = { ...config, defaultMicrophone: deviceId };
    onSave(newConfig);
  };

  const handleRefresh = () => {
    loadMicrophones();
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500">{t('microphone.loading')}</p>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="text-red-500 text-4xl mb-3">🎤</div>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            {t('microphone.retry')}
          </button>
        </div>
      </div>
    );
  }

  // Render empty state
  if (microphones.length === 0) {
    return (
      <div className="py-8">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <div className="text-gray-400 text-4xl mb-3">🔇</div>
          <p className="text-gray-500">{t('microphone.noDevice')}</p>
          <p className="text-gray-400 text-sm mt-2">{t('microphone.noDeviceHint')}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {t('microphone.refresh')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{t('microphone.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('microphone.subtitle')}</p>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title={t('microphone.refresh')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Microphone List */}
      <div className="space-y-2">
        {/* Default option */}
        <label
          className={`flex items-center p-4 rounded-xl border border-gray-100 cursor-pointer transition-all duration-200 ${
            selectedMic === ''
              ? 'bg-gray-100'
              : 'bg-white hover:bg-gray-50'
          }`}
        >
          <input
            type="radio"
            name="microphone"
            value=""
            checked={selectedMic === ''}
            onChange={() => handleSelectMicrophone('')}
            className="sr-only"
          />
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 transition-colors ${
            selectedMic === '' ? 'border-gray-900' : 'border-gray-300'
          }`}>
            {selectedMic === '' && (
              <div className="w-2.5 h-2.5 rounded-full bg-gray-900"></div>
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">{t('microphone.autoFollowSystem')}</p>
            <p className="text-sm text-gray-500">{t('microphone.autoFollowSystemDesc')}</p>
          </div>
        </label>

        {/* Microphone devices */}
        {microphones.map((mic) => (
          <label
            key={mic.deviceId}
            className={`flex items-center p-4 rounded-xl border border-gray-100 cursor-pointer transition-all duration-200 ${
              selectedMic === mic.deviceId
                ? 'bg-gray-100'
                : 'bg-white hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="microphone"
              value={mic.deviceId}
              checked={selectedMic === mic.deviceId}
              onChange={() => handleSelectMicrophone(mic.deviceId)}
              className="sr-only"
            />
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 transition-colors ${
              selectedMic === mic.deviceId ? 'border-gray-900' : 'border-gray-300'
            }`}>
              {selectedMic === mic.deviceId && (
                <div className="w-2.5 h-2.5 rounded-full bg-gray-900"></div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{mic.label}</p>
            </div>
            <div className="text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
          </label>
        ))}
      </div>

      {/* Selected info */}
      {selectedMic && (
        <div className="mt-6 p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-600">
            {t('microphone.selected')}: <span className="font-medium text-gray-900">
              {microphones.find(m => m.deviceId === selectedMic)?.label || t('microphone.unknownDevice')}
            </span>
          </p>
        </div>
      )}

      {/* Hint */}
      <p className="mt-4 text-xs text-gray-400">
        {t('microphone.tip')}
      </p>
    </div>
  );
}