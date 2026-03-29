import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getUserAvatar } from '../lib/avatar';


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
      // 0..1 range
      videoRef.current.volume = vol;
    }
  }, [vol]);

  return (
    <div className="relative w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-2xl ring-2 ring-ds-divider group animate-fade-in mx-auto flex-shrink-0">
      <video ref={videoRef} autoPlay className="w-full h-auto max-h-[70vh] object-contain" />
      
      {/* Overlay UI */}
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-ds-red animate-pulse" />
          <span className="text-white text-sm font-semibold">{participant.username} транслирует</span>
        </div>
        
        <div className="flex items-center gap-2 ml-auto">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
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
export function VoiceChannel({ channel, user, username, userColor, voice }) {
  const {
    activeChannelId,
    participants,
    allParticipants,
    isMuted,
    isConnecting,
    isScreenSharing,
    remoteScreens,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
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
    // Не показывать меню для себя
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
      <div className="flex-1 flex items-center justify-center bg-ds-bg">
        <p className="text-ds-muted">Выбери канал</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-ds-bg" onClick={() => setCtxMenu(null)}>
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-ds-divider/50 flex-shrink-0 bg-ds-bg/80 backdrop-blur-sm">
        <svg className="text-ds-muted w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
        <span className="text-ds-text font-semibold text-sm">{channel.name}</span>
        {isInThisChannel && (
          <span className="ml-auto flex items-center gap-1.5 text-ds-green text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-ds-green animate-pulse" />
            Подключён
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        {/* Channel visual */}
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-ds-sidebar border-4 border-ds-divider flex items-center justify-center mx-auto mb-4">
            <svg className={`w-12 h-12 ${isInThisChannel ? 'text-ds-green animate-pulse-soft' : 'text-ds-muted'}`}
              fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </div>
          <h2 className="text-ds-text text-2xl font-bold">{channel.name}</h2>
          <p className="text-ds-muted text-sm mt-1">
            {isInThisChannel
              ? `${participants.length} участник${participants.length === 1 ? '' : participants.length < 5 ? 'а' : 'ов'}`
              : 'Голосовой канал'}
          </p>
        </div>

        {/* Participants grid */}
        {isInThisChannel && participants.length > 0 && (
          <div className="flex flex-wrap gap-6 justify-center w-full max-w-6xl">
            {participants.map((p) => {
              const { imageUrl } = getUserAvatar(p.username);
              const isMe = p.userId === user?.id;
              const vol = volumes[p.userId] ?? 100;
              const stream = remoteScreens[p.userId];

              // Если есть видеопоток — рендерим плеер
              if (stream) {
                return <ScreenPlayer key={`screen-${p.userId}`} participant={p} stream={stream} />;
              }

              return (
                <div
                  key={p.userId}
                  className={`flex flex-col items-center gap-2 animate-fade-in select-none ${!isMe ? 'cursor-context-menu' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, p)}
                  title={!isMe ? 'ПКМ для настройки громкости' : ''}
                >
                  <div className={`relative w-[96px] h-[96px] rounded-full bg-ds-bg shadow-[inset_0_0_15px_rgba(0,0,0,0.2)] overflow-hidden flex items-center justify-center
                    ${!isMe ? 'hover:ring-2 hover:ring-ds-accent/60 transition-all duration-150' : ''}`}
                  >
                    <img
                      src={imageUrl}
                      alt={p.username}
                      className="w-[144px] h-[144px] max-w-none select-none"
                    />
                    {/* Иконка громкости у не-себя */}
                    {!isMe && vol !== 100 && (
                      <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-ds-servers/90 flex items-center justify-center">
                        {vol === 0 ? (
                          <svg className="w-3 h-3 text-ds-red" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0015 19.73L18.73 23.5 20 22.23l-18-18zM12 4L9.91 6.09 12 8.18V4z"/>
                          </svg>
                        ) : (
                          <svg className="w-3 h-3 text-ds-yellow" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                  <p
                    className="text-ds-text font-semibold text-sm truncate w-full text-center drop-shadow-md"
                    style={p.color ? { color: p.color } : {}}
                  >
                    {p.username}
                  </p>
                  {/* Маленький индикатор громкости под именем */}
                  {!isMe && vol !== 100 && (
                    <p className="text-[10px] text-ds-muted -mt-1 w-full text-center">{vol}%</p>
                  )}
                  {/* Кнопка запроса стрима */}
                  {p.isScreenSharing && !isMe && !stream && (
                    <button 
                      onClick={() => requestScreenView(p.userId)}
                      className="mt-1 bg-ds-accent text-white px-3 py-1 rounded-full text-[10px] uppercase font-bold hover:bg-ds-accent/90 shadow-lg shadow-ds-accent/20 animate-pulse-soft"
                    >
                      Смотреть стрим
                    </button>
                  )}
                  {/* Индикатор для самого стримера */}
                  {isMe && isScreenSharing && (
                    <span className="mt-1 text-ds-green text-[10px] uppercase font-bold animate-pulse-soft">
                      Идет трансляция
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          {!isInThisChannel ? (
            <button
              id="join-voice-btn"
              onClick={() => joinVoiceChannel(channel.id, user, username, userColor)}
              disabled={isConnecting}
              className="w-full py-3 rounded-xl bg-ds-green hover:bg-ds-green/90 active:scale-[0.98] text-white font-semibold transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-ds-green/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Подключение...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                  </svg>
                  Войти в канал
                </>
              )}
            </button>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              <div className="flex gap-3 w-full">
                {/* Mute toggle */}
                <button
                  id="mute-btn"
                  onClick={toggleMute}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all duration-150 flex items-center justify-center gap-2
                    ${isMuted
                      ? 'bg-ds-red/20 border border-ds-red/50 text-ds-red hover:bg-ds-red/30'
                      : 'bg-ds-input hover:bg-ds-hover text-ds-text border border-ds-divider/30'
                    }`}
                >
                  {isMuted ? (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                      </svg>
                      Включить
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                      </svg>
                      Микрофон вкл.
                    </>
                  )}
                </button>
  
                {/* Leave */}
                <button
                  id="leave-voice-btn"
                  onClick={leaveVoiceChannel}
                  className="py-3 px-4 rounded-xl bg-ds-red/15 hover:bg-ds-red/25 text-ds-red border border-ds-red/30 font-semibold transition-all duration-150 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10.9 15.6L9.4 17c-.99-.63-1.88-1.42-2.58-2.34l1.59-1.59c.55.73 1.22 1.37 2.49 2.53zm7.42-7.23c-.68-.7-1.5-1.3-2.43-1.76l-1.59 1.59c.89.59 1.66 1.34 2.18 2.12l1.84-1.95zM21 1l-3 3c-.9-.52-1.87-.91-2.91-1.14L14 6c1.08.17 2.09.55 3 1.13L15.13 9H21v5.86L17 17v4l-3-3-.68.68L2.75 8l-.75.75 3 3v.11c0 3.63 1.78 6.84 4.5 8.82l2.05-2.05C9.77 17.46 9 15.79 9 14v-.13l1.9 1.9L12 14.13V21h-2L7 24l4-4v-2h5.86L19 16v6l4-4-3-3V3l1-2z"/>
                  </svg>
                  Выйти
                </button>
              </div>

              {/* Share screen connection */}
              {!isScreenSharing ? (
                <div className="flex gap-2 w-full mt-2">
                  <select 
                    value={quality} 
                    onChange={e => setQuality(e.target.value)}
                    className="bg-ds-bg text-ds-text text-xs rounded-lg border border-ds-divider/30 px-2 outline-none focus:border-ds-accent cursor-pointer"
                  >
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                  </select>
                  <button 
                    onClick={() => startScreenShare(quality, user)}
                    className="flex-1 py-2.5 rounded-xl bg-ds-accent/10 hover:bg-ds-accent/20 text-ds-accent border border-ds-accent/30 font-semibold transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z"/>
                    </svg>
                    Демонстрация
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => stopScreenShare(user)}
                  className="w-full mt-2 py-2.5 rounded-xl bg-ds-red hover:bg-ds-red/90 text-white font-semibold transition-colors flex items-center justify-center gap-2 text-sm shadow-lg shadow-ds-red/30 animate-pulse-soft"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zM9.5 13.5l1.41-1.41L12.5 13.5l1.41-1.41-1.59-1.59 1.59-1.59-1.41-1.41L12.5 9.09l-1.59-1.59-1.41 1.41L11.09 10.5l-1.59 1.59 1.41 1.41z"/>
                  </svg>
                  Остановить трансляцию
                </button>
              )}
            </div>
          )}

          {!isInThisChannel && (
            <p className="text-ds-muted text-xs text-center">
              Браузер запросит разрешение на использование микрофона
            </p>
          )}
        </div>
      </div>

      {/* ── Контекстное меню с микшером ── */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-ds-servers border border-ds-divider/60 rounded-xl shadow-2xl p-4 w-56 animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {/* Шапка */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-ds-bg overflow-hidden flex items-center justify-center flex-shrink-0">
              <img
                src={getUserAvatar(ctxMenu.participant.username).imageUrl}
                alt={ctxMenu.participant.username}
                className="w-12 h-12 max-w-none"
              />
            </div>
            <p className="text-ds-text text-sm font-semibold truncate"
               style={ctxMenu.participant.color ? { color: ctxMenu.participant.color } : {}}
            >
              {ctxMenu.participant.username}
            </p>
          </div>

          <div className="border-t border-ds-divider/40 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-ds-muted text-xs font-semibold uppercase tracking-wider">Громкость</p>
              <span className="text-ds-text text-xs font-bold tabular-nums">
                {volumes[ctxMenu.participant.userId] ?? 100}%
              </span>
            </div>

            {/* Слайдер */}
            <input
              type="range"
              min="0"
              max="200"
              step="5"
              value={volumes[ctxMenu.participant.userId] ?? 100}
              onChange={e => handleVolumeChange(ctxMenu.participant.userId, e.target.value)}
              className="w-full h-1.5 rounded-full accent-ds-accent cursor-pointer"
              style={{
                background: `linear-gradient(to right, #5865F2 ${(volumes[ctxMenu.participant.userId] ?? 100) / 2}%, #3A3C42 ${(volumes[ctxMenu.participant.userId] ?? 100) / 2}%)`
              }}
            />

            {/* Быстрые кнопки */}
            <div className="flex gap-1.5 mt-3">
              {[0, 50, 100, 150, 200].map(v => (
                <button
                  key={v}
                  onClick={() => handleVolumeChange(ctxMenu.participant.userId, v)}
                  className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                    (volumes[ctxMenu.participant.userId] ?? 100) === v
                      ? 'bg-ds-accent text-white'
                      : 'bg-ds-bg text-ds-muted hover:text-ds-text hover:bg-ds-hover'
                  }`}
                >
                  {v === 0 ? '🔇' : `${v}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
