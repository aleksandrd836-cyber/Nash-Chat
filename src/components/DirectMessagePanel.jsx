import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDirectMessages } from '../hooks/useDirectMessages';
import { getUserAvatar } from '../lib/avatar';
import { Message } from './Message';
import EmojiPicker from 'emoji-picker-react';

const MAX_LENGTH = 2000;
const MAX_FILE_SIZE_MB = 50;

/**
 * Панель личных сообщений (ЛС) с конкретным пользователем.
 * Синхронизирована по функционалу (эмодзи, файлы) с текстовыми каналами.
 */
export function DirectMessagePanel({ currentUser, username, userColor, targetMember, onClose }) {
  const { messages, loading, sending, sendMessage, markMessagesAsRead, uploadFile } = useDirectMessages(
    currentUser?.id,
    targetMember?.id
  );

  const [draft, setDraft]             = useState('');
  const [attachment, setAttachment]   = useState(null);   // { file, previewUrl }
  const [uploading, setUploading]     = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const bottomRef                     = useRef(null);
  const inputRef                      = useRef(null);
  const fileInputRef                  = useRef(null);
  const pickerRef                     = useRef(null);

  // Автоскролл
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Сброс при смене собеседника
  useEffect(() => {
    setDraft('');
    setAttachment(null);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }, [targetMember?.id]);

  // Помечаем открытые сообщения как прочитанные
  useEffect(() => {
    if (messages.length > 0) {
      const hasUnread = messages.some(m => !m.is_read && m.receiver_id === currentUser?.id);
      if (hasUnread) {
        markMessagesAsRead();
      }
    }
  }, [messages, currentUser?.id, markMessagesAsRead]);

  // Закрытие эмодзи по клику вне
  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        if (event.target.closest('#emoji-toggle-btn')) return;
        setShowEmojiPicker(false);
      }
    }
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const onEmojiClick = (emojiObject) => {
    setDraft(prev => (prev + emojiObject.emoji).slice(0, MAX_LENGTH));
    inputRef.current?.focus();
  };

  // Вставка из буфера
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
          const file = item.getAsFile();
          if (file) pickFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  function pickFile(file) {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`Файл слишком большой! Максимальный размер: ${MAX_FILE_SIZE_MB} МБ.`);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setAttachment({ file, previewUrl });
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
    e.target.value = '';
  }

  function removeAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }

  const handleSend = useCallback(async (e) => {
    e?.preventDefault();
    const isBusy = sending || uploading;
    if ((!draft.trim() && !attachment) || isBusy) return;

    let imageUrl = null;

    if (attachment) {
      setUploading(true);
      try {
        imageUrl = await uploadFile(attachment.file);
      } catch (err) {
        console.error('Ошибка загрузки файла:', err);
        alert('Не удалось загрузить файл. Попробуй ещё раз.');
        setUploading(false);
        return;
      }
      setUploading(false);
      removeAttachment();
    }

    await sendMessage(draft, username, userColor, imageUrl, attachment?.file.name);
    setDraft('');
  }, [draft, attachment, sending, uploading, sendMessage, uploadFile, username, userColor]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isBusy = sending || uploading;
  const { imageUrl: targetAvatar } = getUserAvatar(targetMember?.username ?? '');

  return (
    <div className="flex-1 flex flex-col bg-ds-bg min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-3 border-b border-ds-divider/50 flex-shrink-0 bg-ds-bg/80 backdrop-blur-sm">
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-ds-sidebar overflow-hidden flex items-center justify-center">
            <img src={targetAvatar} alt={targetMember?.username} className="w-12 h-12 max-w-none select-none" />
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ds-bg
              ${targetMember?.isOnline ? 'bg-ds-green' : 'bg-ds-muted/50'}`}
          />
        </div>

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

        <div className="flex items-center gap-1.5 px-2 py-1 bg-ds-sidebar rounded-lg">
          <svg className="w-3.5 h-3.5 text-ds-muted" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
          <span className="text-ds-muted text-[10px] font-semibold uppercase tracking-wider">ЛС</span>
        </div>

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
            <div className="flex gap-1 animate-pulse text-ds-muted">Загрузка сообщений...</div>
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
            {messages.map((msg, i) => (
              <Message 
                key={msg.id} 
                msg={msg} 
                prevMsg={messages[i - 1]} 
                currentUser={currentUser}
                currentUserColor={userColor}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <form onSubmit={handleSend}>
          {/* Превью прикреплённого файла */}
          {attachment && (
            <div className="mb-2 relative inline-flex items-center gap-2 p-2 bg-ds-sidebar rounded-xl border border-ds-divider/30">
              {attachment.file.type.startsWith('video/') ? (
                <video
                  src={attachment.previewUrl}
                  className="h-14 w-14 rounded-lg object-cover"
                />
              ) : attachment.file.type.startsWith('image/') ? (
                <img
                  src={attachment.previewUrl}
                  alt="Превью"
                  className="h-14 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-ds-bg flex items-center justify-center text-ds-muted">
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                  </svg>
                </div>
              )}
              
              <div className="flex-1 min-w-0 pr-6">
                <p className="text-ds-text text-xs font-medium truncate max-w-[150px]">{attachment.file.name}</p>
                <p className="text-ds-muted text-[10px] uppercase">{(attachment.file.size / 1024).toFixed(1)} KB</p>
              </div>

              <button
                type="button"
                onClick={removeAttachment}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-ds-red rounded-full flex items-center justify-center hover:opacity-90 transition-opacity z-10"
                title="Убрать"
              >
                <svg width="10" height="10" fill="white" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          )}

          <div className="relative bg-ds-input rounded-xl flex items-end gap-2 px-2 py-3 border border-ds-divider/30 focus-within:border-ds-accent/40 transition-colors">
            {/* Кнопка скрепки */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Прикрепить файл"
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-all"
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
              </svg>
            </button>

            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={`Написать ${targetMember?.username ?? ''}`}
              rows={1}
              className="flex-1 bg-transparent text-ds-text text-sm placeholder-ds-muted/60 resize-none focus:outline-none leading-relaxed max-h-48 overflow-y-auto"
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px';
              }}
            />

            {draft.length > MAX_LENGTH * 0.8 && (
              <span className={`text-xs flex-shrink-0 mb-2 ${draft.length >= MAX_LENGTH ? 'text-ds-red' : 'text-ds-muted'}`}>
                {MAX_LENGTH - draft.length}
              </span>
            )}

            {/* Emoji toggle */}
            <div className="relative flex-shrink-0">
              <button
                id="emoji-toggle-btn"
                type="button"
                onClick={() => setShowEmojiPicker(prev => !prev)}
                title="Добавить эмодзи"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-all"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S7.67 8 8.5 8 10 8.67 10 9.5 9.33 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                </svg>
              </button>

              {showEmojiPicker && (
                <div ref={pickerRef} className="absolute bottom-[calc(100%+12px)] right-0 z-50 shadow-[0_0_20px_rgba(0,0,0,0.5)] rounded-lg">
                  <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" skinTonesDisabled />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={(!draft.trim() && !attachment) || isBusy}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-ds-accent hover:bg-ds-accent/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBusy ? (
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
          <p className="text-[10px] text-ds-muted/50 mt-1 px-1">Enter — отправить · Shift+Enter — перенос · Ctrl+V — вставка медиа</p>
        </form>
      </div>
    </div>
  );
}
