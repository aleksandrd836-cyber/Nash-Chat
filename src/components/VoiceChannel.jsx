import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getUserAvatar } from '../lib/avatar';
import { ScreenPickerModal } from './ScreenPickerModal';
import { Mic, Volume2, Users, MicOff, Headphones, LogOut, Monitor, Download, Maximize, X } from 'lucide-react';


function ScreenPlayer({ participant, stream, onClose }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [vol, setVol] = useState(1);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
  }, [vol]);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (el) {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5 group animate-fade-in mx-auto flex-shrink-0">
      <video ref={videoRef} autoPlay className="w-full h-auto max-h-[70vh] object-contain pointer-events-none" />
      
      {/* Top Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
        <button 
          onClick={toggleFullscreen}
          className="p-2.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-black/60 transition-all hover:scale-105"
          title="На весь экран"
        >
          <Maximize size={18} />
        </button>
        <button 
          onClick={onClose}
          className="p-2.5 bg-ds-red/20 backdrop-blur-md rounded-xl border border-ds-red/20 text-ds-red hover:bg-ds-red hover:text-white transition-all hover:scale-105"
          title="Закрыть стрим"
        >
          <X size={18} />
        </button>
      </div>

      {/* Overlay UI */}
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-ds-accent shadow-[0_0_8px_#00f0ff] animate-pulse" />
          <span className="text-white text-sm font-bold tracking-tight">{participant.username} транслирует</span>
        </div>
        
        <div className="flex items-center gap-2 ml-auto bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/5">
          <Volume2 className="w-4 h-4 text-white/60" />
          <input 
            type="range" min="0" max="1" step="0.05" value={vol} 
            onChange={e => setVol(Number(e.target.value))}
            className="w-24 h-1 rounded-full accent-ds-accent cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Панель голосового канала.
 * Отображается вместо TextChannel, когда выбран voice-канал.
 * Показывает участников, поддерживает контекстное меню с микшером громкости.
 */
export function VoiceChannel({ channel, user, username, userColor, voice, downloadUrl, ownerId }) {
  const {
    activeChannelId,
    participants,
    allParticipants,
    isMuted,
    isDeafened,
    isConnecting,
    isScreenSharing,
    remoteScreens,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    setParticipantVolume,
    startScreenShare,
    stopScreenShare,
    requestScreenView,
    voiceError,
    clearVoiceError,
    serverStatus,
  } = voice;

  const isInThisChannel = activeChannelId === channel?.id;

  // ── Контекстное меню ──
  const [ctxMenu, setCtxMenu] = useState(null); // { participant, x, y }
  const [volumes, setVolumes] = useState({});    // { [userId]: number 0-200 }
  const [quality, setQuality] = useState('720p'); // качество стрима
  const [showPicker, setShowPicker] = useState(false);
  const [watchedScreens, setWatchedScreens] = useState(new Set());
  const menuRef = useRef(null);

  // Сброс игнорируемых стримов при смене канала
  useEffect(() => {
    setWatchedScreens(new Set());
  }, [activeChannelId]);

  // Закрыть меню при клике вне его
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setCtxMenu(null);
      }
    }
    if (ctxMenu) window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [ctxMenu]);

  // Инициализировать громкость из localStorage и следить за изменениями
  useEffect(() => {
    const saved = {};
    participants.forEach(p => {
      const stored = localStorage.getItem(`vol_${p.userId}`);
      saved[p.userId] = stored !== null ? Number(stored) : 100;
    });
    setVolumes(prev => ({ ...prev, ...saved }));

    const handleVolChange = (e) => {
      setVolumes(prev => ({ ...prev, [e.detail.userId]: e.detail.volumePct }));
    };
    window.addEventListener('volumeChanged', handleVolChange);
    return () => window.removeEventListener('volumeChanged', handleVolChange);
  }, [participants]);

  const handleContextMenu = useCallback((e, participant) => {
    if (participant.userId === user?.id) return;
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setCtxMenu({ participant, x, y });
  }, [user?.id]);

  const handleVolumeChange = useCallback((userId, val) => {
    const num = Number(val);
    setVolumes(prev => ({ ...prev, [userId]: num }));
    setParticipantVolume?.(userId, num);
  }, [setParticipantVolume]);

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-ds-servers">
        <div className="flex flex-col items-center gap-6 animate-pulse-soft">
          <div className="w-24 h-24 rounded-full bg-ds-accent/10 flex items-center justify-center text-ds-accent vibe-glow-blue border border-ds-accent/20">
             <Volume2 size={48} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-ds-servers" onClick={() => setCtxMenu(null)}>
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-white/5 flex-shrink-0 bg-ds-sidebar/40 backdrop-blur-[40px] z-10 shadow-lg relative">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-ds-accent/20 to-transparent opacity-30" />
        <Mic size={20} className="text-ds-green vibe-glow-green relative z-10" />
        <span className="text-ds-text font-bold text-[15px]">{channel.name}</span>
        {isInThisChannel && (
          <div className="ml-2 flex items-center gap-4">
             <span className="flex items-center gap-1.5 text-ds-green text-[10px] font-bold uppercase tracking-widest leading-none vibe-glow-green">
              <span className="w-1.5 h-1.5 rounded-full bg-ds-green shadow-[0_0_8px_#23a559] animate-pulse" />
              ПОДКЛЮЧЕНО
            </span>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest leading-none ${
              serverStatus === 'online' ? 'text-ds-muted/40' : 
              serverStatus === 'reconnecting' ? 'text-amber-400 animate-pulse' : 'text-ds-red animate-pulse'
            }`}>
              <span className={`w-1 h-1 rounded-full ${
                serverStatus === 'online' ? 'bg-ds-muted/40' : 
                serverStatus === 'reconnecting' ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-ds-red shadow-[0_0_8px_#ff0000]'
              }`} />
              SERVER: {serverStatus}
            </span>
            {voice.ping !== null && serverStatus === 'online' && (
              <span className="text-ds-muted/60 text-[10px] font-mono font-bold uppercase tracking-widest animate-fade-in leading-none">
                PING — {voice.ping} MS
              </span>
            )}
          </div>
        )}
        
        {!window.electronAPI && (
          <a 
            href={downloadUrl}
            className="ml-auto flex items-center gap-2 px-4 py-1.5 bg-ds-accent text-black text-[12px] font-bold rounded-full transition-all shadow-[0_0_15px_rgba(0,240,255,0.4)] hover:scale-105 active:scale-95"
          >
            <Download size={14} />
            УСТАНОВИТЬ VIBE
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-start p-8 gap-10 overflow-y-auto no-scrollbar relative">
        
        {/* Error Alert */}
        {voiceError && (
          <div className="w-full max-w-2xl bg-ds-red/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col gap-4 animate-shake shadow-2xl z-50 mb-4">
             <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <MicOff className="text-white w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-black uppercase tracking-widest text-xs mb-1">Сетевая ошибка</h3>
                <p className="text-white/90 text-sm font-medium leading-relaxed font-mono break-all">
                  {voiceError}
                </p>
              </div>
            </div>
            <button 
              onClick={clearVoiceError}
              className="bg-white text-ds-red font-black py-2 rounded-xl text-[10px] uppercase tracking-[0.2em] hover:bg-white/90 transition-all active:scale-95"
            >
              ПОНЯТНО
            </button>
          </div>
        )}

        {/* Channel visual */}
        <div className="text-center">
          <div className="w-32 h-32 rounded-full bg-black/40 border-[3px] border-white/10 flex items-center justify-center mx-auto mb-8 shadow-2xl relative group">
            {isInThisChannel && <div className="absolute inset-0 rounded-full vibe-moving-glow opacity-30 blur-sm" />}
            <Volume2 size={56} className={`${isInThisChannel ? 'text-ds-accent vibe-glow-blue' : 'text-white/10'}`} strokeWidth={1} />
          </div>
          <h2 className="text-ds-text text-4xl font-black tracking-tighter mb-3">{channel.name}</h2>
          <div className="flex items-center justify-center gap-2 text-ds-muted">
            <Users size={16} />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em]">
              {isInThisChannel
                ? `${participants.length} УЧАСТНИКА В СЕТИ`
                : 'ГОЛОСОВОЙ КАНАЛ'}
            </p>
          </div>
        </div>

        {/* Participants grid */}
        {isInThisChannel && participants.length > 0 && (
          <div className="flex flex-wrap gap-8 justify-center w-full max-w-6xl">
            {participants.map((p) => {
              const { imageUrl } = getUserAvatar(p.username);
              const isMe = p.userId === user?.id;
              const vol = volumes[p.userId] ?? 100;
              const isWatched = watchedScreens.has(p.userId);
              const stream = remoteScreens[p.userId];
              const isActuallySpeaking = isMe ? voice.isSpeaking : p.isSpeaking;

              if (stream && isWatched) {
                return (
                  <ScreenPlayer 
                    key={`screen-${p.userId}`} 
                    participant={p} 
                    stream={stream} 
                    onClose={() => setWatchedScreens(prev => {
                      const next = new Set(prev);
                      next.delete(p.userId);
                      return next;
                    })}
                  />
                );
              }

              return (
                <div
                  key={p.userId}
                  className={`flex flex-col items-center gap-3 animate-fade-in select-none ${!isMe ? 'cursor-context-menu' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, p)}
                >
                  <div className={`relative w-[110px] h-[110px] rounded-full bg-black/40 shadow-inner overflow-hidden flex items-center justify-center transition-all duration-300
                    ${isActuallySpeaking ? 'ring-[5px] ring-ds-green shadow-[0_0_20px_rgba(35,165,89,0.5)] scale-105' : 'ring-1 ring-white/10 opacity-70'}
                    ${!isMe ? 'hover:ring-white/20 hover:opacity-100 hover:scale-105' : ''}`}
                  >
                    <img
                      src={imageUrl}
                      alt={p.username}
                      className="w-full h-full object-cover select-none"
                    />
                  </div>
                  <div className="text-center min-w-0 w-full">
                      <p className={`font-black text-sm truncate flex items-center justify-center gap-2 px-2 transition-colors ${isActuallySpeaking ? 'text-ds-green' : 'text-ds-text'}`} style={{ color: p.userId === ownerId ? '#ff4444' : '' }}>
                        {p.username}
                        {['43751682-690e-4934-a9f2-7300a816b92d', '1380ae20-201a-4c77-aed3-93b3cb96f8d5'].includes(p.userId) && (
                          <span className="px-2 py-0.5 rounded-md bg-ds-accent/10 border border-ds-accent/30 text-[9px] font-black text-ds-accent uppercase tracking-widest vibe-glow-blue shadow-[0_0_10px_rgba(0,240,255,0.2)] vibe-creator-badge">
                            СОЗДАТЕЛЬ
                          </span>
                        )}
                      </p>
                    {p.isScreenSharing && !isMe && !isWatched && (
                      <button 
                        onClick={() => {
                          setWatchedScreens(prev => new Set(prev).add(p.userId));
                        }}
                        className="mt-2 bg-ds-accent text-black px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-ds-accent/20 vibe-glow-blue"
                      >
                        СМОТРЕТЬ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-6 w-full max-w-sm mt-4">
          {!isInThisChannel ? (
            <button
               id="join-voice-btn"
               onClick={() => joinVoiceChannel(channel.id, user, username, userColor)}
               disabled={isConnecting}
               className="w-full py-5 rounded-[2rem] bg-ds-accent text-black font-black uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(0,240,255,0.4)] hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed vibe-glow-blue relative overflow-hidden group"
             >
               <div className="absolute inset-0 vibe-moving-glow opacity-40 group-hover:opacity-60 transition-opacity" />
               {isConnecting ? (
                 <>
                   <div className="w-5 h-5 border-[3px] border-black border-t-transparent rounded-full animate-spin z-10" />
                   ПОДКЛЮЧЕНИЕ...
                 </>
               ) : (
                 <>
                   <Mic size={22} strokeWidth={3} className="z-10" />
                   <span className="z-10">ВОЙТИ В КАНАЛ</span>
                 </>
               )}
             </button>
          ) : (
            <div className="flex flex-col gap-4 w-full">
              <div className="flex gap-2.5 w-full">
                <button
                  id="mute-btn"
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-2xl transition-all duration-300 flex items-center justify-center border
                    ${isMuted
                      ? 'bg-ds-red/10 border-ds-red/30 text-ds-red vibe-glow-red'
                      : 'bg-ds-sidebar/40 border-white/10 text-ds-muted hover:text-ds-accent hover:border-ds-accent/30 hover:bg-ds-accent/5 hover:vibe-glow-blue'
                    }`}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
  
                <button
                  id="deafen-btn"
                  onClick={toggleDeafen}
                  className={`w-14 h-14 rounded-2xl transition-all duration-300 flex items-center justify-center border
                    ${isDeafened
                      ? 'bg-ds-red/10 border-ds-red/30 text-ds-red vibe-glow-red'
                      : 'bg-ds-sidebar/40 border-white/10 text-ds-muted hover:text-ds-accent hover:border-ds-accent/30 hover:bg-ds-accent/5 hover:vibe-glow-blue'
                    }`}
                >
                  <div className="slashed-container">
                    <Headphones size={24} />
                    {isDeafened && <div className="slashed-icon-line" style={{ height: '2px', width: '32px' }} />}
                  </div>
                </button>
 
                <button
                  id="leave-voice-btn"
                  onClick={leaveVoiceChannel}
                  className="flex-1 h-14 rounded-2xl bg-ds-red/10 hover:bg-ds-red text-ds-red hover:text-white border border-ds-red/20 font-black uppercase tracking-[0.15em] text-[12px] transition-all duration-300 flex items-center justify-center gap-3 group"
                >
                  <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                  ВЫЙТИ
                </button>
              </div>

              {!isScreenSharing ? (
                <div className="flex items-center gap-3 w-full">
                  <div className="relative group flex-1">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none group-focus-within:text-ds-accent transition-colors">
                      <Download size={14} className="opacity-40" />
                    </div>
                    <select 
                      value={quality} 
                      onChange={e => setQuality(e.target.value)}
                      className={`w-full h-12 pl-10 pr-10 bg-ds-sidebar/40 hover:bg-ds-sidebar/60 border border-white/10 hover:border-ds-accent/30 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-ds-text outline-none appearance-none cursor-pointer transition-all backdrop-blur-md ${
                        quality === '1080p' ? 'shadow-[0_0_15px_rgba(0,240,255,0.2)] border-ds-accent/40' : ''
                      }`}
                    >
                      <option value="1080p">1080P • 60 FPS • ULTRA</option>
                      <option value="720p">720P • 30 FPS • HD</option>
                      <option value="480p">480P • 30 FPS • SD</option>
                    </select>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-ds-muted/40 group-hover:text-ds-accent/60 transition-colors">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (window.electronAPI) {
                        setShowPicker(true);
                      } else {
                        startScreenShare(quality, user);
                      }
                    }}
                    className="flex-[1.5] h-12 rounded-2xl bg-ds-accent text-black font-black uppercase tracking-[0.2em] text-[11px] transition-all flex items-center justify-center gap-3 shadow-lg shadow-ds-accent/20 hover:scale-[1.03] active:scale-95 group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 vibe-moving-glow opacity-30 group-hover:opacity-50 transition-opacity" />
                    <Monitor size={18} strokeWidth={3} className="z-10" />
                    <span className="z-10">ТРАНСЛЯЦИЯ</span>
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => stopScreenShare(user)}
                  className="w-full h-12 rounded-2xl bg-ds-red text-white font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(237,66,69,0.4)] animate-pulse"
                >
                  <Monitor size={18} />
                  ОСТАНОВИТЬ СТРИМ
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals and Context Menu */}
      {showPicker && (
        <ScreenPickerModal 
          onClose={() => setShowPicker(false)}
          onSelect={(sourceId, withAudio) => {
            setShowPicker(false);
            startScreenShare(quality, user, sourceId, withAudio);
          }}
        />
      )}

      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-ds-servers/95 border border-white/10 rounded-3xl shadow-2xl p-6 w-64 animate-fade-in backdrop-blur-2xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-4 mb-5 pb-4 border-b border-white/5">
            <div className="w-12 h-12 rounded-full bg-black/40 overflow-hidden border border-white/10">
              <img
                src={getUserAvatar(ctxMenu.participant.username).imageUrl}
                alt={ctxMenu.participant.username}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-ds-text font-black text-base truncate" style={{ color: ctxMenu.participant.userId === ownerId ? '#ff4444' : 'var(--ds-text)' }}>
              {ctxMenu.participant.username}
              {['43751682-690e-4934-a9f2-7300a816b92d', '1380ae20-201a-4c77-aed3-93b3cb96f8d5'].includes(ctxMenu.participant.userId) && (
                <span className="ml-2 px-1.5 py-0.5 rounded-md bg-ds-accent/10 border border-ds-accent/30 text-[8px] font-black text-ds-accent uppercase tracking-tighter vibe-glow-blue align-middle vibe-creator-badge">
                  СОЗДАТЕЛЬ
                </span>
              )}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-ds-muted text-[10px] font-black uppercase tracking-[0.2em]">Громкость</p>
              <span className="text-ds-accent text-[11px] font-black tabular-nums vibe-glow-blue border border-ds-accent/30 px-2 py-0.5 rounded-full">
                {volumes[ctxMenu.participant.userId] ?? 100}%
              </span>
            </div>

            <input
              type="range" min="0" max="200" step="5"
              value={volumes[ctxMenu.participant.userId] ?? 100}
              onChange={e => handleVolumeChange(ctxMenu.participant.userId, e.target.value)}
              className="w-full h-1.5 rounded-full accent-ds-accent cursor-pointer bg-white/5"
            />

            <div className="grid grid-cols-5 gap-1.5">
              {[0, 50, 100, 150, 200].map(v => (
                <button
                  key={v}
                  onClick={() => handleVolumeChange(ctxMenu.participant.userId, v)}
                  className={`py-2 rounded-xl text-[9px] font-black transition-all border ${
                    (volumes[ctxMenu.participant.userId] ?? 100) === v
                      ? 'bg-ds-accent border-ds-accent text-black vibe-glow-blue'
                      : 'bg-white/5 border-white/10 text-white/30 hover:text-white hover:border-white/20'
                  }`}
                >
                  {v === 0 ? 'MUTE' : v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
