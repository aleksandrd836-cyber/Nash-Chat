import React from 'react';
import { getUserAvatar } from '../lib/avatar';

/**
 * Правая боковая панель — список всех участников сервера.
 * Показывает онлайн/оффлайн статус и кнопку написать в ЛС.
 */
export function MembersPanel({ members, loading, currentUserId, onOpenDM, unreadCounts = {} }) {
  const online  = members.filter(m => m.isOnline);
  const offline = members.filter(m => !m.isOnline);

  return (
    <div className="w-60 flex-shrink-0 bg-[#0a0a0a] flex flex-col border-l border-white/5 shadow-2xl z-10 transition-all duration-300">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-white/5 flex-shrink-0 bg-black/20 backdrop-blur-md">
        <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">
          УЧАСТНИКИ
        </span>
        <span className="ml-auto text-ds-accent text-[10px] font-mono font-bold vibe-glow-blue px-2 py-0.5 rounded-full border border-ds-accent/20 bg-ds-accent/5">
          {online.length}/{members.length}
        </span>
      </div>

      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-ds-muted border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Онлайн ── */}
            {online.length > 0 && (
              <div>
                <p className="text-white/20 text-[9px] font-black uppercase tracking-[0.2em] px-3 mb-2 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-ds-accent vibe-glow-blue" />
                  В СЕТИ — {online.length}
                </p>
                <div className="space-y-0.5">
                  {online.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOnline={true}
                      isSelf={m.id === currentUserId}
                      onOpenDM={onOpenDM}
                      unreadCount={unreadCounts[m.id] || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Оффлайн ── */}
            {offline.length > 0 && (
              <div className="mt-4">
                <p className="text-white/20 text-[9px] font-black uppercase tracking-[0.2em] px-3 mb-2 flex items-center gap-2">
                   <span className="w-1 h-1 rounded-full bg-white/10" />
                   НЕ В СЕТИ — {offline.length}
                </p>
                <div className="space-y-0.5">
                  {offline.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOnline={false}
                      isSelf={m.id === currentUserId}
                      onOpenDM={onOpenDM}
                      unreadCount={unreadCounts[m.id] || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {members.length === 0 && !loading && (
              <p className="text-ds-muted text-xs text-center px-3 py-4">
                Нет участников
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemberRow({ member, isOnline, isSelf, onOpenDM, unreadCount }) {
  const { imageUrl } = getUserAvatar(member.username);

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 relative overflow-hidden
        ${!isSelf ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}
        ${!isOnline ? 'opacity-40 grayscale-[0.5]' : ''}`}
      onClick={() => !isSelf && onOpenDM?.(member)}
      title={!isSelf ? `Написать ${member.username}` : ''}
    >
      <div className="absolute inset-0 vibe-moving-glow opacity-0 group-hover:opacity-10 transition-opacity" />
      {/* Avatar + status dot */}
      <div className="relative flex-shrink-0 z-10">
        <div className="w-9 h-9 rounded-full bg-black/40 overflow-hidden flex items-center justify-center border border-white/10 shadow-lg">
          <img
            src={imageUrl}
            alt={member.username}
            className="w-full h-full object-cover select-none"
          />
        </div>
        {/* Online indicator */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-[#0a0a0a] z-20 transition-all duration-300
            ${isOnline ? 'bg-ds-accent shadow-[0_0_8px_#00f0ff]' : 'bg-white/10'}`}
        />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0 z-10">
        <p
          className="text-[14px] font-bold truncate tracking-tight"
          style={member.color ? { color: member.color } : { color: '#ffffff' }}
        >
          {member.username}
          {isSelf && <span className="text-white/20 font-black text-[9px] ml-2 uppercase tracking-widest">(ВЫ)</span>}
        </p>
        <p className={`text-[9px] font-black uppercase tracking-widest ${isOnline ? 'text-ds-accent' : 'text-white/10'}`}>
          {isOnline ? 'В СЕТИ' : 'OFFLINE'}
        </p>
      </div>

      {/* DM button (hover) or Unread Badge */}
      {!isSelf && unreadCount > 0 ? (
        <span className="flex-shrink-0 bg-ds-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-lg shadow-ds-red/30 animate-pulse-soft">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : !isSelf && (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-ds-muted hover:text-ds-accent hover:bg-ds-bg"
          onClick={e => { e.stopPropagation(); onOpenDM?.(member); }}
          title={`Написать ${member.username}`}
        >
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </button>
      )}
    </div>
  );
}
