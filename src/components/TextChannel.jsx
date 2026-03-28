import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMessages } from '../hooks/useMessages';
import { Message } from './Message';

const MAX_LENGTH = 2000;

/**
 * Текстовый канал — история сообщений + поле ввода
 */
export function TextChannel({ channel, user, username }) {
  const { messages, loading, sending, sendMessage } = useMessages(channel?.id);
  const [draft, setDraft]  = useState('');
  const bottomRef          = useRef(null);
  const inputRef           = useRef(null);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Фокус на поле при смене канала
  useEffect(() => {
    inputRef.current?.focus();
  }, [channel?.id]);

  const handleSend = useCallback(async (e) => {
    e?.preventDefault();
    if (!draft.trim() || sending) return;
    await sendMessage(draft, user.id, username);
    setDraft('');
  }, [draft, sending, sendMessage, user.id, username]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-ds-bg">
        <p className="text-ds-muted text-sm">Выбери канал слева</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-ds-bg min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-ds-divider/50 flex-shrink-0 bg-ds-bg/80 backdrop-blur-sm">
        <span className="text-ds-muted text-lg font-bold select-none">#</span>
        <span className="text-ds-text font-semibold text-sm">{channel.name}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col justify-end min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 bg-ds-muted rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-ds-sidebar flex items-center justify-center">
              <span className="text-2xl">#</span>
            </div>
            <div>
              <p className="text-ds-text font-bold text-xl">Добро пожаловать в #{channel.name}!</p>
              <p className="text-ds-muted text-sm mt-1">Это самое начало канала. Напиши что-нибудь первым!</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {messages.map((msg, i) => (
              <Message key={msg.id} msg={msg} prevMsg={messages[i - 1]} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <form onSubmit={handleSend}>
          <div className="relative bg-ds-input rounded-xl flex items-end gap-2 px-4 py-3 border border-ds-divider/30 focus-within:border-ds-accent/40 transition-colors">
            <textarea
              ref={inputRef}
              id="message-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={`Написать в #${channel.name}`}
              rows={1}
              className="flex-1 bg-transparent text-ds-text text-sm placeholder-ds-muted/60 resize-none focus:outline-none leading-relaxed max-h-48 overflow-y-auto"
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px';
              }}
            />
            {/* Char count if near limit */}
            {draft.length > MAX_LENGTH * 0.8 && (
              <span className={`text-xs flex-shrink-0 ${draft.length >= MAX_LENGTH ? 'text-ds-red' : 'text-ds-muted'}`}>
                {MAX_LENGTH - draft.length}
              </span>
            )}
            <button
              id="send-btn"
              type="submit"
              disabled={!draft.trim() || sending}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-ds-accent hover:bg-ds-accent/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-ds-muted/50 mt-1 px-1">Enter — отправить · Shift+Enter — перенос строки</p>
        </form>
      </div>
    </div>
  );
}
