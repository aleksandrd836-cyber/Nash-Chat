import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMessages } from '../hooks/useMessages';
import { Message } from './Message';
import { LazyEmojiPicker } from './LazyEmojiPicker';
import { Hash, Send, Paperclip, Smile, Download } from 'lucide-react';

const MAX_LENGTH = 2000;
const MAX_FILE_SIZE_MB = 50;


/**
 * Текстовый канал — история сообщений + поле ввода с прикреплением файлов
 */
export function TextChannel({ channel, user, ownerId, username, userColor, downloadUrl }) {
  const { messages, loading, sending, sendMessage, editMessage, deleteMessage, uploadFile } = useMessages(channel?.id, user?.id);
  const [draft, setDraft]         = useState('');
  const [attachment, setAttachment] = useState(null);   // { file, previewUrl }
  const [uploading, setUploading]  = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef                 = useRef(null);
  const inputRef                   = useRef(null);
  const fileInputRef               = useRef(null);
  const pickerRef                  = useRef(null);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
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
        if (item.type.startsWith('video/')) {
          alert('Видео запрещены! Только фото и документы.');
          continue;
        }
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
    if (file.type.startsWith('video/')) {
      alert('Видео запрещены! Только фото и документы.');
      return;
    }
    if (file.type === 'image/gif') {
      alert('Гифки — это пережиток прошлого! VibeChat поддерживает только качественные статические изображения.');
      return;
    }
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
    e.target.value = '';   // сброс инпута, чтобы можно было выбрать тот же файл снова
  }

  function removeAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }

  const handleSend = useCallback(async (e) => {
    e?.preventDefault();
    if ((!draft.trim() && !attachment) || sending || uploading) return;

    // Сохраняем данные для отправки и очищаем ввод сразу для "мгновенности"
    const content = draft;
    const currentAttachment = attachment;
    
    setDraft('');
    removeAttachment();

    let imageUrl = null;

    if (currentAttachment) {
      setUploading(true);
      try {
        imageUrl = await uploadFile(currentAttachment.file);
      } catch (err) {
        console.error('Ошибка загрузки файла:', err);
        alert('Не удалось загрузить файл. Попробуй ещё раз.');
        setUploading(false);
        // Возвращаем текст в поле, если произошла ошибка
        setDraft(content);
        setAttachment(currentAttachment);
        return;
      }
      setUploading(false);
    }

    const { error } = await sendMessage(content, user.id, username, imageUrl || currentAttachment?.previewUrl, userColor, currentAttachment?.file.name);
    
    if (error) {
      alert(`Ошибка при отправке: ${error.message || 'Неизвестная ошибка'}`);
      setDraft(content); // Возвращаем текст при ошибке
      return;
    }
  }, [draft, attachment, sending, uploading, sendMessage, uploadFile, user.id, username, userColor]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
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
    <div className="flex-1 flex flex-col bg-ds-bg min-w-0 relative">
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 flex-shrink-0 z-10 shadow-lg vibe-panel-strong">
        <Hash size={20} className="text-ds-accent vibe-glow-blue" />
        <span className="text-ds-text font-bold text-[15px]">{channel.name}</span>
        
        {!window.electronAPI && (
          <a 
            href={downloadUrl}
            className="ml-auto flex items-center gap-2 px-4 py-1.5 text-[12px] font-bold rounded-full transition-all hover:scale-105 active:scale-95 vibe-primary-button"
          >
            <Download size={16} />
            УСТАНОВИТЬ VIBE
          </a>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto py-4 flex flex-col min-h-0 scroll-smooth no-scrollbar"
      >
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
              <span className="text-2xl text-ds-text">#</span>
            </div>
            <div>
              <p className="text-ds-text font-bold text-xl">Добро пожаловать в #{channel.name}!</p>
              <p className="text-ds-muted text-sm mt-1">Это самое начало канала. Напиши что-нибудь первым!</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0 mt-auto">
            {messages.map((msg, i) => (
              <Message 
                key={msg.id} 
                msg={msg} 
                prevMsg={messages[i - 1]} 
                currentUser={user}
                currentUserColor={userColor}
                ownerId={ownerId}
                onEdit={editMessage}
                onDelete={deleteMessage}
              />
            ))}
          </div>
        )}
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

          <div className="relative rounded-[18px] flex items-end gap-2 px-3 py-3 border border-ds-divider/30 focus-within:vibe-glow-blue focus-within:border-ds-accent/60 transition-all duration-300 shadow-2xl vibe-panel-strong">
            {/* Кнопка скрепки */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              id="file-upload-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Прикрепить изображение"
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-ds-muted hover:text-ds-accent hover:bg-ds-accent/10 transition-all"
            >
              <Paperclip size={22} strokeWidth={2.5} />
            </button>

            <textarea
              ref={inputRef}
              id="message-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={`Сообщение в #${channel.name}`}
              rows={1}
              className="flex-1 bg-transparent text-ds-text text-[15px] placeholder-ds-muted/40 resize-none focus:outline-none leading-relaxed max-h-48 overflow-y-auto py-1.5"
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px';
              }}
            />

            {/* Emoji toggle */}
            <div className="relative flex-shrink-0">
              <button
                id="emoji-toggle-btn"
                type="button"
                onClick={() => setShowEmojiPicker(prev => !prev)}
                title="Добавить эмодзи"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-ds-muted hover:text-ds-accent hover:bg-ds-accent/10 transition-all"
              >
                <Smile size={22} strokeWidth={2.5} />
              </button>

              {showEmojiPicker && (
                <div ref={pickerRef} className="absolute bottom-[calc(100%+16px)] right-0 z-50 shadow-[0_0_30px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden animate-slide-up border border-white/5">
                  <LazyEmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
                </div>
              )}
            </div>

            {/* Кнопка отправки - Signature Vibe Moving Glow */}
            <button
              id="send-btn"
              type="submit"
              disabled={(!draft.trim() && !attachment) || isBusy}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed relative overflow-hidden group/send vibe-primary-button"
            >
              {!isBusy && <div className="absolute inset-0 vibe-moving-glow opacity-40 group-hover/send:opacity-70 transition-opacity" />}
              {isBusy ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin z-10" />
              ) : (
                <Send size={20} weight="bold" className="z-10" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-ds-muted/40 font-bold uppercase tracking-widest mt-2 px-2 select-none">
            Enter to send · Shift+Enter to newline · Ctrl+V to paste
          </p>
        </form>
      </div>
    </div>
  );
}

