import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDirectMessages } from '../hooks/useDirectMessages';
import { getUserAvatar } from '../lib/avatar';

const MAX_LENGTH = 2000;

/**
 * Панель личных сообщений (ЛС) с конкретным пользователем.
 * Отображается вместо основного контента при открытии DM.
 */
export function DirectMessagePanel({ currentUser, username, userColor, targetMember, onClose }) {
  const { messages, loading, sending, sendMessage } = useDirectMessages(
    currentUser?.id,
    targetMember?.id
  );

  const [draft, setDraft] = useState('');
  const bottomRef         = useRef(null);
  const inputRef          = useRef(null);

  // Автоскролл
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Фокус при открытии диалога
  useEffect(() => {
    setDraft('');
    inputRef.current?.focus();
  }, [targetMember?.id]);

  const handleSend = useCallback(async (e) => {
    e?.preventDefault();
    if (!draft.trim() || sending) return;
    await sendMessage(draft, username, userColor);
    setDraft('');
  }, [draft, sending, sendMessage, username, userColor]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const { imageUrl: targetAvatar } = getUserAvatar(targetMember?.username ?? '');

  return (
    <div className="flex-1 flex flex-col bg-ds-bg min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-3 border-b border-ds-divider/50 flex-shrink-0 bg-ds-bg/80 backdrop-blur-sm">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-ds-sidebar overflow-hidden flex items-center justify-center">
            <img src={targetAvatar} alt={targetMember?.username} className="w-12 h-12 max-w-none select-none" />
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ds-bg
              ${targetMember?.isOnline ? 'bg-ds-green' : 'bg-ds-muted/50'}`}
          />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p
            className="text-ds-text font-semibold text-sm truncate"
            style={targetMember?.color ? { color: targetMember.color } : {}}
          >
            {targetMember?.username}
          </p>
          <p className={`text-[10px] leading-tight ${targetMember?.isOnline ? 'text-ds-green' : 'text-ds-muted'}`}>
            {targetMember?.isOnline ? 'В сети' : 'Не в сети'}
          </p>
        </div>

        {/* DM badge */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-ds-sidebar rounded-lg">
          <svg className="w-3.5 h-3.5 text-ds-muted" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
          <span className="text-ds-muted text-[10px] font-semibold uppercase tracking-wider">ЛС</span>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-colors"
          title="Закрыть"
        >
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col justify-end min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 bg-ds-muted rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-20 h-20 rounded-full bg-ds-sidebar overflow-hidden flex items-center justify-center">
              <img src={targetAvatar} alt={targetMember?.username} className="w-[120px] h-[120px] max-w-none select-none" />
            </div>
            <div className="text-center">
              <p className="text-ds-text font-bold text-lg" style={targetMember?.color ? { color: targetMember.color } : {}}>
                {targetMember?.username}
              </p>
              <p className="text-ds-muted text-sm mt-1">Это начало вашего личного чата. Напиши первым!</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {messages.map((msg, i) => {
              const isMe   = msg.sender_id === currentUser?.id;
              const prev   = messages[i - 1];
              const isSameAuthor = prev && prev.sender_id === msg.sender_id;
              const { imageUrl } = getUserAvatar(msg.sender_username);
              const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={msg.id}
                  className={`group flex items-start gap-3 px-4 py-0.5 hover:bg-ds-hover/20 transition-colors ${isSameAuthor ? '' : 'mt-3'}`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full bg-ds-sidebar overflow-hidden flex items-center justify-center flex-shrink-0 mt-0.5 ${isSameAuthor ? 'opacity-0' : ''}`}>
                    <img src={imageUrl} alt={msg.sender_username} className="w-[60px] h-[60px] max-w-none select-none" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {!isSameAuthor && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span
                          className="text-sm font-semibold"
                          style={msg.sender_color ? { color: msg.sender_color } : { color: 'var(--ds-text)' }}
                        >
                          {msg.sender_username}
                          {isMe && <span className="text-ds-muted font-normal text-[10px] ml-1">(вы)</span>}
                        </span>
                        <span className="text-ds-muted text-[10px]">{time}</span>
                      </div>
                    )}
                    <p className="text-ds-text text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>

                  {/* Timestamp (hover) */}
                  {isSameAuthor && (
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-ds-muted text-[10px] mt-1 flex-shrink-0 select-none">
                      {time}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <form onSubmit={handleSend}>
          <div className="relative bg-ds-input rounded-xl flex items-end gap-2 px-2 py-3 border border-ds-divider/30 focus-within:border-ds-accent/40 transition-colors">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={`Написать ${targetMember?.username ?? ''}...`}
              rows={1}
              className="flex-1 bg-transparent text-ds-text text-sm placeholder-ds-muted/60 resize-none focus:outline-none leading-relaxed max-h-48 overflow-y-auto"
              style={{ height: 'auto' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px';
              }}
            />

            {draft.length > MAX_LENGTH * 0.8 && (
              <span className={`text-xs flex-shrink-0 mb-2 ${draft.length >= MAX_LENGTH ? 'text-ds-red' : 'text-ds-muted'}`}>
                {MAX_LENGTH - draft.length}
              </span>
            )}

            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-ds-accent hover:bg-ds-accent/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? (
                <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-ds-muted/50 mt-1 px-1">Enter — отправить · Shift+Enter — перенос строки</p>
        </form>
      </div>
    </div>
  );
}
