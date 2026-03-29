import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { UserPanel } from './UserPanel';
import { getUserAvatar } from '../lib/avatar';

/**
 * Боковая панель со списком каналов.
 * Каналы загружаются из Supabase один раз при монтировании.
 * Поддерживает ПКМ по участникам голосовых каналов с микшером громкости.
 */
export function Sidebar({ username, userColor, selectedChannel, onSelectChannel, onSignOut, voice, onOpenSettings, currentUserId }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading]   = useState(true);

  // ── Контекстное меню ──
  const [ctxMenu, setCtxMenu] = useState(null); // { participant, x, y }
  const [volumes, setVolumes] = useState({});
  const menuRef = useRef(null);

  const { activeChannelId, allParticipants, setParticipantVolume } = voice;

  useEffect(() => {
    supabase
      .from('channels')
      .select('*')
      .order('position')
      .then(({ data }) => {
        setChannels(data ?? []);
        setLoading(false);
      });
  }, []);

  // Закрыть меню при клике вне
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setCtxMenu(null);
      }
    }
    if (ctxMenu) window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [ctxMenu]);

  // Восстановить громкость из localStorage
  useEffect(() => {
    const all = Object.values(allParticipants).flat();
    const saved = {};
    all.forEach(p => {
      const stored = localStorage.getItem(`vol_${p.userId}`);
      if (stored !== null) saved[p.userId] = Number(stored);
    });
    setVolumes(prev => ({ ...saved, ...prev }));
  }, [allParticipants]);

  const handleContextMenu = useCallback((e, participant) => {
    if (participant.userId === currentUserId) return; // не регулируем себя
    e.preventDefault();
    e.stopPropagation();
    // Позиционируем меню, не выходя за правый/нижний край экрана
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    setCtxMenu({ participant, x, y });
  }, [currentUserId]);

  const handleVolumeChange = useCallback((userId, val) => {
    const num = Number(val);
    setVolumes(prev => ({ ...prev, [userId]: num }));
    setParticipantVolume?.(userId, num);
  }, [setParticipantVolume]);

  const textChannels  = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  return (
    <div className="w-60 flex-shrink-0 bg-ds-sidebar flex flex-col" onClick={() => setCtxMenu(null)}>
      {/* Server header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-ds-divider/50 flex-shrink-0 cursor-default">
        <span className="text-ds-text font-bold text-sm truncate">🎮 Vibe</span>
        <svg className="w-4 h-4 text-ds-muted flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-ds-muted border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Text channels */}
            <div>
              <p className="text-ds-muted text-[11px] font-semibold uppercase tracking-wider px-2 mb-1">
                Текстовые каналы
              </p>
              {textChannels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => onSelectChannel(ch)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                    ${selectedChannel?.id === ch.id
                      ? 'bg-ds-active text-ds-text'
                      : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'
                    }`}
                >
                  <span className="text-base leading-none opacity-70">#</span>
                  <span className="truncate">{ch.name}</span>
                </button>
              ))}
            </div>

            {/* Voice channels */}
            <div>
              <p className="text-ds-muted text-[11px] font-semibold uppercase tracking-wider px-2 mb-1">
                Голосовые каналы
              </p>
              {voiceChannels.map(ch => {
                const isActive       = activeChannelId === ch.id;
                const chParticipants = allParticipants[ch.id] || [];

                return (
                  <div key={ch.id}>
                    <button
                      onClick={() => onSelectChannel(ch)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                        ${selectedChannel?.id === ch.id
                          ? 'bg-ds-active text-ds-text'
                          : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'
                        }`}
                    >
                      <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-ds-green' : 'opacity-60'}`}
                        fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                      <span className="truncate flex-1 text-left">{ch.name}</span>
                      {chParticipants.length > 0 && (
                        <span className={`text-[10px] font-semibold ml-auto ${isActive ? 'text-ds-green' : 'text-ds-muted'}`}>
                          {chParticipants.length}
                        </span>
                      )}
                    </button>

                    {/* Участники голосового канала */}
                    {chParticipants.length > 0 && (
                      <div className="ml-6 mt-0.5 space-y-0.5">
                        {chParticipants.map(p => {
                          const { imageUrl } = getUserAvatar(p.username);
                          const isMe = p.userId === currentUserId;
                          const vol  = volumes[p.userId] ?? 100;
                          return (
                            <div
                              key={p.userId}
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded group ${!isMe ? 'hover:bg-ds-hover cursor-context-menu' : ''}`}
                              onContextMenu={(e) => handleContextMenu(e, p)}
                              title={!isMe ? 'ПКМ для регулировки громкости' : ''}
                            >
                              <div className="w-[30px] h-[30px] rounded-full bg-ds-bg shadow-[inset_0_0_5px_rgba(0,0,0,0.2)] overflow-hidden flex items-center justify-center flex-shrink-0">
                                <img
                                  src={imageUrl}
                                  alt={p.username}
                                  className="w-[45px] h-[45px] max-w-none select-none"
                                />
                              </div>
                              <span
                                className="text-[11px] text-ds-muted truncate flex-1"
                                style={p.color ? { color: p.color } : {}}
                              >
                                {p.username}
                              </span>
                              {/* Иконка громкости если нестандартная */}
                              {!isMe && vol !== 100 && (
                                <span className={`text-[9px] font-bold flex-shrink-0 ${vol === 0 ? 'text-ds-red' : 'text-ds-yellow'}`}>
                                  {vol === 0 ? '🔇' : `${vol}%`}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* User panel */}
      <UserPanel username={username} userColor={userColor} onSignOut={onSignOut} voice={voice} onOpenSettings={onOpenSettings} />

      {/* ── Контекстное меню ── */}
      {ctxMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-ds-servers border border-ds-divider/60 rounded-xl shadow-2xl p-4 w-52 animate-fade-in"
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
            <p
              className="text-ds-text text-sm font-semibold truncate"
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
            <div className="flex gap-1 mt-3">
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
