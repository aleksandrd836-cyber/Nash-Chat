import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';

/**
 * Модальное окно настроек пользователя.
 * - Привязанная аватарка-смайлик
 * - Смена ника
 * - Выбор микрофона
 * - Тест микрофона (слышишь себя)
 */
export function SettingsModal({ user, username: initialUsername, userColor, onClose, onUsernameChange }) {
  // ── Ник и Цвет ──
  const [username, setUsername]   = useState(initialUsername || '');
  const [color, setColor]         = useState(userColor || '#ffffff');
  const [savingNick, setSavingNick] = useState(false);
  const [nickMsg, setNickMsg]      = useState(null); // { type: 'ok'|'err', text }

  // ── Микрофон ──
  const [devices, setDevices]               = useState([]);  // список микрофонов
  const [outputDevices, setOutputDevices]   = useState([]);  // список колонок/наушников
  const [selectedDevice, setSelectedDevice] = useState(() => localStorage.getItem('micDeviceId') ?? '');
  const [selectedOutput, setSelectedOutput] = useState(() => localStorage.getItem('outputDeviceId') ?? '');
  const [testing, setTesting]               = useState(false);
  const [volume, setVolume]                 = useState(0);   // 0-100 для индикатора
  const testStreamRef  = useRef(null);
  const analyserRef    = useRef(null);
  const animFrameRef   = useRef(null);
  const gainNodeRef    = useRef(null);
  const audioCtxRef    = useRef(null);

  // Загружаем список микрофонов и наушников
  useEffect(() => {
    async function loadDevices() {
      try {
        // Нужно запросить разрешение, чтобы получить labels
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter(d => d.kind === 'audioinput'));
        setOutputDevices(all.filter(d => d.kind === 'audiooutput'));
      } catch {
        setDevices([]);
        setOutputDevices([]);
      }
    }
    loadDevices();
  }, []);

  // Сохраняем выбранный микрофон в localStorage
  useEffect(() => {
    localStorage.setItem('micDeviceId', selectedDevice);
  }, [selectedDevice]);

  // Сохраняем выбранный выход в localStorage
  useEffect(() => {
    localStorage.setItem('outputDeviceId', selectedOutput);
  }, [selectedOutput]);

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

  /** Сохранить ник и цвет */
  async function saveSettings() {
    try {
      if (!username.trim() || username.trim().length < 2) {
        setNickMsg({ type: 'err', text: 'Имя должно быть не короче 2 символов' });
        return;
      }
      setSavingNick(true);
      const { error } = await supabase.auth.updateUser({
        data: { username: username.trim(), user_color: color },
      });
      
      // Обновляем старые сообщения этого пользователя!
      let messagesError = null;
      if (user?.id && !error) {
        const [res, profileRes, dmRes] = await Promise.all([
          supabase
            .from('messages')
            .update({ username: `${username.trim()}@@${color}` })
            .eq('user_id', user.id),
          supabase
            .from('profiles')
            .update({ username: username.trim(), color: color })
            .eq('id', user.id),
          supabase
            .from('direct_messages')
            .update({ sender_username: username.trim(), sender_color: color })
            .eq('sender_id', user.id)
        ]);
        messagesError = res.error || profileRes.error || dmRes.error;
      }

      setSavingNick(false);
      
      if (error) {
        setNickMsg({ type: 'err', text: 'Ошибка сохранения профиля: ' + error.message });
      } else if (messagesError) {
        setNickMsg({ type: 'err', text: 'Профиль сохранен, но ошибка сообщений: ' + messagesError.message });
      } else {
        setNickMsg({ type: 'ok', text: 'Сохранено! Закрываем...' });
        onUsernameChange?.(username.trim(), color);
        setTimeout(() => {
          setNickMsg(null);
          onClose?.();
        }, 800);
      }
    } catch (err) {
      setSavingNick(false);
      setNickMsg({ type: 'err', text: 'Критическая ошибка: ' + err.message });
      alert(err.message);
    }
  }

  const { imageUrl, color: avatarColor } = getUserAvatar(username);

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
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">Привязанный Аватар</h3>
            <div className="flex items-center gap-5">
              {/* Preview */}
              <div className="w-[120px] h-[120px] rounded-full flex-shrink-0 bg-ds-bg shadow-[inset_0_0_15px_rgba(0,0,0,0.2)] overflow-hidden flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt="Аватар профиля"
                  className="w-full h-full object-cover select-none"
                />
              </div>
              <p className="text-xs text-ds-muted max-w-[200px] leading-relaxed">
                Твоя уникальная вылитая 3D-аватарка генерируется на основе имени.
              </p>
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
                onKeyDown={e => e.key === 'Enter' && saveSettings()}
                placeholder="Твоё имя в чате"
                className="flex-1 bg-ds-bg border border-ds-divider rounded-lg px-3 py-2 text-ds-text text-sm placeholder-ds-muted/60 focus:outline-none focus:border-ds-accent focus:ring-1 focus:ring-ds-accent transition-colors"
              />
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-10 h-10 p-0.5 rounded border border-ds-divider bg-transparent cursor-pointer"
                title="Цвет ника"
              />
              <button
                onClick={saveSettings}
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

          {/* ── Наушники / Динамики ── */}
          <section>
            <h3 className="text-xs font-semibold text-ds-muted uppercase tracking-wider mb-3">Наушники / Динамики</h3>

            {outputDevices.length === 0 ? (
              <p className="text-ds-muted text-xs bg-ds-bg border border-ds-divider/50 rounded-lg px-3 py-2">
                Устройства вывода недоступны (браузер или ОС не поддерживают выбор)
              </p>
            ) : (
              <>
                <select
                  value={selectedOutput}
                  onChange={e => setSelectedOutput(e.target.value)}
                  className="w-full bg-ds-bg border border-ds-divider rounded-lg px-3 py-2 text-ds-text text-sm focus:outline-none focus:border-ds-accent transition-colors appearance-none cursor-pointer"
                >
                  <option value="">По умолчанию (системный)</option>
                  {outputDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Устройство вывода ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <p className="text-ds-muted text-[11px] mt-2">
                  Выбранное устройство будет использоваться для воспроизведения голоса в звонках.
                </p>
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
