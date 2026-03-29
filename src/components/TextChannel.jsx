import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMessages } from '../hooks/useMessages';
import { Message } from './Message';
import EmojiPicker from 'emoji-picker-react';

const MAX_LENGTH = 2000;

/**
 * Текстовый канал — история сообщений + поле ввода с прикреплением файлов
 */
export function TextChannel({ channel, user, username, userColor }) {
  const { messages, loading, sending, sendMessage, uploadFile } = useMessages(channel?.id);
  const [draft, setDraft]         = useState('');
  const [attachment, setAttachment] = useState(null);   // { file, previewUrl }
  const [uploading, setUploading]  = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const bottomRef                  = useRef(null);
  const inputRef                   = useRef(null);
  const fileInputRef               = useRef(null);
  const pickerRef                  = useRef(null);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Фокус на поле при смене канала
  useEffect(() => {
    inputRef.current?.focus();
    setAttachment(null);
    setDraft('');
    setShowEmojiPicker(false);
  }, [channel?.id]);

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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const onEmojiClick = (emojiObject) => {
    setDraft(prev => (prev + emojiObject.emoji).slice(0, MAX_LENGTH));
    inputRef.current?.focus();
  };

  // Обработка ВСТАВКИ (Ctrl+V / PrintScreen → буфер обмена)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
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
    const previewUrl = URL.createObjectURL(file);
    setAttachment({ file, previewUrl });
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
    e.target.value = '';   // сброс инпута, чтобы можно было выбрать тот же файл снова
  }

  function removeAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }

  const handleSend = useCallback(async (e) => {
    e?.preventDefault();
    if ((!draft.trim() && !attachment) || sending || uploading) return;

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

    await sendMessage(draft, user.id, username, imageUrl, userColor);
    setDraft('');
  }, [draft, attachment, sending, uploading, sendMessage, uploadFile, user.id, username, userColor]);

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

  const isBusy = sending || uploading;

  return (
    <div className="flex-1 flex flex-col bg-ds-bg min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-ds-divider/50 flex-shrink-0 bg-ds-bg/80 backdrop-blur-sm">
        <span className="text-ds-muted text-lg font-bold select-none">#</span>
        <span className="text-ds-text font-semibold text-sm">{channel.name}</span>
        
        {!window.electronAPI && (
          <a 
            href="https://github.com/aleksandrd836-cyber/Nash-Chat/releases/latest/download/Vibe-1.0.30-x64.exe"
            className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-ds-green hover:bg-ds-green/90 text-white text-[11px] font-bold rounded-md transition-all shadow-lg shadow-ds-green/20 animate-pulse-soft"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 16.5m0 0l4.5-4.5M12 16.5V3" />
            </svg>
            Скачать на Windows
          </a>
        )}
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
              <Message 
                key={msg.id} 
                msg={msg} 
                prevMsg={messages[i - 1]} 
                currentUser={user}
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
            <div className="mb-2 relative inline-block">
              <img
                src={attachment.previewUrl}
                alt="Прикреплённое изображение"
                className="max-h-40 max-w-xs rounded-xl border border-ds-divider/50 object-cover"
              />
              <button
                type="button"
                onClick={removeAttachment}
                className="absolute -top-2 -right-2 w-5 h-5 bg-ds-red rounded-full flex items-center justify-center hover:opacity-90 transition-opacity"
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
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              id="file-upload-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Прикрепить изображение"
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-all"
            >
              {/* Иконка скрепки */}
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
              </svg>
            </button>

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

            {/* Кнопка отправки */}
            <button
              id="send-btn"
              type="submit"
              disabled={(!draft.trim() && !attachment) || isBusy}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-ds-accent hover:bg-ds-accent/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBusy ? (
                <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-ds-muted/50 mt-1 px-1">Enter — отправить · Shift+Enter — перенос · Ctrl+V — вставить скриншот</p>
        </form>
      </div>
    </div>
  );
}
