import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getUserAvatar } from '../lib/avatar';
import { notifications } from '../lib/notifications';
import { updateCurrentUserProfile } from '../lib/profile';
import { HotkeysSettings } from './HotkeysSettings';
import { 
  X, User, Mic, Headphones, Bell, Monitor, LogOut, Check, AlertTriangle, 
  RefreshCw, Download, ChevronRight, Volume2, Shield,  Sun, Moon, Sparkles, Keyboard
} from 'lucide-react';

/**
 * Модальное окно настроек пользователя.
 * Полный редизайн в стиле VIBE.
 */
export function SettingsModal({ user, username: initialUsername, userColor, onClose, onUsernameChange, onSignOut, theme, onThemeChange }) {
  // ── Ник и Цвет ──
  const [username, setUsername]   = useState(initialUsername || '');
  const [color, setColor]         = useState(userColor || '#ffffff');
  const [savingNick, setSavingNick] = useState(false);
  const [nickMsg, setNickMsg]      = useState(null); // { type: 'ok'|'err', text }

  // ── Микрофон ──
  const [devices, setDevices]               = useState([]);
  const [outputDevices, setOutputDevices]   = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(() => localStorage.getItem('micDeviceId') ?? '');
  const [selectedOutput, setSelectedOutput] = useState(() => localStorage.getItem('outputDeviceId') ?? '');
  const [testing, setTesting]               = useState(false);
  const [volume, setVolume]                 = useState(0);
  const testStreamRef  = useRef(null);
  const analyserRef    = useRef(null);
  const animFrameRef   = useRef(null);
  const audioCtxRef    = useRef(null);
  const [notifSettings, setNotifSettings] = useState(() => notifications.getSettings());
  
  // ── Шумоподавление ──
  const [noiseSuppression, setNoiseSuppression] = useState(() => localStorage.getItem('vibe_noise_suppression') === 'true');

  const handleToggleNoiseSuppression = () => {
    const newVal = !noiseSuppression;
    setNoiseSuppression(newVal);
    localStorage.setItem('vibe_noise_suppression', newVal ? 'true' : 'false');
    if (window.confirm('Для применения настроек шумоподавления нужно перезагрузить приложение. Перезагрузить сейчас?')) {
       window.location.reload();
    }
  };


  // ── Обновление Приложения ──
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateErrorMsg, setUpdateErrorMsg] = useState(null);
  const appVersion = window.electronAPI?.version || 'Web Версия';

  useEffect(() => {
    async function loadDevices() {
      try {
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

  useEffect(() => {
    localStorage.setItem('micDeviceId', selectedDevice);
  }, [selectedDevice]);

  useEffect(() => {
    localStorage.setItem('outputDeviceId', selectedOutput);
  }, [selectedOutput]);

  useEffect(() => () => stopTest(), []);

  const handleCheckUpdate = async () => {
    if (!window.electronAPI) return;
    setUpdateStatus('checking');
    setUpdateErrorMsg(null);
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (!res) setUpdateStatus('idle');
      setTimeout(() => setUpdateStatus(s => s === 'checking' ? 'idle' : s), 4000);
    } catch (err) {
      setUpdateStatus('error');
      setUpdateErrorMsg(err.message);
    }
  };

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
      src.connect(ctx.destination);

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

  function drawVolume(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(Math.min(100, Math.round(avg * 2.5)));
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }

  function stopTest() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    testStreamRef.current?.getTracks().forEach(t => t.stop());
    testStreamRef.current = null;
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    audioCtxRef.current = null;
    setTesting(false);
    setVolume(0);
  }

  async function saveSettings() {
    try {
      const cleanUsername = username.trim();

      if (!cleanUsername || cleanUsername.length < 2) {
        setNickMsg({ type: 'err', text: 'Минимум 2 символа' });
        return;
      }

      if (!user?.id) {
        setNickMsg({ type: 'err', text: '������������ �� ������' });
        return;
      }

      setSavingNick(true);
      const result = await updateCurrentUserProfile(user.id, cleanUsername, color);

      setSavingNick(false);
      if (!result.ok) {
        setNickMsg({ type: 'err', text: result.message || 'Ошибка сохранения' });
      } else {
        const nextUsername = result.profile?.username ?? cleanUsername;
        const nextColor = result.profile?.color ?? color ?? null;
        setUsername(nextUsername);
        setColor(nextColor ?? '#ffffff');
        setNickMsg({ type: 'ok', text: 'Сохранено!' });
        onUsernameChange?.(nextUsername, nextColor);
        setTimeout(() => onClose?.(), 600);
      }
    } catch (err) {
      setSavingNick(false);
      setNickMsg({ type: 'err', text: err.message });
    }
  }

  const updateNotifSetting = (key, val) => {
    notifications.updateSetting(key, val);
    setNotifSettings(notifications.getSettings());
  };

  const { imageUrl } = getUserAvatar(username);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        style={{ backgroundColor: 'rgb(var(--ds-servers))' }}
        className="vibe-panel-strong rounded-[2.5rem] w-full max-w-2xl h-[85vh] shadow-[0_0_150px_rgba(0,0,0,1)] border border-white/10 overflow-hidden animate-slide-up flex flex-col relative"
      >
        <div className="absolute top-0 inset-x-0 h-1 vibe-moving-glow opacity-30 pointer-events-none" />
        
        {/* Header */}
        <div 
          style={{ backgroundColor: 'rgb(var(--ds-bg))' }}
          className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-white/5"
        >
          <div className="flex flex-col">
            <h2 className="text-ds-text font-black text-xl uppercase tracking-tighter">Настройки</h2>
            <p className="text-[10px] text-ds-muted font-black uppercase tracking-[0.2em] -mt-0.5">Управление аккаунтом VIBE</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-white/5 transition-all active:scale-90"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-12">
          
          {/* Profile Section */}
          <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="space-y-6">
              <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em]">Мой профиль</h3>
              
              <div className="vibe-panel flex items-center gap-8 p-6 rounded-[2.5rem] relative group">
                <div className="absolute inset-0 vibe-moving-glow opacity-0 group-hover:opacity-5 transition-opacity rounded-3xl pointer-events-none" />
                <div className="relative">
                  <div className="w-[120px] h-[120px] rounded-[3rem] bg-black/40 overflow-hidden border-2 border-white/10 shadow-2xl transition-transform group-hover:scale-105 duration-500">
                    <img src={imageUrl} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-ds-accent flex items-center justify-center text-black shadow-lg vibe-glow-blue border-4 border-ds-bg">
                    <Check size={14} strokeWidth={4} />
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="space-y-2 px-2">
                    <p className="text-[10px] font-black text-ds-muted uppercase tracking-widest">Имя пользователя</p>
                    <div className="flex gap-2">
                      <input
                        type="text" value={username} onChange={e => setUsername(e.target.value)}
                        className="vibe-form-field flex-1 rounded-2xl px-4 py-3 text-sm font-bold"
                      />
                    </div>
                  </div>
                  <button
                    onClick={saveSettings} disabled={savingNick}
                    className="vibe-primary-button w-full py-3 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                  >
                    {savingNick ? 'ПРИМЕНЕНИЕ...' : 'СОХРАНИТЬ ИЗМЕНЕНИЯ'}
                  </button>
                  {nickMsg && (
                    <p className={`text-[10px] font-black uppercase tracking-widest text-center ${nickMsg.type === 'ok' ? 'text-ds-accent' : 'text-ds-red'}`}>
                      {nickMsg.text}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Audio Section */}
          <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="space-y-6">
              <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em]">Настройки звука</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2 font-mono">Микрофон</p>
                  <div className="relative">
                    <select
                      value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}
                      className="vibe-form-field w-full rounded-2xl px-4 py-3 text-xs font-bold appearance-none cursor-pointer"
                    >
                      <option value="">(Системный по умолчанию)</option>
                      {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Микрофон`}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-ds-muted uppercase tracking-[0.2em] ml-2 font-mono">Вывод</p>
                  <div className="relative">
                    <select
                      value={selectedOutput} onChange={e => setSelectedOutput(e.target.value)}
                      className="vibe-form-field w-full rounded-2xl px-4 py-3 text-xs font-bold appearance-none cursor-pointer"
                    >
                      <option value="">(Системный по умолчанию)</option>
                      {outputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Устройство вывода`}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Mic Test Visualization */}
              <div className="vibe-panel p-8 rounded-[2rem] relative overflow-hidden group">
                 <div className="absolute inset-0 vibe-moving-glow opacity-10 pointer-events-none" />
                 <div className="relative z-10 flex flex-col items-center">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-[3px] mb-4
                      ${testing ? 'bg-ds-accent/10 border-ds-accent vibe-glow-blue' : 'bg-white/5 border-white/10 text-ds-muted'}`}
                    >
                      <Mic size={32} className={testing ? 'text-ds-accent' : ''} />
                    </div>
                    <button
                      onClick={testing ? stopTest : startTest}
                      className={`px-8 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all
                        ${testing ? 'bg-ds-red text-white shadow-lg shadow-ds-red/20' : 'bg-ds-accent/10 text-ds-accent border border-ds-accent/30 hover:bg-ds-accent/20'}`}
                    >
                      {testing ? 'ЗАВЕРШИТЬ ТЕСТ' : 'ПРОВЕРИТЬ МИКРОФОН'}
                    </button>
                    
                    <div className="w-full max-w-xs mt-8 space-y-2">
                      <div className="flex justify-between font-mono text-[9px] text-ds-muted uppercase font-black">
                        <span>Уровень сигнала</span>
                        <span className={testing && volume > 0 ? 'text-ds-accent' : ''}>{volume}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-75 rounded-full ${volume > 80 ? 'bg-ds-red' : 'bg-ds-accent vibe-glow-blue'}`}
                          style={{ width: `${volume}%` }}
                        />
                      </div>
                    </div>
                 </div>
              </div>

              <div className="space-y-3">
                 <div className="p-6 bg-ds-accent/5 border border-ds-accent/20 rounded-3xl flex items-center justify-between group hover:bg-ds-accent/10 transition-all">
                    <div className="flex items-center gap-4">
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${noiseSuppression ? 'bg-ds-accent/20 border-ds-accent text-ds-accent vibe-glow-blue' : 'bg-white/5 border-white/10 text-ds-muted'}`}>
                          <Sparkles size={24} />
                       </div>
                       <div>
                         <p className="text-ds-text font-black uppercase tracking-widest text-[11px] mb-1 flex items-center gap-2">
                           AI Шумоподавление 
                           {noiseSuppression && <span className="px-1.5 py-0.5 rounded-full bg-ds-accent/20 text-ds-accent text-[8px] border border-ds-accent/30 animate-pulse">Active</span>}
                         </p>
                         <p className="text-[9px] text-ds-muted font-bold uppercase tracking-wider">Интеллектуальный фильтр RNNoise</p>
                       </div>
                    </div>
                    
                    <button 
                       onClick={handleToggleNoiseSuppression}
                       className={`relative w-14 h-7 rounded-full transition-all duration-500 p-1 ${noiseSuppression ? 'bg-ds-accent vibe-glow-blue' : 'bg-white/10'}`}
                    >
                       <div className={`w-5 h-5 rounded-full bg-white shadow-lg transition-transform duration-500 transform ${noiseSuppression ? 'translate-x-7' : 'translate-x-0'}`} />
                    </button>
                 </div>

                 {noiseSuppression && (
                   <div className="vibe-panel p-6 rounded-3xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                     <div className="flex justify-between items-center px-1">
                       <div className="flex items-center gap-2">
                          <p className="text-[10px] font-black text-ds-muted uppercase tracking-[0.2em] font-mono">Сила подавления</p>
                          <span className="text-[10px] font-black text-ds-accent font-mono">{localStorage.getItem('vibe_noise_intensity') || 100}%</span>
                       </div>
                     </div>
                     <div className="relative h-6 flex items-center group">
                        <div className="absolute w-full h-1 bg-white/5 rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-ds-accent vibe-glow-blue transition-all"
                             style={{ width: `${localStorage.getItem('vibe_noise_intensity') || 100}%` }}
                           />
                        </div>
                        <input 
                          type="range" min="0" max="100" 
                          value={localStorage.getItem('vibe_noise_intensity') || 100}
                          onChange={(e) => {
                            const val = e.target.value;
                            localStorage.setItem('vibe_noise_intensity', val);
                            window.dispatchEvent(new CustomEvent('vibe-update-ns-intensity', { detail: { value: val } }));
                            setNoiseSuppression(true);
                          }}
                          className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div 
                           className="absolute w-3.5 h-3.5 bg-white rounded-full border-2 border-ds-accent shadow-lg transition-all pointer-events-none"
                           style={{ left: `calc(${localStorage.getItem('vibe_noise_intensity') || 100}% - 7px)` }}
                        />
                     </div>
                     <p className="text-[9px] text-ds-muted font-bold italic opacity-60">Меньшая интенсивность сохраняет больше «жизни» в голосе.</p>
                   </div>
                 )}
              </div>
            </div>
          </section>
          
          {/* Appearance Section */}
          <section className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
            <div className="flex items-center gap-2 mb-6">
              <Sun size={16} className="text-ds-accent" />
              <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em]">Внешний вид</h3>
            </div>
            
            <div className="vibe-panel p-6 rounded-3xl flex items-center justify-between group">
               <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${theme === 'light' ? 'bg-ds-accent/10 border-ds-accent text-ds-accent vibe-glow-blue' : 'bg-white/5 border-white/10 text-ds-muted'}`}>
                     {theme === 'light' ? <Sun size={24} /> : <Moon size={24} />}
                  </div>
                  <div>
                    <p className="text-ds-text font-black uppercase tracking-widest text-[11px] mb-1">Светлая тема</p>
                    <p className="text-[9px] text-ds-muted font-bold uppercase tracking-wider">Переключить визуальный режим VIBE</p>
                  </div>
               </div>
               
               <button 
                  onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
                  className={`relative w-14 h-7 rounded-full transition-all duration-500 p-1 ${theme === 'light' ? 'bg-ds-accent vibe-glow-blue' : 'bg-white/10 overflow-hidden'}`}
               >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-lg transition-transform duration-500 transform ${theme === 'light' ? 'translate-x-7' : 'translate-x-0'}`} />
                  {theme !== 'light' && <div className="absolute inset-0 vibe-moving-glow opacity-30 pointer-events-none" />}
               </button>
            </div>
          </section>

          {/* Notifications Section */}
          <section className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-2 mb-6">
              <Bell size={16} className="text-ds-accent" />
              <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em]">Уведомления</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'enabled_join', label: 'Вход участника' },
                { key: 'enabled_leave', label: 'Выход участника' },
                { key: 'enabled_stream', label: 'Трансляция экрана' },
                { key: 'enabled_dm', label: 'Личные сообщения' },
                { key: 'enabled_mute', label: 'Выкл. микрофон' },
                { key: 'enabled_unmute', label: 'Вкл. микрофон' },
              ].map(item => (
                <label key={item.key} className="vibe-panel flex items-center justify-between px-5 py-4 rounded-2xl cursor-pointer hover:border-ds-accent/20 transition-all group">
                  <span className="text-[11px] font-bold text-ds-text/80 group-hover:text-ds-text transition-colors">{item.label}</span>
                  <div className="relative inline-flex items-center">
                    <input
                      type="checkbox" checked={notifSettings[item.key]}
                      onChange={e => updateNotifSetting(item.key, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white/40 peer-checked:after:bg-black after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-ds-accent peer-checked:vibe-glow-blue" />
                  </div>
                </label>
              ))}
            </div>
          </section>

          <HotkeysSettings />

          {/* App Info Section */}
          {window.electronAPI && (
            <section className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
               <div className="flex items-center gap-2 mb-6">
                <Monitor size={16} className="text-ds-accent" />
                <h3 className="text-[11px] font-black text-ds-muted uppercase tracking-[0.3em]">Приложение</h3>
              </div>
              <div className="vibe-panel p-6 rounded-3xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-ds-muted uppercase tracking-widest mb-1">Версия сборки</p>
                  <p className="text-ds-text font-mono text-sm">{appVersion}</p>
                </div>
                <button
                   onClick={handleCheckUpdate}
                   className={`vibe-secondary-button px-5 py-2.5 text-[10px] font-black uppercase tracking-widest
                    ${updateStatus === 'checking' ? 'opacity-50 cursor-wait' : 'hover:text-ds-text'}`}
                >
                  {updateStatus === 'checking' ? 'ПРОВЕРКА...' : 'ПРОВЕРИТЬ ОБНОВЛЕНИЯ'}
                </button>
              </div>
            </section>
          )}

          {/* Logout Section */}
          <section className="pt-8 border-t border-white/5 animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <button
              onClick={onSignOut}
              className="w-full py-5 rounded-[2rem] border-2 border-ds-red/20 text-ds-red font-black uppercase tracking-[0.2em] text-xs transition-all hover:bg-ds-red hover:text-white hover:border-ds-red active:scale-95 flex items-center justify-center gap-3 group"
            >
              <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
              ВЫЙТИ ИЗ АККАУНТА
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}


