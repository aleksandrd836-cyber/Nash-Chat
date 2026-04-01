import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { UserPanel } from './UserPanel';
import { ProfileFooter } from './ProfileFooter';
import { getUserAvatar } from '../lib/avatar';
import { useUnreadCounts } from '../hooks/useUnreadCounts';
import { MicOff, Headphones } from 'lucide-react';


/**
 * Боковая панель со списком каналов.
 * Поддерживает: создание, переименование, удаление каналов.
 * ПКМ по участникам голосовых каналов — микшер громкости.
 */
export function Sidebar({ 
  username, userColor, selectedChannel, onSelectChannel, onSignOut, voice, onOpenSettings, currentUserId,
  updateStatus, updateInfo, updateProgress, updateError, isElectron, onCheckUpdate, onDownload, onInstall, appVersion,
  selectedServer, isOwner, onOpenServerSettings, ownerId
}) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading]   = useState(true);

  // ── Непрочитанные сообщения ──
  const { counts, markAsRead } = useUnreadCounts(currentUserId, selectedChannel?.id);

  // ── Редактирование канала ──
  const [editingId, setEditingId]     = useState(null);   // id канала, который переименовываем
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef(null);

  // ── Контекстное меню канала ──
  const [chanCtx, setChanCtx] = useState(null);  // { channel, x, y }
  const chanCtxRef = useRef(null);

  // ── Контекстное меню участника (микшер) ──
  const [ctxMenu, setCtxMenu] = useState(null);  // { participant, x, y }
  const [volumes, setVolumes] = useState({});
  const volMenuRef = useRef(null);

  const { activeChannelId, allParticipants, setParticipantVolume } = voice;

  // ── Загрузка каналов ──
  useEffect(() => {
    if (selectedServer?.id) fetchChannels();
  }, [selectedServer?.id]);

  async function fetchChannels() {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('server_id', selectedServer.id)
        .order('position');
      if (error) throw error;
      setChannels(data ?? []);
    } catch (e) {
      console.warn('[Sidebar] fetchChannels error (Supabase blocked?):', e.message);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }

  // ── Закрытие меню при клике вне ──
  useEffect(() => {
    function onMouseDown(e) {
      if (chanCtxRef.current && !chanCtxRef.current.contains(e.target)) setChanCtx(null);
      if (volMenuRef.current  && !volMenuRef.current.contains(e.target))  setCtxMenu(null);
    }
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Фокус на поле при начале редактирования
  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus();
  }, [editingId]);

  // Восстановить громкость из localStorage и следить за изменениями
  useEffect(() => {
    const all = Object.values(allParticipants).flat();
    const saved = {};
    all.forEach(p => {
      const stored = localStorage.getItem(`vol_${p.userId}`);
      if (stored !== null) saved[p.userId] = Number(stored);
    });
    setVolumes(prev => ({ ...saved, ...prev }));

    const handleVolChange = (e) => {
      setVolumes(prev => ({ ...prev, [e.detail.userId]: e.detail.volumePct }));
    };
    window.addEventListener('volumeChanged', handleVolChange);
    return () => window.removeEventListener('volumeChanged', handleVolChange);
  }, [allParticipants]);

  // ── CRUD каналов ──

  async function createChannel(type) {
    if (!selectedServer?.id) return;
    const existing = channels.filter(c => c.type === type);
    const name = type === 'text' ? `новый-канал` : `голосовой-${existing.length + 1}`;
    const position = channels.length;
    const { data, error } = await supabase
      .from('channels')
      .insert({ name, type, position, server_id: selectedServer.id })
      .select()
      .single();
    if (error) {
      console.error('createChannel error:', error);
      alert(`Ошибка создания канала:\n${error.message}\n\nКод: ${error.code}`);
      return;
    }
    if (data) {
      setChannels(prev => [...prev, data]);
      setEditingId(data.id);
      setEditingName(data.name);
    }
  }

  async function renameChannel(id, newName) {
    const trimmed = newName.trim();
    if (!trimmed) { setEditingId(null); return; }
    const { error } = await supabase.from('channels').update({ name: trimmed }).eq('id', id);
    if (error) {
      console.error('renameChannel error:', error);
      alert(`Ошибка переименования:\n${error.message}`);
    } else {
      setChannels(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c));
    }
    setEditingId(null);
  }

  async function deleteChannel(ch) {
    if (!window.confirm(`Удалить канал «${ch.name}»? Все сообщения будут потеряны.`)) return;
    const { error } = await supabase.from('channels').delete().eq('id', ch.id);
    if (error) {
      console.error('deleteChannel error:', error);
      alert(`Ошибка удаления:\n${error.message}`);
      return;
    }
    setChannels(prev => prev.filter(c => c.id !== ch.id));
    if (selectedChannel?.id === ch.id) onSelectChannel(null);
    setChanCtx(null);
  }

  // ── Обработчики ──

  const handleChannelCtx = useCallback((e, ch) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 120);
    setChanCtx({ channel: ch, x, y });
  }, []);

  const handleParticipantCtx = useCallback((e, participant) => {
    if (participant.userId === currentUserId) return;
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setCtxMenu({ participant, x, y });
  }, [currentUserId]);

  const handleVolumeChange = useCallback((userId, val) => {
    const num = Number(val);
    setVolumes(prev => ({ ...prev, [userId]: num }));
    setParticipantVolume?.(userId, num);
  }, [setParticipantVolume]);

  const textChannels  = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');


  // ── Рендер ──
  return (
    <div className="w-72 flex-shrink-0 bg-ds-sidebar/92 backdrop-blur-[40px] flex flex-col shadow-2xl z-10 transition-all duration-300 relative select-none" onClick={() => { setChanCtx(null); setCtxMenu(null); }}>
      <div className="absolute top-0 left-0 bottom-0 vibe-vertical-divider opacity-30 z-50 pointer-events-none" />
      <div className="absolute top-0 right-0 bottom-0 vibe-vertical-divider opacity-30 z-50 pointer-events-none" />
      {/* Server header */}
      <div className="h-12 flex items-center justify-between px-4 flex-shrink-0 hover:bg-white/2 transition-colors group">
        <span className="text-ds-text font-bold text-[15px] truncate">{selectedServer?.name ?? 'Сервер'}</span>
        {isOwner && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenServerSettings?.(); }}
            title="Настройки сервера"
            className="w-6 h-6 flex items-center justify-center text-ds-muted hover:text-ds-text transition-colors rounded"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-ds-muted border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Text channels ── */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1 group">
                <p className="text-ds-muted text-[11px] font-bold uppercase tracking-wider opacity-80">
                  Текстовые каналы
                </p>
                {isOwner && (
                  <button
                    onClick={(e) => { e.stopPropagation(); createChannel('text'); }}
                    title="Создать текстовый канал"
                    className="w-4 h-4 flex items-center justify-center rounded text-ds-muted hover:text-ds-text opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </button>
                )}
              </div>

              {textChannels.map(ch => (
                <div key={ch.id} className="relative group">
                  {editingId === ch.id ? (
                    // ── Inline редактор ──
                    <div className="flex items-center gap-1 px-2 py-1">
                      <span className="text-base leading-none opacity-70 text-ds-muted">#</span>
                      <input
                        ref={editInputRef}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameChannel(ch.id, editingName);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => renameChannel(ch.id, editingName)}
                        className="flex-1 bg-ds-bg border border-ds-accent rounded px-2 py-0.5 text-sm text-ds-text outline-none"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        onSelectChannel(ch);
                        markAsRead(ch.id);
                      }}
                      onContextMenu={(e) => handleChannelCtx(e, ch)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-[14.5px] transition-all duration-200 group/item relative overflow-hidden
                        ${selectedChannel?.id === ch.id
                          ? 'bg-ds-accent/15 text-ds-text vibe-glow-blue border border-ds-accent/30 font-bold'
                          : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'
                        } ${counts[ch.id] > 0 ? 'text-ds-text font-bold' : ''}`}
                    >
                      {selectedChannel?.id === ch.id && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-ds-accent rounded-r-full shadow-[0_0_10px_#00f0ff]" />}
                      
                      <span className={`text-[17px] leading-none opacity-60 ${counts[ch.id] > 0 || selectedChannel?.id === ch.id ? 'text-ds-accent opacity-100' : ''}`}>#</span>
                      <span className="truncate flex-1 text-left">{ch.name}</span>
                      
                      {/* Бейдж непрочитанных */}
                      {counts[ch.id] > 0 && selectedChannel?.id !== ch.id && (
                        <span className="px-1.5 py-0.5 bg-ds-red text-white text-[10px] font-bold rounded-full min-w-[18px] text-center shadow-lg animate-pulse">
                          {counts[ch.id] > 99 ? '99+' : counts[ch.id]}
                        </span>
                      )}

                      {/* Кнопки управления (при наведении) — только для владельца */}
                      {isOwner && (
                        <span
                          className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity ml-auto"
                          onClick={e => e.stopPropagation()}
                        >
                          <span
                            title="Переименовать"
                            onClick={() => { setEditingId(ch.id); setEditingName(ch.name); }}
                            className="w-4 h-4 flex items-center justify-center hover:text-ds-text text-ds-muted"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                          </span>
                          <span
                            title="Удалить"
                            onClick={() => deleteChannel(ch)}
                            className="w-4 h-4 flex items-center justify-center hover:text-ds-red text-ds-muted"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                          </span>
                        </span>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* ── Voice channels ── */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1 group">
                <p className="text-ds-muted text-[11px] font-bold uppercase tracking-wider opacity-80">
                  Голосовые каналы
                </p>
                {isOwner && (
                  <button
                    onClick={(e) => { e.stopPropagation(); createChannel('voice'); }}
                    title="Создать голосовой канал"
                    className="w-4 h-4 flex items-center justify-center rounded text-ds-muted hover:text-ds-text opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </button>
                )}
              </div>

              {voiceChannels.map(ch => {
                const isActive       = activeChannelId === ch.id;
                const chParticipants = allParticipants[ch.id] || [];

                return (
                  <div key={ch.id} className="group">
                    {editingId === ch.id ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <svg className="w-4 h-4 flex-shrink-0 opacity-60 text-ds-muted" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                        </svg>
                        <input
                          ref={editInputRef}
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameChannel(ch.id, editingName);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={() => renameChannel(ch.id, editingName)}
                          className="flex-1 bg-ds-bg border border-ds-accent rounded px-2 py-0.5 text-sm text-ds-text outline-none"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => onSelectChannel(ch)}
                        onContextMenu={(e) => handleChannelCtx(e, ch)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[14.5px] transition-all duration-200 group/item relative overflow-hidden
                          ${selectedChannel?.id === ch.id
                            ? 'bg-ds-accent/15 text-ds-text vibe-glow-blue border border-ds-accent/30 font-bold'
                            : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'
                          }`}
                      >
                        {selectedChannel?.id === ch.id && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-ds-accent rounded-r-full shadow-[0_0_10px_#00f0ff]" />}
                        <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-ds-accent' : 'opacity-60'}`}
                          fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                        <span className="truncate flex-1 text-left">{ch.name}</span>
                        {chParticipants.length > 0 && (
                          <span className={`text-[10px] font-bold ${isActive ? 'text-ds-accent' : 'text-ds-muted'}`}>
                            {chParticipants.length}
                          </span>
                        )}
                        {/* Кнопки управления */}
                        <span
                          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => e.stopPropagation()}
                        >
                          <span
                            title="Переименовать"
                            onClick={() => { setEditingId(ch.id); setEditingName(ch.name); }}
                            className="w-4 h-4 flex items-center justify-center hover:text-ds-text text-ds-muted"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                          </span>
                          <span
                            title="Удалить"
                            onClick={() => deleteChannel(ch)}
                            className="w-4 h-4 flex items-center justify-center hover:text-ds-red text-ds-muted"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                          </span>
                        </span>
                      </button>
                    )}

                    {/* Участники голосового канала */}
                    {chParticipants.length > 0 && (
                      <div className="ml-6 mt-0.5 space-y-0.5">
                        {chParticipants.map(p => {
                          const { imageUrl } = getUserAvatar(p.username);
                          const isMe = p.userId === currentUserId;
                          const vol  = volumes[p.userId] ?? 100;
                          const isActuallySpeaking = isMe ? voice.isSpeaking : p.isSpeaking;
                          return (
                            <div
                              key={p.userId}
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${!isMe ? 'hover:bg-ds-hover cursor-context-menu' : ''}`}
                              onContextMenu={(e) => handleParticipantCtx(e, p)}
                              title={!isMe ? 'ПКМ для регулировки громкости' : ''}
                            >
                              <div className={`w-[28px] h-[28px] rounded-full bg-ds-bg overflow-hidden flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isActuallySpeaking ? 'ring-2 ring-ds-green shadow-[0_0_8px_rgba(35,165,89,0.5)] scale-105' : 'border border-white/5'}`}>
                                <img src={imageUrl} alt={p.username} 
                                  className="w-full h-full object-cover select-none" 
                                />
                              </div>
                              <span className={`text-[13px] font-medium truncate flex-1 transition-colors ${p.isSpeaking ? 'text-ds-green' : 'text-ds-muted group-hover:text-ds-text'}`} style={{ color: p.userId === ownerId ? '#ff4444' : '' }}>
                                {p.username}
                                {['43751682-690e-4934-a9f2-7300a816b92d', '1380ae20-201a-4c77-aed3-93b3cb96f8d5'].includes(p.userId) && (
                                  <span className="ml-1 px-1 py-0 rounded bg-ds-accent/10 border border-ds-accent/30 text-[7px] font-black text-ds-accent uppercase tracking-tighter vibe-glow-blue align-middle vibe-creator-badge">
                                    СОЗДАТЕЛЬ
                                  </span>
                                )}
                              </span>

                              {/* Статус Мута/Деафена */}
                              <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                                {p.isDeafened && (
                                  <div className="slashed-container w-3.5 h-3.5 text-ds-red flex-shrink-0">
                                    <Headphones className="w-full h-full" />
                                    <div className="slashed-icon-line" style={{ height: '1.5px' }} />
                                  </div>
                                )}
                                {p.isMuted && !p.isDeafened && (
                                  <MicOff className="w-3.5 h-3.5 text-ds-red flex-shrink-0" />
                                )}
                              </div>
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

      {/* User profile and version/update footer */}
      <ProfileFooter
        username={username}
        userColor={userColor}
        onSignOut={onSignOut}
        voice={voice}
        onOpenSettings={onOpenSettings}
        updateStatus={updateStatus}
        updateInfo={updateInfo}
        updateProgress={updateProgress}
        updateError={updateError}
        isElectron={isElectron}
        onCheckUpdate={onCheckUpdate}
        onDownload={onDownload}
        onInstall={onInstall}
        appVersion={appVersion}
        ownerId={ownerId}
        currentUserId={currentUserId}
      />

      {/* ── Контекстное меню канала ── */}
      {chanCtx && (
        <div
          ref={chanCtxRef}
          className="fixed z-50 bg-ds-servers border border-ds-divider/60 rounded-xl shadow-2xl py-1 w-44 animate-fade-in"
          style={{ left: chanCtx.x, top: chanCtx.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setEditingId(chanCtx.channel.id);
              setEditingName(chanCtx.channel.name);
              setChanCtx(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ds-text hover:bg-ds-accent hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
            Переименовать
          </button>
          <div className="border-t border-ds-divider/40 my-1" />
          <button
            onClick={() => deleteChannel(chanCtx.channel)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ds-red hover:bg-ds-red hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            Удалить канал
          </button>
        </div>
      )}

      {/* ── Контекстное меню участника (микшер) ── */}
      {ctxMenu && (
        <div
          ref={volMenuRef}
          className="fixed z-50 bg-ds-servers border border-ds-divider/60 rounded-xl shadow-2xl p-4 w-52 animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-ds-bg overflow-hidden flex items-center justify-center flex-shrink-0">
              <img src={getUserAvatar(ctxMenu.participant.username).imageUrl} alt={ctxMenu.participant.username} className="w-12 h-12 max-w-none" />
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
          <div className="border-t border-ds-divider/40 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-ds-muted text-xs font-semibold uppercase tracking-wider">Громкость</p>
              <span className="text-ds-text text-xs font-bold tabular-nums">{volumes[ctxMenu.participant.userId] ?? 100}%</span>
            </div>
            <input
              type="range" min="0" max="200" step="5"
              value={volumes[ctxMenu.participant.userId] ?? 100}
              onChange={e => handleVolumeChange(ctxMenu.participant.userId, e.target.value)}
              className="w-full h-1.5 rounded-full accent-ds-accent cursor-pointer"
              style={{ background: `linear-gradient(to right, #5865F2 ${(volumes[ctxMenu.participant.userId] ?? 100) / 2}%, #3A3C42 ${(volumes[ctxMenu.participant.userId] ?? 100) / 2}%)` }}
            />
            <div className="flex gap-1 mt-3">
              {[0, 50, 100, 150, 200].map(v => (
                <button key={v}
                  onClick={() => handleVolumeChange(ctxMenu.participant.userId, v)}
                  className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
                    (volumes[ctxMenu.participant.userId] ?? 100) === v
                      ? 'bg-ds-accent text-white' : 'bg-ds-bg text-ds-muted hover:text-ds-text hover:bg-ds-hover'
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
