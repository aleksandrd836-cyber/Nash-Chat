import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDirectMessages } from '../hooks/useDirectMessages';
import { getUserAvatar } from '../lib/avatar';
import { Message } from './Message';
import { LazyEmojiPicker } from './LazyEmojiPicker';
import { 
  X, Send, Smile, Paperclip, Sparkles,
  MessageSquare, User, Clock, Check, 
  ChevronLeft, AlertCircle, FileText
} from 'lucide-react';


const MAX_LENGTH = 2000;
const MAX_FILE_SIZE_MB = 50;

/**
 * Панель личных сообщений (ЛС) в стиле VIBE.
 */
export function DirectMessagePanel({ currentUser, username, userColor, targetMember, onClose }) {
  const { messages, loading, sending, sendMessage, markMessagesAsRead, uploadFile, editMessage, deleteMessage } = useDirectMessages(
    currentUser?.id,
    targetMember?.id
  );

  useEffect(() => {
    console.log('DMPage: Message handlers status:', { editMessage: !!editMessage, deleteMessage: !!deleteMessage });
  }, [editMessage, deleteMessage]);

  const [draft, setDraft]             = useState('');
  const [attachment, setAttachment]   = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const scrollRef                     = useRef(null);
  const inputRef                      = useRef(null);
  const fileInputRef                  = useRef(null);
  const pickerRef                     = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  useEffect(() => {
    setDraft('');
    setAttachment(null);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }, [targetMember?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      const hasUnread = messages.some(m => !m.is_read && m.receiver_id === currentUser?.id);
      if (hasUnread) {
        markMessagesAsRead();
      }
    }
  }, [messages, currentUser?.id, markMessagesAsRead]);

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

    // Очищаем ввод сразу для мгновенной реакции
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
        setUploading(false);
        setDraft(content);
        setAttachment(currentAttachment);
        return;
      }
      setUploading(false);
    }

    await sendMessage(
      content,
      username,
      userColor,
      imageUrl || currentAttachment?.previewUrl,
      currentAttachment?.file.name,
      currentAttachment?.previewUrl || null,
    );
  }, [draft, attachment, sending, uploading, sendMessage, uploadFile, username, userColor]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSend();
    }
  };

  const isBusy = sending || uploading;
  const { imageUrl: targetAvatar } = getUserAvatar(targetMember?.username ?? '');

  return (
    <div className="flex-1 flex flex-col bg-ds-bg min-w-0 relative">
      {/* Header */}
      <div className="h-14 flex items-center px-6 gap-4 border-b border-ds-border flex-shrink-0 bg-ds-bg/40 backdrop-blur-md z-20 shadow-lg">
        <button 
           onClick={onClose}
           className="p-2 -ml-2 rounded-xl text-ds-muted hover:text-ds-text hover:bg-ds-border transition-all md:hidden"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="relative flex-shrink-0 group cursor-pointer">
          <img src={targetAvatar} alt={targetMember?.username} className="w-10 h-10 rounded-full object-cover border border-ds-border" />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-ds-bg z-10 transition-all duration-300
              ${targetMember?.isOnline ? 'bg-ds-accent shadow-[0_0_8px_#00f0ff]' : 'bg-ds-muted/40'}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-ds-text font-black text-[15px] truncate tracking-tight"
            style={targetMember?.color ? { color: targetMember.color } : {}}
          >
            {targetMember?.username}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
             {targetMember?.isOnline ? <Sparkles size={10} className="text-ds-accent" /> : <Clock size={10} className="text-ds-muted" />}
             <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${targetMember?.isOnline ? 'text-ds-accent' : 'text-ds-muted'}`}>
                {targetMember?.isOnline ? 'В сети' : 'Не в сети'}
             </span>
          </div>
        </div>

        <div className="flex items-center gap-2 group">
           <div className="bg-ds-bg/20 px-4 py-1.5 rounded-full border border-ds-border flex items-center gap-2">
              <MessageSquare size={14} className="text-ds-accent" />
              <span className="text-ds-muted text-[10px] font-black uppercase tracking-[0.2em]">Личка</span>
           </div>
           <button
             onClick={onClose}
             className="w-10 h-10 rounded-2xl flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-ds-border transition-all"
             title="Закрыть"
           >
             <X size={22} />
           </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto no-scrollbar py-6 flex flex-col min-h-0 scroll-smooth"
      >
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
             <div className="w-12 h-12 border-[3px] border-ds-accent border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,240,255,0.2)]" />
             <p className="text-[10px] text-ds-muted font-black uppercase tracking-[0.2em] animate-pulse">Загрузка данных...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 animate-fade-in p-10">
            <div className="relative">
               <div className="w-32 h-32 rounded-[3.5rem] bg-ds-input overflow-hidden border-2 border-ds-border shadow-2xl relative z-10 group">
                 <div className="absolute inset-0 vibe-moving-glow opacity-0 group-hover:opacity-20 transition-opacity" />
                 <img src={targetAvatar} alt={targetMember?.username} className="w-full h-full object-cover select-none transition-transform duration-700 group-hover:scale-110" />
               </div>
               <div className="absolute inset-0 bg-ds-accent/10 blur-[60px] rounded-full animate-pulse-soft" />
            </div>
            <div className="text-center max-w-xs">
              <h3 className="text-ds-text font-black text-2xl tracking-tighter" style={targetMember?.color ? { color: targetMember.color } : {}}>
                {targetMember?.username}
              </h3>
              <p className="text-ds-muted text-xs font-bold mt-2 leading-relaxed">
                Это самое начало твоей личной истории с этим человеком. Напиши что-нибудь крутое!
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0 mt-auto">
            {messages.map((msg, i) => (
              <Message 
                key={msg.id} 
                msg={msg} 
                prevMsg={messages[i - 1]} 
                currentUser={currentUser}
                currentUserColor={userColor}
                onEdit={editMessage}
                onDelete={(id) => {
                  window.alert('Родитель (DMPage) получил запрос на удаление ID: ' + id);
                  deleteMessage(id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-2 flex-shrink-0 relative z-20">
        <form onSubmit={handleSend} className="relative group">
          {/* Attachment Preview */}
          {attachment && (
            <div className="absolute bottom-full mb-4 left-0 animate-slide-up">
              <div className="bg-ds-input rounded-[1.5rem] p-3 border border-ds-border shadow-2xl flex items-center gap-4 min-w-[200px]">
                {attachment.file.type.startsWith('video/') ? (
                  <video src={attachment.previewUrl} className="h-16 w-16 rounded-xl object-cover border border-ds-border shadow-lg" />
                ) : attachment.file.type.startsWith('image/') ? (
                  <img src={attachment.previewUrl} alt="Preview" className="h-16 w-16 rounded-xl object-cover border border-ds-border shadow-lg" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-ds-bg flex items-center justify-center text-ds-accent vibe-glow-blue">
                    <FileText size={24} />
                  </div>
                )}
                <div className="pr-10">
                   <p className="text-ds-text text-[11px] font-black truncate max-w-[120px] uppercase tracking-tighter">{attachment.file.name}</p>
                   <p className="text-ds-muted text-[9px] font-black uppercase mt-1">{(attachment.file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button" onClick={removeAttachment}
                  className="absolute top-2 right-2 w-7 h-7 bg-ds-red/80 hover:bg-ds-red text-ds-text rounded-full flex items-center justify-center transition-all shadow-lg active:scale-90"
                >
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

          <div className="relative bg-ds-input rounded-[1.5rem] flex items-end gap-3 p-2.5 border border-ds-border focus-within:border-ds-accent/30 transition-all shadow-2xl group/input">
            <div className="absolute inset-0 vibe-moving-glow opacity-0 group-focus-within/input:opacity-[0.03] rounded-[1.5rem] pointer-events-none" />
            
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button
               type="button" onClick={() => fileInputRef.current?.click()}
               className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl text-ds-muted hover:text-ds-accent hover:bg-ds-accent/5 transition-all active:scale-90"
            >
              <Paperclip size={20} />
            </button>

            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={`Написать ${targetMember?.username ?? ''}`}
              rows={1}
              className="flex-1 bg-transparent text-ds-text text-[14px] font-bold placeholder-ds-muted/40 resize-none focus:outline-none leading-[1.6] py-3 max-h-48 scrollbar-hide"
              style={{ height: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px';
              }}
            />

            <div className="relative flex items-center gap-1.5 self-center mr-1">
               <button
                  id="emoji-toggle-btn"
                  type="button" onClick={() => setShowEmojiPicker(prev => !prev)}
                  className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all active:scale-90
                    ${showEmojiPicker ? 'bg-ds-accent/10 text-ds-accent vibe-glow-blue' : 'text-ds-muted hover:text-ds-text hover:bg-ds-border'}`}
               >
                 <Smile size={22} />
               </button>
               {showEmojiPicker && (
                  <div ref={pickerRef} className="absolute bottom-full right-0 mb-6 z-50 shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-3xl overflow-hidden border border-ds-border">
                    <LazyEmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
                  </div>
               )}
            </div>

            <button
              type="submit"
              disabled={(!draft.trim() && !attachment) || isBusy}
              className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl bg-ds-accent text-black font-black transition-all hover:scale-105 active:scale-95 disabled:opacity-20 disabled:grayscale disabled:scale-100 shadow-lg shadow-ds-accent/20 vibe-glow-blue relative overflow-hidden group/btn"
            >
              <div className="absolute inset-0 vibe-moving-glow opacity-30 group-hover/btn:opacity-60 transition-opacity" />
              {isBusy ? (
                <div className="w-5 h-5 border-[3px] border-black border-t-transparent rounded-full animate-spin z-10" />
              ) : (
                <Send size={20} weight="bold" className="z-10 translate-x-0.5" />
              )}
            </button>
          </div>
          
          <div className="flex justify-between items-center mt-3 px-4">
             <div className="flex items-center gap-4 font-black uppercase text-[8px] tracking-[0.2em] text-white/10">
                <span className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"><Check size={8}/> ENTER СЕНД</span>
                <span className="opacity-50 hover:opacity-100 transition-opacity">CTRL+V МЕДИА</span>
             </div>
             {draft.length > MAX_LENGTH * 0.8 && (
                <span className={`text-[9px] font-black font-mono transition-colors ${draft.length >= MAX_LENGTH ? 'text-ds-red' : 'text-white/20'}`}>
                  {MAX_LENGTH - draft.length}
                </span>
             )}
          </div>
        </form>
      </div>
    </div>
  );
}
