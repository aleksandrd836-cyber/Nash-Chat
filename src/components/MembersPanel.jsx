import React from 'react';
import { getUserAvatar } from '../lib/avatar';

const PLATFORM_CREATOR_IDS = new Set([
  '43751682-690e-4934-a9f2-7300a816b92d',
  '1380ae20-201a-4c77-aed3-93b3cb96f8d5'
]);

export function MembersPanel({ members, loading, currentUserId, ownerId, onOpenDM, unreadCounts = {} }) {
  const online = members.filter((member) => member.isOnline);
  const offline = members.filter((member) => !member.isOnline);

  return (
    <div className="w-72 flex-shrink-0 flex flex-col shadow-2xl z-10 transition-all duration-300 relative vibe-rail vibe-rail--sidebar">
      <div className="absolute top-0 left-0 bottom-0 vibe-vertical-divider opacity-80 z-50 pointer-events-none" />

      <div className="h-14 flex items-center px-4 flex-shrink-0 border-b border-white/5 vibe-panel-strong">
        <span className="vibe-label-eyebrow text-ds-text opacity-90">Участники</span>
        <span className="ml-auto text-ds-green text-[10px] font-mono font-bold vibe-glow-green px-2 py-0.5 rounded-full border border-ds-green/20 bg-ds-green/5">
          {online.length}/{members.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-ds-muted border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {online.length > 0 && (
              <section>
                <p className="text-ds-text/70 text-[9px] font-black uppercase tracking-[0.2em] px-3 mb-2 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-ds-accent vibe-glow-blue" />
                  В сети — {online.length}
                </p>
                <div className="space-y-1">
                  {online.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isOnline
                      isSelf={member.id === currentUserId}
                      ownerId={ownerId}
                      onOpenDM={onOpenDM}
                      unreadCount={unreadCounts[member.id] || 0}
                    />
                  ))}
                </div>
              </section>
            )}

            {offline.length > 0 && (
              <section className="mt-4">
                <p className="text-ds-text/70 text-[9px] font-black uppercase tracking-[0.2em] px-3 mb-2 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-ds-text/40" />
                  Не в сети — {offline.length}
                </p>
                <div className="space-y-1">
                  {offline.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isOnline={false}
                      isSelf={member.id === currentUserId}
                      ownerId={ownerId}
                      onOpenDM={onOpenDM}
                      unreadCount={unreadCounts[member.id] || 0}
                    />
                  ))}
                </div>
              </section>
            )}

            {members.length === 0 && !loading && (
              <p className="text-ds-muted text-xs text-center px-3 py-4">Нет участников</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemberRow({ member, isOnline, isSelf, ownerId, onOpenDM, unreadCount }) {
  const { imageUrl } = getUserAvatar(member.username);
  const isPlatformCreator = PLATFORM_CREATOR_IDS.has(member.id);

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-300 relative overflow-hidden ${
        !isSelf ? 'cursor-pointer vibe-panel hover:bg-ds-text/5' : 'cursor-default'
      } ${!isOnline ? 'opacity-60 grayscale-[0.25]' : ''}`}
      onClick={() => !isSelf && onOpenDM?.(member)}
      title={!isSelf ? `Написать ${member.username}` : ''}
    >
      <div className="absolute inset-0 vibe-moving-glow opacity-0 group-hover:opacity-10 transition-opacity" />

      <div className="relative flex-shrink-0 z-10">
        <div className="w-9 h-9 rounded-full bg-ds-bg/40 overflow-hidden flex items-center justify-center border border-ds-divider/30 shadow-lg">
          <img src={imageUrl} alt={member.username} className="w-full h-full object-cover select-none" />
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-ds-sidebar z-20 transition-all duration-300 ${
            isOnline ? 'bg-ds-accent shadow-[0_0_8px_#00f0ff]' : 'bg-ds-text/20'
          }`}
        />
      </div>

      <div className="flex-1 min-w-0 z-10">
        <p
          className="text-[14px] font-bold truncate tracking-tight"
          style={{ color: member.id === ownerId ? '#ff4444' : 'var(--ds-text)' }}
        >
          {member.username}
          {isPlatformCreator && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-ds-accent/10 border border-ds-accent/30 text-[8px] font-black text-ds-accent uppercase tracking-tighter vibe-glow-blue align-middle vibe-creator-badge">
              СОЗДАТЕЛЬ
            </span>
          )}
          {isSelf && <span className="text-white/40 font-black text-[9px] ml-2 uppercase tracking-widest">(ВЫ)</span>}
        </p>
        <p className={`text-[9px] font-black uppercase tracking-widest ${isOnline ? 'text-ds-green' : 'text-white/30'}`}>
          {isOnline ? 'В сети' : 'Offline'}
        </p>
      </div>

      {!isSelf && unreadCount > 0 ? (
        <span className="flex-shrink-0 bg-ds-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-lg shadow-ds-red/30 animate-pulse-soft">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : !isSelf ? (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center text-ds-muted hover:text-ds-accent hover:bg-ds-bg/70"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDM?.(member);
          }}
          title={`Написать ${member.username}`}
        >
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
