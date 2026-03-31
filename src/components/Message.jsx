import React, { useState, useRef, useEffect } from 'react';
import { getUserAvatar } from '../lib/avatar';
import { useMessageReactions } from '../hooks/useReactions';
import EmojiPicker from 'emoji-picker-react';

/** Компонент для отображения вложения (картинка, видео или файл) */
function Attachment({ url, fileName }) {
  const [fullscreen, setFullscreen] = useState(false);
  
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
  const isVideo = /\.(mp4|webm|ogg|mov|m4v)$/i.test(url);

  const handleDownload = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || url.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Ошибка скачивания:', err);
      window.open(url, '_blank');
    }
  };

  if (isImage) {
    return (
      <>
        <img
          src={url}
          alt={fileName || "Вложение"}
          onClick={() => setFullscreen(true)}
          className="mt-2 max-w-sm max-h-72 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity border border-ds-divider/30"
        />
        {fullscreen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setFullscreen(false)}
          >
            <img
              src={url}
              alt={fileName || "Вложение (полный размер)"}
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            />
            <button
              className="absolute top-4 right-4 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
              onClick={() => setFullscreen(false)}
            >
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        )}
      </>
    );
  }

  if (isVideo) {
    return (
      <>
        <video
          src={url}
          onClick={() => setFullscreen(true)}
          className="mt-2 max-w-sm max-h-72 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity border border-ds-divider/30"
          controls={false}
          muted
          autoPlay
          loop
          playsInline
        />
        {fullscreen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setFullscreen(false)}
          >
            <video
              src={url}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 w-9 h-9 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
              onClick={() => setFullscreen(false)}
            >
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-3 p-3 bg-ds-sidebar rounded-xl border border-ds-divider/30 max-w-sm hover:bg-ds-hover transition-colors group">
      <div className="w-10 h-10 rounded-lg bg-ds-bg flex items-center justify-center text-ds-muted group-hover:text-ds-accent transition-colors">
        <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ds-text text-sm font-medium truncate" title={fileName || 'Файл'}>
          {fileName || url.split('/').pop().split('_').slice(1).join('_') || 'Прикреплённый файл'}
        </p>
        <p className="text-ds-muted text-[10px] uppercase font-bold tracking-wider mt-0.5">
          {url.split('.').pop().toUpperCase()} файл
        </p>
      </div>
      <button
        onClick={handleDownload}
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-ds-bg text-ds-muted hover:text-ds-accent hover:bg-ds-hover transition-all"
        title="Скачать"
      >
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
      </button>
    </div>
  );
}

/**
 * Компонент списка реакций под сообщением.
 */
