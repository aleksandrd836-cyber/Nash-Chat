import React, { useState, useRef, useEffect } from 'react';
import { getUserAvatar } from '../lib/avatar';
import { useMessageReactions } from '../hooks/useReactions';
import EmojiPicker, { Emoji, EmojiStyle } from 'emoji-picker-react';
import { Smile } from 'lucide-react';

/** Константа стиля эмодзи для всего приложения */
const EMOJI_STYLE = EmojiStyle.APPLE;

/** Регулярное выражение для обнаружения эмодзи */
const EMOJI_REGEX = /([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{3297}\u{3299}\u{303D}\u{2139}\u{24C2}\u{1F191}-\u{1F19A}\u{E0020}-\u{E007F}\u{203C}\u{2049}\u{00A9}\u{00AE}\u{2122}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2600}-\u{2604}\u{260E}\u{2611}\u{2614}\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}\u{2623}\u{2626}\u{262A}\u{262E}\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{2660}\u{2663}\u{2665}\u{2666}\u{2668}\u{267B}\u{267F}\u{2692}-\u{2694}\u{2696}\u{2697}\u{2699}\u{269B}\u{269C}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26C8}\u{26CE}\u{26CF}\u{26D1}\u{26D3}\u{26D4}\u{26E9}\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2B1B}\u{2B1C}])/gu;

/** Помощник для перевода символа эмодзи в формат unified */
const unifiedFromEmoji = (emoji) => {
  if (!emoji) return '';
  return [...emoji].map(c => c.codePointAt(0).toString(16)).join('-');
};

/** Рендерит текст сообщения, заменяя эмодзи на компоненты Apple Emoji */
const MessageContent = ({ content, isJumbo = false }) => {
  if (!content) return null;

  // Проверяем, состоит ли всё сообщение только из эмодзи (до 27 шт)
  const emojisOnlyRegex = /^(\s*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{3297}\u{3299}\u{303D}\u{2139}\u{24C2}\u{1F191}-\u{1F19A}\u{E0020}-\u{E007F}\u{203C}\u{2049}\u{00A9}\u{00AE}\u{2122}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2600}-\u{2604}\u{260E}\u{2611}\u{2614}\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}\u{2623}\u{2626}\u{262A}\u{262E}\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{2660}\u{2663}\u{2665}\u{2666}\u{2668}\u{267B}\u{267F}\u{2692}-\u{2694}\u{2696}\u{2697}\u{2699}\u{269B}\u{269C}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26C8}\u{26CE}\u{26CF}\u{26D1}\u{26D3}\u{26D4}\u{26E9}\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]+\s*)+$/u;
  const isAllEmoji = emojisOnlyRegex.test(content.trim());
  const emojiSize = isAllEmoji ? 40 : 20;

  // Если это только эмодзи, делаем их крупными и добавляем отступы
  if (isAllEmoji) {
    const emojis = content.match(EMOJI_REGEX) || [];
    return (
      <div className="flex flex-wrap gap-2 py-1 select-none">
        {emojis.map((emoji, idx) => (
          <div key={idx} className="scale-125 transform-gpu">
            <Emoji unified={unifiedFromEmoji(emoji.trim())} emojiStyle={EMOJI_STYLE} size={emojiSize} />
          </div>
        ))}
      </div>
    );
  }

  // Для смешанного текста разбиваем строку и заменяем эмодзи инлайново
  const parts = content.split(EMOJI_REGEX);
  return (
    <span className="leading-relaxed">
      {parts.map((part, idx) => {
        if (EMOJI_REGEX.test(part)) {
          return (
            <span key={idx} className="inline-block mx-0.5 align-middle transform translate-y-[-1px]">
              <Emoji unified={unifiedFromEmoji(part)} emojiStyle={EMOJI_STYLE} size={emojiSize} />
            </span>
          );
        }
        return part;
      })}
    </span>
  );
};

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
          <div className="scale-125 transform-gpu">
             <Emoji unified={unifiedFromEmoji(emoji)} emojiStyle={EMOJI_STYLE} size={16} />
          </div>
          <span>{meta.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Компонент одного сообщения.
 */
export function Message({ msg, prevMsg, currentUser, currentUserColor, ownerId }) {
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
  const isAdmin = authorId === ownerId;
  const displayColor = isAdmin ? '#ff4444' : 'var(--ds-text)';
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
        <Smile size={18} strokeWidth={2.5} />
      </button>
      {showEmojiPicker && (
        <div ref={pickerRef} className="absolute z-[100] bottom-full left-0 mb-2 shadow-2xl transition-all">
          <EmojiPicker 
             onEmojiClick={handleEmojiClick} 
             theme={document.documentElement.classList.contains('light-theme') ? 'light' : 'dark'} 
             emojiStyle={EMOJI_STYLE}
             skinTonesDisabled 
          />
        </div>
      )}
    </div>
  );

  if (isSameAuthor) {
    return (
      <div className="group relative flex items-start gap-3 px-4 py-0.5 hover:bg-ds-hover/30 rounded transition-colors">
        {/* Reaction on hover in gutter */}
        <div className="w-[42px] flex-shrink-0 flex items-center justify-center">
           {reactionBtn}
        </div>
        
        <div className="flex-1 min-w-0 pr-20">
          {msg.content && (
            <div className="flex items-end gap-2">
              <p className="text-ds-text text-sm leading-relaxed break-all whitespace-pre-wrap">
                <MessageContent content={msg.content} />
              </p>
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

        {/* Time on hover on far right */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
           <span className="text-[10px] text-ds-muted font-bold tracking-tighter bg-ds-bg/40 backdrop-blur-md px-2 py-0.5 rounded-lg border border-ds-divider/20">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex items-start gap-3 px-4 py-1 mt-2 hover:bg-ds-hover/30 rounded transition-colors animate-fade-in">
      <div className="w-[42px] h-[42px] flex-shrink-0">
        <img src={imageUrl} alt={realName} className="w-full h-full object-cover select-none rounded-full flex items-center justify-center border border-ds-divider/30" />
      </div>
      
      <div className="flex-1 min-w-0 pr-20">
        <div className="flex items-center gap-3 mb-0.5">
          <span className="font-bold text-[14.5px] tracking-tight" style={{ color: displayColor }}>{realName}</span>
          {/* Reaction button next to name on hover for main messages */}
          <div className="h-0 flex items-center">
             {reactionBtn}
          </div>
        </div>
        {msg.content && (
          <div className="flex items-end gap-2 text-[15px] leading-relaxed">
            <p className="text-ds-text break-all whitespace-pre-wrap opacity-90">
              <MessageContent content={msg.content} />
            </p>
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

      {/* Time on hover on far right */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
         <span className="text-[10px] text-ds-muted font-bold tracking-tighter bg-ds-bg/40 backdrop-blur-md px-2 py-0.5 rounded-lg border border-ds-divider/20">{time}</span>
      </div>
    </div>
  );
}
