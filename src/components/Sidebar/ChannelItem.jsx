import React, { memo } from 'react';

/**
 * Изолированный компонент канала для Sidebar.
 * Использует React.memo для предотвращения перерисовок, если данные канала не изменились.
 */
export const ChannelItem = memo(({ 
  channel, 
  isSelected, 
  isOwner, 
  unreadCount, 
  isEditing, 
  editingName,
  onSelect, 
  onRenameStart, 
  onDelete, 
  onCtxMenu,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  editInputRef,
  activeChannelId
}) => {
  const isVoice = channel.type === 'voice';
  const isActiveVoice = activeChannelId === channel.id;

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 transition-all duration-300">
        {isVoice ? (
          <svg className="w-4 h-4 flex-shrink-0 opacity-60 text-ds-muted" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          </svg>
        ) : (
          <span className="text-base leading-none opacity-70 text-ds-muted">#</span>
        )}
        <input
          ref={editInputRef}
          value={editingName}
          onChange={onEditChange}
          onKeyDown={onEditKeyDown}
          onBlur={onEditBlur}
          className="flex-1 bg-ds-bg border border-ds-accent rounded px-2 py-0.5 text-sm text-ds-text outline-none animate-fade-in"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(channel)}
      onContextMenu={(e) => onCtxMenu(e, channel)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-[14.5px] transition-all duration-200 group/item relative overflow-hidden
        ${isSelected
          ? 'bg-ds-accent/15 text-ds-text vibe-glow-blue border border-ds-accent/30 font-bold'
          : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'
        } ${unreadCount > 0 ? 'text-ds-text font-bold' : ''}`}
    >
      {isSelected && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-ds-accent rounded-r-full shadow-[0_0_10px_#00f0ff] animate-grow-y" />}
      
      {isVoice ? (
        <svg className={`w-4 h-4 flex-shrink-0 ${isActiveVoice ? 'text-ds-accent shadow-[0_0_5px_#00f0ff]' : 'opacity-60'}`}
          fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      ) : (
        <span className={`text-[17px] leading-none opacity-60 ${unreadCount > 0 || isSelected ? 'text-ds-accent opacity-100 drop-shadow-[0_0_3px_rgba(0,240,255,0.4)]' : ''}`}>#</span>
      )}
      
      <span className="truncate flex-1 text-left">{channel.name}</span>
      
      {/* Бейдж непрочитанных */}
      {unreadCount > 0 && !isSelected && (
        <span className="px-1.5 py-0.5 bg-ds-red text-white text-[10px] font-bold rounded-full min-w-[18px] text-center shadow-lg animate-pulse">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {/* Кнопки управления (только для владельца) */}
      {isOwner && (
        <span
          className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity ml-auto"
          onClick={e => e.stopPropagation()}
        >
          <span
            title="Переименовать"
            onClick={() => onRenameStart(channel)}
            className="w-4 h-4 flex items-center justify-center hover:text-ds-text text-ds-muted hover:scale-110 transition-transform"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </span>
          <span
            title="Удалить"
            onClick={() => onDelete(channel)}
            className="w-4 h-4 flex items-center justify-center hover:text-ds-red text-ds-muted hover:scale-110 transition-transform"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </span>
        </span>
      )}
    </button>
  );
});

ChannelItem.displayName = 'ChannelItem';