function ReactionList({ reactions, userId, onToggle }) {
  if (!reactions || reactions.length === 0) return null;

  // Группируем реакции по эмодзи
  const grouped = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, me: false };
    acc[r.emoji].count++;
    if (r.user_id === userId) acc[r.emoji].me = true;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {Object.entries(grouped).map(([emoji, meta]) => (
        <button
          key={emoji}
          onClick={() => onToggle(userId, emoji)}
          className={`
            flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-medium transition-all
            ${meta.me 
              ? 'bg-ds-accent/10 border-ds-accent/40 text-ds-accent shadow-[0_0_8px_rgba(88,101,242,0.2)]' 
              : 'bg-ds-sidebar border-ds-divider/20 text-ds-muted hover:border-ds-divider/50 hover:bg-ds-hover'
            }
          `}
        >
          <span>{emoji}</span>
          <span>{meta.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Компонент одного сообщения.
 */
export function Message({ msg, prevMsg, currentUser, currentUserColor }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef(null);

  const authorId = msg.user_id ?? msg.sender_id;
  const isDM = !!msg.sender_id;
  
  const { reactions, toggleReaction } = useMessageReactions(msg.id, isDM);

  const prevAuthorId = prevMsg?.user_id ?? prevMsg?.sender_id;
  const isSameAuthor = prevMsg && authorId === prevAuthorId &&
    new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;

  const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fullTime = new Date(msg.created_at).toLocaleString('ru-RU');
  
  let realName = 'Аноним';
  let colorStr = null;
  if (msg.username) {
    [realName, colorStr] = msg.username.split('@@');
  } else if (msg.sender_username) {
    realName = msg.sender_username;
    colorStr = msg.sender_color;
  }

  const { imageUrl, color } = getUserAvatar(realName);
  const currentUserId = currentUser?.id;
  const currentUserName = currentUser?.user_metadata?.username ?? currentUser?.email?.split('@')[0];
  const isMine = (currentUserId === authorId) || (currentUserName && currentUserName === realName);
  const displayColor = (isMine && currentUserColor) ? currentUserColor : (colorStr ?? color);
  const isRead = msg.is_read;

  // Закрытие пикера по клику вне
  useEffect(() => {
    function handleClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    }
    if (showEmojiPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmojiPicker]);

  const handleEmojiClick = (emojiObj) => {
    toggleReaction(currentUserId, emojiObj.emoji);
    setShowEmojiPicker(false);
  };

  const reactionBtn = (
    <div className="relative">
      <button
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-lg bg-ds-bg border border-ds-divider/30 text-ds-muted hover:text-ds-text hover:bg-ds-hover shadow-lg"
        title="Добавить реакцию"
      >
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S7.67 8 8.5 8 10 8.67 10 9.5 9.33 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
        </svg>
      </button>
      {showEmojiPicker && (
        <div ref={pickerRef} className="absolute z-[100] bottom-full right-0 mb-2 shadow-2xl transition-all">
          <EmojiPicker onEmojiClick={handleEmojiClick} theme={document.documentElement.classList.contains('light-theme') ? 'light' : 'dark'} skinTonesDisabled />
        </div>
      )}
    </div>
  );

  if (isSameAuthor) {
    return (
      <div className="group relative flex items-start gap-3 px-4 py-0.5 hover:bg-ds-hover/30 rounded transition-colors">
        <div className="absolute right-4 -top-3 z-10 flex gap-1 bg-ds-bg p-0.5 rounded-lg border border-ds-divider/20 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
          {reactionBtn}
        </div>
        <div className="w-[60px] flex-shrink-0 flex items-center justify-end">
          <span className="text-[10px] text-ds-muted hidden group-hover:block">{time}</span>
        </div>
        <div className="flex-1 min-w-0">
          {msg.content && (
            <div className="flex items-end gap-2">
              <p className="text-ds-text text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
              {isMine && isRead !== undefined && (
                <span className={`text-[11px] font-bold leading-none mb-1 select-none flex-shrink-0 ${isRead ? 'text-ds-accent' : 'text-ds-muted'}`}>
                  {isRead ? '✓✓' : '✓'}
                </span>
              )}
            </div>
          )}
          {msg.image_url && <Attachment url={msg.image_url} fileName={msg.file_name} />}
          <ReactionList reactions={reactions} userId={currentUserId} onToggle={toggleReaction} />
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex items-start gap-3 px-4 py-1 mt-2 hover:bg-ds-hover/30 rounded transition-colors animate-fade-in">
      <div className="absolute right-4 -top-3 z-10 flex gap-1 bg-ds-input p-1 rounded-xl border border-ds-divider/30 opacity-0 group-hover:opacity-100 transition-all shadow-2xl">
        {reactionBtn}
      </div>
      <div className="w-[42px] h-[42px] rounded-full flex-shrink-0 bg-ds-bg/40 shadow-inner overflow-hidden flex items-center justify-center border border-ds-divider/30">
        <img src={imageUrl} alt={realName} className="w-full h-full object-cover select-none" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-bold text-[14.5px] tracking-tight" style={{ color: displayColor }}>{realName}</span>
          <span className="text-[10px] text-ds-muted font-bold uppercase tracking-widest" title={fullTime}>{time}</span>
        </div>
        {msg.content && (
          <div className="flex items-end gap-2 text-[15px] leading-relaxed">
            <p className="text-ds-text break-words whitespace-pre-wrap opacity-90">{msg.content}</p>
            {isMine && isRead !== undefined && (
              <span className={`text-[11px] font-bold leading-none mb-1 select-none flex-shrink-0 ${isRead ? 'text-ds-accent vibe-glow-blue' : 'opacity-20'}`}>
                {isRead ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        )}
        {msg.image_url && <Attachment url={msg.image_url} fileName={msg.file_name} />}
        <ReactionList reactions={reactions} userId={currentUserId} onToggle={toggleReaction} />
      </div>
    </div>
  );
}
