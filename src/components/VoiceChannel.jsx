import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getUserAvatar } from '../lib/avatar';
import { ScreenPickerModal } from './ScreenPickerModal';
import { Mic, Volume2, Users, MicOff, Headphones, LogOut, Monitor, Download } from 'lucide-react';


function ScreenPlayer({ participant, stream }) {
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

  return (
    <div className="relative w-full max-w-4xl bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5 group animate-fade-in mx-auto flex-shrink-0">
      <video ref={videoRef} autoPlay className="w-full h-auto max-h-[70vh] object-contain" />
      
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
export function VoiceChannel({ channel, user, username, userColor, voice, downloadUrl }) {
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
  } = voice;

  const isInThisChannel = activeChannelId === channel?.id;

  // ── Контекстное меню ──
  const [ctxMenu, setCtxMenu] = useState(null); // { participant, x, y }
  const [volumes, setVolumes] = useState({});    // { [userId]: number 0-200 }
  const [quality, setQuality] = useState('720p'); // качество стрима
  const [showPicker, setShowPicker] = useState(false);
  const menuRef = useRef(null);

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
      <div className="flex-1 flex items-center justify-center bg-[#050505]">
        <p className="text-white/20 font-bold uppercase tracking-widest text-xs">Выбери канал</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#050505]" onClick={() => setCtxMenu(null)}>
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-white/5 flex-shrink-0 bg-black/40 backdrop-blur-md z-10 shadow-lg">
        <Mic size={20} className="text-ds-accent vibe-glow-blue" />
        <span className="text-white font-bold text-[15px]">{channel.name}</span>
        {isInThisChannel && (
          <span className="ml-2 flex items-center gap-1.5 text-ds-accent text-[10px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-ds-accent shadow-[0_0_8px_#00f0ff] animate-pulse" />
            ПОДКЛЮЧЕНО
          </span>
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-10 overflow-y-auto no-scrollbar">
        {/* Channel visual */}
        <div className="text-center">
          <div className="w-32 h-32 rounded-full bg-black/40 border-[3px] border-white/10 flex items-center justify-center mx-auto mb-8 shadow-2xl relative group">
            {isInThisChannel && <div className="absolute inset-0 rounded-full vibe-moving-glow opacity-30 blur-sm" />}
            <Volume2 size={56} className={`${isInThisChannel ? 'text-ds-accent vibe-glow-blue' : 'text-white/10'}`} strokeWidth={1} />
          </div>
          <h2 className="text-white text-4xl font-black tracking-tighter mb-3">{channel.name}</h2>
          <div className="flex items-center justify-center gap-2 text-white/30">
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
              const stream = remoteScreens[p.userId];

              if (stream) {
                return <ScreenPlayer key={`screen-${p.userId}`} participant={p} stream={stream} />;
              }

              return (
                <div
                  key={p.userId}
                  className={`flex flex-col items-center gap-3 animate-fade-in select-none ${!isMe ? 'cursor-context-menu' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, p)}
                >
                  <div className={`relative w-[110px] h-[110px] rounded-full bg-black/40 shadow-inner overflow-hidden flex items-center justify-center transition-all duration-300
                    ${p.isSpeaking ? 'ring-[5px] ring-ds-accent vibe-glow-blue scale-105' : 'ring-1 ring-white/10 opacity-70'}
                    ${!isMe ? 'hover:ring-white/20 hover:opacity-100 hover:scale-105' : ''}`}
                  >
                    <img
                      src={imageUrl}
                      alt={p.username}
                      className="w-full h-full object-cover select-none"
                    />
                    {!isMe && vol !== 100 && (
                      <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/80 flex items-center justify-center border border-white/10 backdrop-blur-md">
                        {vol === 0 ? (
                           <MicOff size={11} className="text-ds-red" />
                        ) : (
                           <Volume2 size={11} className="text-ds-accent" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-center min-w-0 w-full">
                    <p className="text-white font-bold text-sm truncate px-2 drop-shadow-md" style={p.color ? { color: p.color } : {}}>
                      {p.username}
                    </p>
                    {!isMe && vol !== 100 && (
                      <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-0.5">{vol}%</p>
                    )}
                    {p.isScreenSharing && !isMe && !stream && (
                      <button 
                        onClick={() => requestScreenView(p.userId)}
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
                      : 'bg-[#121212] border-white/5 text-white/50 hover:text-ds-accent hover:border-ds-accent/30 hover:bg-ds-accent/5 hover:vibe-glow-blue'
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
                      : 'bg-[#121212] border-white/5 text-white/50 hover:text-ds-accent hover:border-ds-accent/30 hover:bg-ds-accent/5 hover:vibe-glow-blue'
                    }`}
                >
                  <Headphones size={24} />
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
                <div className="flex gap-2.5 w-full">
                  <div className="bg-[#121212] rounded-2xl border border-white/5 px-4 flex items-center group focus-within:border-ds-accent/30 transition-all flex-1">
                    <select 
                      value={quality} 
                      onChange={e => setQuality(e.target.value)}
                      className="bg-transparent text-white/40 text-[11px] font-black uppercase tracking-widest outline-none cursor-pointer appearance-none w-full h-12"
                    >
                      <option value="1080p">1080P</option>
                      <option value="720p">720P</option>
                      <option value="480p">480P</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => {
                      if (window.electronAPI) {
                        setShowPicker(true);
                      } else {
                        startScreenShare(quality, user);
                      }
                    }}
                    className="flex-[2] h-12 rounded-2xl bg-ds-accent/5 hover:bg-ds-accent/10 text-ds-accent border border-ds-accent/20 font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-2"
                  >
                    <Monitor size={18} />
                    ТРАНСЛЯЦИЯ
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
          className="fixed z-50 bg-[#0f0f0f]/95 border border-white/10 rounded-3xl shadow-2xl p-6 w-64 animate-fade-in backdrop-blur-2xl"
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
            <p className="text-white font-black text-base truncate" style={ctxMenu.participant.color ? { color: ctxMenu.participant.color } : {}}>
              {ctxMenu.participant.username}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.2em]">Громкость</p>
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
