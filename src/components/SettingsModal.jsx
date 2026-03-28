import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AVATAR_COLORS = [
  '#5865F2', '#57F287', '#FEE75C', '#EB459E',
  '#ED4245', '#3BA55C', '#FAA81A', '#00AFF4',
  '#B9BBBE', '#9B59B6',
];

/**
 * Модальное окно настроек пользователя.
 * - Смена аватарки (цвет + инициал)
 * - Смена ника
 * - Выбор микрофона
 * - Тест микрофона (слышишь себя)
 */
export function SettingsModal({ user, username: initialUsername, onClose, onUsernameChange }) {
  // ── Ник ──
  const [username, setUsername]   = useState(initialUsername ?? '');
  const [savingNick, setSavingNick] = useState(false);
  const [nickMsg, setNickMsg]      = useState(null); // { type: 'ok'|'err', text }

  // ── Аватар ──
  const [avatarColor, setAvatarColor] = useState(() => {
    return localStorage.getItem('avatarColor') ?? AVATAR_COLORS[0];
  });

  // ── Микрофон ──
  const [devices, setDevices]         = useState([]);  // список микрофонов
  const [selectedDevice, setSelectedDevice] = useState(() => localStorage.getItem('micDeviceId') ?? '');
  const [testing, setTesting]         = useState(false);
  const [volume, setVolume]            = useState(0);   // 0-100 для индикатора
  const testStreamRef  = useRef(null);
  const analyserRef    = useRef(null);
  const animFrameRef   = useRef(null);
  const gainNodeRef    = useRef(null);
  const audioCtxRef    = useRef(null);

  // Загружаем список микрофонов
  useEffect(() => {
    async function loadDevices() {
      try {
        // Нужно запросить разрешение, чтобы получить labels
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter(d => d.kind === 'audioinput'));
      } catch {
        setDevices([]);
      }
    }
    loadDevices();
  }, []);

  // Сохраняем цвет аватара в localStorage
  useEffect(() => {
    localStorage.setItem('avatarColor', avatarColor);
  }, [avatarColor]);

  // Сохраняем выбранный микрофон в localStorage
  useEffect(() => {
    localStorage.setItem('micDeviceId', selectedDevice);
  }, [selectedDevice]);

  // Стоп теста при закрытии
  useEffect(() => () => stopTest(), []);

  /** Запустить тест микрофона — пользователь слышит себя */
  const startTest = useCallback(async () => {
    stopTest();
    try {
      const constraints = {
        audio: selectedDevice ? { deviceId: { exact: selectedDevice } } : true,
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const ctx   = new AudioContext();
      audioCtxRef.current = ctx;
      const src   = ctx.createMediaStreamSource(stream);
      const dest  = ctx.createMediaStreamDestination();

      // Gain: задержка + слышим себя
      const gain  = ctx.createGain();
      gain.gain.value = 1;
      gainNodeRef.current = gain;
      src.connect(gain);
      gain.connect(ctx.destination); // воспроизводим себя

      // Analyser для индикатора громкости
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      src.connect(analyser);

      setTesting(true);
      drawVolume(analyser);
    } catch {
      alert('Не удалось открыть микрофон. Проверь разрешения.');
    }
  }, [selectedDevice]);

  /** Анимация индикатора */
  function drawVolume(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(Math.min(100, Math.round(avg * 2)));
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }

  /** Остановить тест */
  function stopTest() {
    cancelAnimationFrame(animFrameRef.current);
    testStreamRef.current?.getTracks().forEach(t => t.stop());
    testStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setTesting(false);
    setVolume(0);
  }

  /** Сохранить ник */
  async function saveUsername() {
    if (!username.trim() || username.trim().length < 2) {
      setNickMsg({ type: 'err', text: 'Имя должно быть не короче 2 символов' });
      return;
    }
    setSavingNick(true);
    const { error } = await supabase.auth.updateUser({
      data: { username: username.trim() },
    });
    setSavingNick(false);
    if (error) {
      setNickMsg({ type: 'err', text: 'Ошибка сохранения: ' + error.message });
    } else {
      setNickMsg({ type: 'ok', text: 'Сохранено!' });
      onUsernameChange?.(username.trim());
      setTimeout(() => setNickMsg(null), 2000);
    }
  }

  const initial = (username?.[0] ?? '?').toUpperCase();

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-ds-sidebar rounded-2xl w-full max-w-lg shadow-2xl border border-white/10 overflow-hidden animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ds-divider/50">
          <h2 className="text-ds-text font-bold text-lg">Настройки пользователя</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[80vh] p-6 space-y-8">

          {/* ── Аватар ── */}
          <section>
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">Аватар</h3>
            <div className="flex items-center gap-5">
              {/* Preview */}
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg transition-all duration-300"
                style={{ backgroundColor: avatarColor }}
              >
                {initial}
              </div>
              {/* Color picker */}
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setAvatarColor(color)}
                    className="w-8 h-8 rounded-full transition-all duration-150 hover:scale-110 flex-shrink-0"
                    style={{
                      backgroundColor: color,
                      outline: avatarColor === color ? `3px solid white` : '3px solid transparent',
                      outlineOffset: '2px',
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* ── Ник ── */}
          <section>
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">Имя пользователя</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveUsername()}
                placeholder="Твоё имя в чате"
                className="flex-1 bg-ds-bg border border-ds-divider rounded-lg px-3 py-2 text-ds-text text-sm placeholder-ds-muted/60 focus:outline-none focus:border-ds-accent focus:ring-1 focus:ring-ds-accent transition-colors"
              />
              <button
                onClick={saveUsername}
                disabled={savingNick}
                className="px-4 py-2 bg-ds-accent hover:bg-ds-accent/90 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-60 shadow-sm shadow-ds-accent/30"
              >
                {savingNick ? '...' : 'Сохранить'}
              </button>
            </div>
            {nickMsg && (
              <p className={`text-xs mt-2 ${nickMsg.type === 'ok' ? 'text-ds-green' : 'text-ds-red'}`}>
                {nickMsg.text}
              </p>
            )}
          </section>

          {/* ── Микрофон ── */}
          <section>
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">Микрофон</h3>

            {/* Выбор устройства */}
            <select
              value={selectedDevice}
              onChange={e => {
                setSelectedDevice(e.target.value);
                if (testing) { stopTest(); }
              }}
              className="w-full bg-ds-bg border border-ds-divider rounded-lg px-3 py-2 text-ds-text text-sm focus:outline-none focus:border-ds-accent transition-colors appearance-none cursor-pointer"
            >
              <option value="">По умолчанию (системный)</option>
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Микрофон ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>

            {/* Тест */}
            <div className="mt-4 p-4 bg-ds-bg rounded-xl border border-ds-divider/50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-ds-text text-sm font-semibold">Проверка микрофона</p>
                  <p className="text-ds-muted text-xs mt-0.5">
                    {testing ? '🔴 Говори — ты слышишь себя' : 'Нажми чтобы услышать свой микрофон'}
                  </p>
                </div>
                <button
                  onClick={testing ? stopTest : startTest}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    testing
                      ? 'bg-ds-red/20 text-ds-red hover:bg-ds-red/30'
                      : 'bg-ds-green/20 text-ds-green hover:bg-ds-green/30'
                  }`}
                >
                  {testing ? 'Остановить' : 'Начать тест'}
                </button>
              </div>

              {/* Индикатор громкости */}
              <div className="w-full bg-ds-divider/50 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-75"
                  style={{
                    width: `${volume}%`,
                    backgroundColor: volume > 70 ? '#ed4245' : volume > 30 ? '#fee75c' : '#57f287',
                  }}
                />
              </div>
              {testing && (
                <p className="text-ds-muted text-[10px] mt-1.5 text-center">
                  Уровень: {volume}%
                </p>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
