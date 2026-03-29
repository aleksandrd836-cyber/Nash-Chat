/**
 * Звуковые уведомления
 * Сохраняют настройки в localStorage для персонализации.
 */

const DEFAULT_SETTINGS = {
  volume: 50, // 0-100
  enabled_join: true,
  enabled_leave: true,
  enabled_self_join: true,
  enabled_self_leave: true,
  enabled_stream: true,
  enabled_self_stream: true,
  enabled_dm: true,
  enabled_mute: true,
  enabled_unmute: true,
  enabled_deafen: true,
  enabled_undeafen: true,
};

const BASE_URL = 'https://raw.githubusercontent.com/lefuturiste/discord-sounds/master';

const SOUND_URLS = {
  join: `${BASE_URL}/user-moved.mp3`,
  leave: `${BASE_URL}/user-leave.mp3`,
  self_join: `${BASE_URL}/incoming-user.mp3`,
  self_leave: `${BASE_URL}/deconnected.mp3`,
  stream: `${BASE_URL}/stream_started.mp3`,
  self_stream: `${BASE_URL}/stream_started.mp3`,
  stream_stop: `${BASE_URL}/stream_ended.mp3`,
  dm: `${BASE_URL}/new-message.mp3`,
  mute: `${BASE_URL}/muted.mp3`,
  unmute: `${BASE_URL}/non-muted.mp3`,
  deafen: `${BASE_URL}/deaf.mp3`,
  undeafen: `${BASE_URL}/non-deaf.mp3`,
};

class NotificationService {
  constructor() {
    this.settings = this.loadSettings();
    this.audioPool = {};
  }

  loadSettings() {
    const saved = localStorage.getItem('notification_settings');
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem('notification_settings', JSON.stringify(this.settings));
  }

  getSettings() {
    return this.settings;
  }

  setVolume(vol) {
    this.saveSettings({ volume: Math.max(0, Math.min(100, vol)) });
  }

  updateSetting(key, value) {
    this.saveSettings({ [key]: value });
  }

  /**
   * Проигрывает звук с учетом настроек пользователя
   */
  play(type) {
    const settingMap = {
      join: 'enabled_join',
      leave: 'enabled_leave',
      self_join: 'enabled_self_join',
      self_leave: 'enabled_self_leave',
      stream: 'enabled_stream',
      self_stream: 'enabled_self_stream',
      stream_stop: 'enabled_stream', // Используем ту же настройку для конца стрима
      dm: 'enabled_dm',
      mute: 'enabled_mute',
      unmute: 'enabled_unmute',
      deafen: 'enabled_deafen',
      undeafen: 'enabled_undeafen',
    };

    const isEnabled = this.settings[settingMap[type]];
    if (!isEnabled || this.settings.volume === 0) return;

    try {
      const url = SOUND_URLS[type];
      if (!url) return;

      const audio = new Audio(url);
      audio.volume = this.settings.volume / 100;
      
      const outputDeviceId = localStorage.getItem('outputDeviceId');
      if (outputDeviceId && typeof audio.setSinkId === 'function') {
        audio.setSinkId(outputDeviceId).catch(() => {});
      }

      audio.play().catch(e => {
        console.warn('Audio play blocked or failed:', e.message);
      });
    } catch (err) {
      console.error('Notification play error:', err);
    }
  }
}

export const notifications = new NotificationService();
