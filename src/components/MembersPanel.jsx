import React from 'react';
import { getUserAvatar } from '../lib/avatar';

/**
 * Правая боковая панель — список всех участников сервера.
 * Показывает онлайн/оффлайн статус и кнопку написать в ЛС.
 */
export function MembersPanel({ members, loading, currentUserId, onOpenDM }) {
  const online  = members.filter(m => m.isOnline);
  const offline = members.filter(m => !m.isOnline);

  return (
    <div className="w-56 flex-shrink-0 bg-ds-sidebar flex flex-col border-l border-ds-divider/30">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-ds-divider/50 flex-shrink-0">
        <span className="text-ds-muted text-[11px] font-semibold uppercase tracking-wider">
          Участники
        </span>
        <span className="ml-auto text-ds-muted text-[10px] font-mono">
          {online.length} / {members.length}
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
                <p className="text-ds-muted text-[11px] font-semibold uppercase tracking-wider px-2 mb-1">
                  В сети — {online.length}
                </p>
                <div className="space-y-0.5">
                  {online.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOnline={true}
                      isSelf={m.id === currentUserId}
                      onOpenDM={onOpenDM}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Оффлайн ── */}
            {offline.length > 0 && (
              <div>
                <p className="text-ds-muted text-[11px] font-semibold uppercase tracking-wider px-2 mb-1">
                  Не в сети — {offline.length}
                </p>
                <div className="space-y-0.5">
                  {offline.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOnline={false}
                      isSelf={m.id === currentUserId}
                      onOpenDM={onOpenDM}
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

function MemberRow({ member, isOnline, isSelf, onOpenDM }) {
  const { imageUrl } = getUserAvatar(member.username);

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors duration-150
        ${!isSelf ? 'hover:bg-ds-hover cursor-pointer' : 'cursor-default'}
        ${!isOnline ? 'opacity-50' : ''}`}
      onClick={() => !isSelf && onOpenDM?.(member)}
      title={!isSelf ? `Написать ${member.username}` : ''}
    >
      {/* Avatar + status dot */}
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-ds-bg overflow-hidden flex items-center justify-center">
          <img
            src={imageUrl}
            alt={member.username}
            className="w-12 h-12 max-w-none select-none"
          />
        </div>
        {/* Online indicator */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-ds-sidebar z-10
            ${isOnline ? 'bg-ds-green' : 'bg-ds-muted/50'}`}
        />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={member.color ? { color: member.color } : { color: 'var(--ds-text)' }}
        >
          {member.username}
          {isSelf && <span className="text-ds-muted font-normal text-[10px] ml-1">(вы)</span>}
        </p>
        <p className={`text-[10px] leading-tight ${isOnline ? 'text-ds-green' : 'text-ds-muted/60'}`}>
          {isOnline ? 'Онлайн' : 'Не в сети'}
        </p>
      </div>

      {/* DM button (hover) */}
      {!isSelf && (
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
