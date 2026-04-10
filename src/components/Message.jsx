import React, { useState, useRef, useEffect } from 'react';
import { getUserAvatar } from '../lib/avatar';
import { useMessageReactions } from '../hooks/useReactions';
import { LazyEmojiPicker } from './LazyEmojiPicker';
import { Smile, Trash2 } from 'lucide-react';
import { createPrivateDmSignedUrl, decodePrivateDmAttachment, isPrivateDmAttachment } from '../lib/dmAttachments';

const PLATFORM_CREATOR_IDS = new Set([
  '43751682-690e-4934-a9f2-7300a816b92d',
  '1380ae20-201a-4c77-aed3-93b3cb96f8d5'
]);

const isPlatformCreator = (userId) => PLATFORM_CREATOR_IDS.has(userId);

const EmojiGlyph = ({ emoji, size = 20, className = '' }) => (
  <span
    className={className}
    style={{ fontSize: `${size}px`, lineHeight: 1 }}
  >
    {emoji}
  </span>
);

/** Р РµРЅРґРµСЂРёС‚ С‚РµРєСЃС‚ СЃРѕРѕР±С‰РµРЅРёСЏ, Р·Р°РјРµРЅСЏСЏ СЌРјРѕРґР·Рё РЅР° РєРѕРјРїРѕРЅРµРЅС‚С‹ Apple Emoji */
const MessageContent = ({ content, isJumbo = false }) => {
  if (!content) return null;

  // РџСЂРѕРІРµСЂСЏРµРј, СЃРѕСЃС‚РѕРёС‚ Р»Рё РІСЃС‘ СЃРѕРѕР±С‰РµРЅРёРµ С‚РѕР»СЊРєРѕ РёР· СЌРјРѕРґР·Рё (РґРѕ 27 С€С‚)
  const emojisOnlyRegex = /^(\s*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{3297}\u{3299}\u{303D}\u{2139}\u{24C2}\u{1F191}-\u{1F19A}\u{E0020}-\u{E007F}\u{203C}\u{2049}\u{00A9}\u{00AE}\u{2122}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2600}-\u{2604}\u{260E}\u{2611}\u{2614}\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}\u{2623}\u{2626}\u{262A}\u{262E}\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{2660}\u{2663}\u{2665}\u{2666}\u{2668}\u{267B}\u{267F}\u{2692}-\u{2694}\u{2696}\u{2697}\u{2699}\u{269B}\u{269C}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26C8}\u{26CE}\u{26CF}\u{26D1}\u{26D3}\u{26D4}\u{26E9}\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]+\s*)+$/u;
  const isAllEmoji = emojisOnlyRegex.test(content.trim());
  const emojiSize = isAllEmoji ? 40 : 20;

  // Р•СЃР»Рё СЌС‚Рѕ С‚РѕР»СЊРєРѕ СЌРјРѕРґР·Рё, РґРµР»Р°РµРј РёС… РєСЂСѓРїРЅС‹РјРё Рё РґРѕР±Р°РІР»СЏРµРј РѕС‚СЃС‚СѓРїС‹
  if (isAllEmoji) {
    const emojis = content.match(EMOJI_REGEX) || [];
    return (
      <div className="flex flex-wrap gap-2 py-1 select-none">
        {emojis.map((emoji, idx) => (
          <div key={idx} className="scale-125 transform-gpu">
            <EmojiGlyph emoji={emoji.trim()} size={emojiSize} />
          </div>
        ))}
      </div>
    );
  }

  // Р”Р»СЏ СЃРјРµС€Р°РЅРЅРѕРіРѕ С‚РµРєСЃС‚Р° СЂР°Р·Р±РёРІР°РµРј СЃС‚СЂРѕРєСѓ Рё Р·Р°РјРµРЅСЏРµРј СЌРјРѕРґР·Рё РёРЅР»Р°Р№РЅРѕРІРѕ
  const parts = content.split(EMOJI_REGEX);
  return (
    <span className="leading-relaxed">
      {parts.map((part, idx) => {
        const isEmojiPart = EMOJI_REGEX.test(part);
        EMOJI_REGEX.lastIndex = 0;
        if (isEmojiPart) {
          return (
            <span key={idx} className="inline-block mx-0.5 align-middle transform translate-y-[-1px]">
              <EmojiGlyph emoji={part} size={emojiSize} />
            </span>
          );
        }
        return part;
      })}
    </span>
  );
};

/** РљРѕРјРїРѕРЅРµРЅС‚ РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РІР»РѕР¶РµРЅРёСЏ (РєР°СЂС‚РёРЅРєР°, РІРёРґРµРѕ РёР»Рё С„Р°Р№Р») */
function Attachment({ url, fileName, previewUrl = null }) {
  const [fullscreen, setFullscreen] = useState(false);
  const isPrivateAttachment = isPrivateDmAttachment(url);
  const [resolvedUrl, setResolvedUrl] = useState(() => (isPrivateAttachment ? (previewUrl || null) : url));
  const [resolveError, setResolveError] = useState('');
  const decodedPrivatePath = decodePrivateDmAttachment(url);
  const sourceForType = isPrivateAttachment
    ? (fileName || decodedPrivatePath || resolvedUrl || url)
    : (resolvedUrl || url);
  const fallbackFileName = decodedPrivatePath?.split('/').pop()?.split('_').slice(2).join('_') || '';
  const displayFileName = fileName || fallbackFileName || 'РџСЂРёРєСЂРµРїР»С‘РЅРЅС‹Р№ С„Р°Р№Р»';
  const extensionLabel = sourceForType.includes('.') ? sourceForType.split('.').pop().toUpperCase() : 'FILE';
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(sourceForType);
  const isVideo = /\.(mp4|webm|ogg|mov|m4v)$/i.test(sourceForType);

  useEffect(() => {
    let isActive = true;

    if (!isPrivateAttachment) {
      setResolvedUrl(url);
      setResolveError('');
      return () => {
        isActive = false;
      };
    }

    setResolvedUrl(previewUrl || null);
    setResolveError('');

    createPrivateDmSignedUrl(url)
      .then((signedUrl) => {
        if (!isActive) return;
        setResolvedUrl(signedUrl);
      })
      .catch((err) => {
        if (!isActive) return;
        console.error('[DM Attachment] РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ signed URL:', err);
        setResolveError('РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РІР»РѕР¶РµРЅРёРµ');
      });

    return () => {
      isActive = false;
    };
  }, [isPrivateAttachment, previewUrl, url]);

  const ensureResolvedUrl = async () => {
    if (!isPrivateAttachment) return url;
    if (resolvedUrl) return resolvedUrl;

    const signedUrl = await createPrivateDmSignedUrl(url);
    setResolvedUrl(signedUrl);
    setResolveError('');
    return signedUrl;
  };

  const handleDownload = async (e) => {
    e.preventDefault();
    try {
      const downloadUrl = await ensureResolvedUrl();
      if (!downloadUrl) {
        throw new Error('Attachment URL is unavailable');
      }

      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || fallbackFileName || downloadUrl.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРєР°С‡РёРІР°РЅРёСЏ:', err);
      if (resolvedUrl) {
        window.open(resolvedUrl, '_blank');
      }
    }
  };

  if (isPrivateAttachment && !resolvedUrl && !resolveError) {
    return (
      <div className="mt-2 flex items-center gap-3 p-3 bg-ds-sidebar rounded-xl border border-ds-divider/30 max-w-sm animate-pulse">
        <div className="w-10 h-10 rounded-lg bg-ds-bg/70" />
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded bg-ds-bg/70 w-2/3" />
          <div className="h-2 rounded bg-ds-bg/40 w-1/3" />
        </div>
      </div>
    );
  }

  if (resolveError) {
    return (
      <div className="mt-2 flex items-center gap-3 p-3 bg-ds-red/10 rounded-xl border border-ds-red/20 max-w-sm">
        <div className="w-10 h-10 rounded-lg bg-ds-red/10 flex items-center justify-center text-ds-red">
          <Trash2 size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-ds-red text-sm font-bold truncate">{fileName || 'Вложение'}</p>
          <p className="text-ds-red/70 text-[10px] uppercase font-bold tracking-wider mt-0.5">{resolveError}</p>
        </div>
      </div>
    );
  }

  if (isImage) {
    return (
      <>
        <img
          src={resolvedUrl}
          alt={fileName || "Р’Р»РѕР¶РµРЅРёРµ"}
          onClick={() => setFullscreen(true)}
          className="mt-2 max-w-sm max-h-72 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity border border-ds-divider/30"
        />
        {fullscreen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setFullscreen(false)}
          >
            <img
              src={resolvedUrl}
              alt={fileName || "Р’Р»РѕР¶РµРЅРёРµ (РїРѕР»РЅС‹Р№ СЂР°Р·РјРµСЂ)"}
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
          src={resolvedUrl}
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
              src={resolvedUrl}
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
        <p className="text-ds-text text-sm font-medium truncate" title={displayFileName}>
          {displayFileName}
        </p>
        <p className="text-ds-muted text-[10px] uppercase font-bold tracking-wider mt-0.5">
          {extensionLabel} файл
        </p>
      </div>
      <button
        onClick={handleDownload}
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-ds-bg text-ds-muted hover:text-ds-accent hover:bg-ds-hover transition-all"
        title="РЎРєР°С‡Р°С‚СЊ"
      >
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
      </button>
    </div>
  );
}

/**
 * РљРѕРјРїРѕРЅРµРЅС‚ СЃРїРёСЃРєР° СЂРµР°РєС†РёР№ РїРѕРґ СЃРѕРѕР±С‰РµРЅРёРµРј.
 */
function ReactionList({ reactions, userId, onToggle }) {
  if (!reactions || reactions.length === 0) return null;

  // Р“СЂСѓРїРїРёСЂСѓРµРј СЂРµР°РєС†РёРё РїРѕ СЌРјРѕРґР·Рё
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
             <EmojiGlyph emoji={emoji} size={16} className="scale-125 transform-gpu" />
          </div>
          <span>{meta.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * РљРѕРјРїРѕРЅРµРЅС‚ РєРѕРЅС‚РµРєСЃС‚РЅРѕРіРѕ РјРµРЅСЋ (РџРљРњ)
 */
function ContextMenu({ x, y, options, onClose }) {
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div 
      className="fixed z-[1000] min-w-[160px] bg-ds-sidebar/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-1.5 animate-in fade-in zoom-in duration-100"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt, idx) => (
        opt.separator ? (
          <div key={idx} className="h-[1px] bg-white/5 my-1 mx-2" />
        ) : (
          <button
            key={idx}
            onClick={() => { opt.onClick(); onClose(); }}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-3 transition-colors ${opt.danger ? 'text-ds-red hover:bg-ds-red/10' : 'text-ds-text hover:bg-ds-accent/10 hover:text-ds-accent'}`}
          >
            {opt.icon && <span className="opacity-70">{opt.icon}</span>}
            <span className="font-medium">{opt.label}</span>
          </button>
        )
      ))}
    </div>
  );
}

/**
 * РљРѕРјРїРѕРЅРµРЅС‚ РѕРґРЅРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ.
 */
export function Message({ msg, prevMsg, currentUser, currentUserColor, ownerId, onEdit, onDelete }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const [menuPos, setMenuPos] = useState(null);
  const pickerRef = useRef(null);
  const editInputRef = useRef(null);

  const authorId = msg.user_id ?? msg.sender_id;
  const isDM = !!msg.sender_id;
  const isPlatformAdmin = isPlatformCreator(authorId);
  const isServerAdmin = !isPlatformAdmin && ownerId && authorId === ownerId;
  
  const { reactions, toggleReaction } = useMessageReactions(msg.id, isDM);

  const prevAuthorId = prevMsg?.user_id ?? prevMsg?.sender_id;
  const isSameAuthor = prevMsg && authorId === prevAuthorId &&
    new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;

  const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fullTime = new Date(msg.created_at).toLocaleString('ru-RU');
  
  let realName = 'РђРЅРѕРЅРёРј';
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
  
  // Р Р°СЃС‡РµС‚ РІСЂРµРјРµРЅРё РґРѕ СѓРґР°Р»РµРЅРёСЏ (14 РґРЅРµР№)
  const getExpiryLabel = () => {
    if (msg.isPending) return null;
    const createdDate = new Date(msg.created_at);
    const expiryDate = new Date(createdDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diff = expiryDate - now;

    if (diff <= 0) return "РЈРґР°Р»СЏРµС‚СЃСЏ...";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    let parts = [];
    if (days > 0) parts.push(`${days}Рґ`);
    if (hours > 0) parts.push(`${hours}С‡`);
    if (mins > 0) parts.push(`${mins}Рј`);
    if (days === 0 && hours === 0) parts.push(`${secs}СЃ`);

    return `РЈРґР°Р»РёС‚СЃСЏ С‡РµСЂРµР· ${parts.join(' ')}`;
  };
  const expiryLabel = getExpiryLabel();

  // Р—Р°РєСЂС‹С‚РёРµ РїРёРєРµСЂР° РїРѕ РєР»РёРєСѓ РІРЅРµ
  useEffect(() => {
    function handleClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    }
    if (showEmojiPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmojiPicker]);

  // Р¤РѕРєСѓСЃ РїСЂРё СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРё
  useEffect(() => {
    if (isEditing) {
      editInputRef.current?.focus();
      editInputRef.current?.setSelectionRange(editInputRef.current.value.length, editInputRef.current.value.length);
    }
  }, [isEditing]);

  const handleEmojiClick = (emojiObj) => {
    toggleReaction(currentUserId, emojiObj.emoji);
    setShowEmojiPicker(false);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async () => {
    if (editContent.trim() !== msg.content) {
      await onEdit(msg.id, editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(msg.content);
  };

  const menuOptions = [
    { label: 'РљРѕРїРёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚', icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>, onClick: () => navigator.clipboard.writeText(msg.content) },
    { separator: true },
    ...(isMine ? [
      { 
        label: 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ', 
        icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>, 
        onClick: handleStartEdit 
      },
      { 
        label: 'РЈРґР°Р»РёС‚СЊ', 
        danger: true, 
        icon: <Trash2 size={14} />, 
        onClick: () => {
          if (confirm('РЈРґР°Р»РёС‚СЊ СЌС‚Рѕ СЃРѕРѕР±С‰РµРЅРёРµ?')) {
            onDelete(msg.id);
          }
        } 
      },
    ] : []),
    { separator: true },
    { label: 'РљРѕРїРёСЂРѕРІР°С‚СЊ ID', onClick: () => navigator.clipboard.writeText(msg.id) },
  ];

  const reactionBtn = (
    <div className="relative">
      <button
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-lg bg-ds-bg border border-ds-divider/30 text-ds-muted hover:text-ds-text hover:bg-ds-hover shadow-lg"
        title="Р”РѕР±Р°РІРёС‚СЊ СЂРµР°РєС†РёСЋ"
      >
        <Smile size={18} strokeWidth={2.5} />
      </button>
      {showEmojiPicker && (
        <div ref={pickerRef} className="absolute z-[100] bottom-full left-0 mb-2 shadow-2xl transition-all">
          <LazyEmojiPicker 
             onEmojiClick={handleEmojiClick} 
             theme={document.documentElement.classList.contains('light-theme') ? 'light' : 'dark'} 
          />
        </div>
      )}
    </div>
  );

  const EditUI = (
    <div className="mt-1 w-full max-w-2xl bg-ds-sidebar border border-ds-accent/30 rounded-xl p-2 animate-in slide-in-from-top-1 duration-200">
      <textarea
        ref={editInputRef}
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
          if (e.key === 'Escape') handleCancelEdit();
        }}
        rows={Math.min(editContent.split('\n').length, 10)}
        className="w-full bg-transparent text-ds-text text-sm resize-none focus:outline-none leading-relaxed p-1"
      />
      <div className="flex items-center gap-2 mt-2 text-[10px] font-bold uppercase tracking-wider">
        <button onClick={handleSaveEdit} className="text-ds-accent hover:underline">РЎРѕС…СЂР°РЅРёС‚СЊ (Enter)</button>
        <div className="w-1 h-1 rounded-full bg-ds-muted"></div>
        <button onClick={handleCancelEdit} className="text-ds-muted hover:text-ds-text transition-colors">РћС‚РјРµРЅР° (Esc)</button>
      </div>
    </div>
  );

  const wrapperClass = `group relative flex items-start gap-3 px-4 transition-colors ${msg.isPending ? 'opacity-50 grayscale-[0.5]' : ''}`;

  if (isSameAuthor) {
    return (
      <div 
        className={`${wrapperClass} py-0.5 hover:bg-ds-hover/30 rounded`}
        onContextMenu={handleContextMenu}
      >
        {menuPos && <ContextMenu {...menuPos} options={menuOptions} onClose={() => setMenuPos(null)} />}
        
        {/* Reaction on hover in gutter */}
        {!msg.isPending && (
          <div className="w-[42px] flex-shrink-0 flex items-center justify-center">
             {reactionBtn}
          </div>
        )}
        
        <div className="flex-1 min-w-0 pr-20">
          {isEditing ? EditUI : (
            msg.content && (
              <div className="flex items-end gap-2 text-[15px] leading-relaxed">
                <div className="text-ds-text text-sm break-all whitespace-pre-wrap">
                  <MessageContent content={msg.content} />
                </div>
                {msg.is_edited && (
                  <span className="text-[10px] text-ds-muted italic opacity-60 ml-1 select-none">(РёР·РјРµРЅРµРЅРѕ)</span>
                )}
                {msg.isPending ? (
                  <span className="text-[9px] text-ds-accent animate-pulse font-black uppercase tracking-tighter mb-1 select-none flex-shrink-0">
                    РћРўРџР РђР’РљРђ...
                  </span>
                ) : (
                  isMine && isRead !== undefined && (
                    <span className={`text-[11px] font-bold leading-none mb-1 select-none flex-shrink-0 ${isRead ? 'text-ds-accent' : 'text-ds-muted'}`}>
                      {isRead ? 'вњ“вњ“' : 'вњ“'}
                    </span>
                  )
                )}
              </div>
            )
          )}
          {msg.image_url && <Attachment url={msg.image_url} fileName={msg.file_name} previewUrl={msg.resolved_image_url} />}
          <ReactionList reactions={reactions} userId={currentUserId} onToggle={toggleReaction} />
        </div>

        {/* Persistent Time & Expiry Badge */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
           {expiryLabel && (
             <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-ds-bg/60 backdrop-blur-md border border-ds-accent/20 text-ds-accent animate-pulse" title={expiryLabel}>
               <Trash2 size={10} strokeWidth={3} />
               <span className="text-[9px] font-black uppercase tracking-tighter">14d</span>
             </div>
           )}
           <span className="text-[10px] text-ds-muted font-bold tracking-tighter bg-ds-bg/40 backdrop-blur-md px-2 py-0.5 rounded-lg border border-ds-divider/20">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`${wrapperClass} py-1 mt-2 hover:bg-ds-hover/30 rounded animate-fade-in`}
      onContextMenu={handleContextMenu}
    >
      {menuPos && <ContextMenu {...menuPos} options={menuOptions} onClose={() => setMenuPos(null)} />}
      
      <div className="w-[42px] h-[42px] flex-shrink-0">
        <img src={imageUrl} alt={realName} className="w-full h-full object-cover select-none rounded-full flex items-center justify-center border border-ds-divider/30" />
      </div>
      
      <div className="flex-1 min-w-0 pr-20">
        <div className="flex items-center gap-3 mb-0.5">
          <span className="font-bold text-[14.5px] tracking-tight" style={{ color: displayColor }}>{realName}</span>
          {isPlatformAdmin && (
            <span className="px-1.5 py-0.5 rounded-md bg-ds-accent/10 border border-ds-accent/30 text-[8px] font-black text-ds-accent uppercase tracking-tighter vibe-glow-blue align-middle select-none">
              РЎРћР—Р”РђРўР•Р›Р¬
            </span>
          )}
          {isServerAdmin && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[8px] font-black text-amber-500 uppercase tracking-tighter shadow-[0_0_8px_rgba(245,158,11,0.2)] align-middle select-none">
              РђР”РњРРќ
            </span>
          )}
          {/* Reaction button next to name on hover for main messages */}
          {!msg.isPending && (
            <div className="h-0 flex items-center">
               {reactionBtn}
            </div>
          )}
        </div>
        
        {isEditing ? EditUI : (
          msg.content && (
            <div className="flex items-end gap-2 text-[15px] leading-relaxed">
              <div className="text-ds-text break-all whitespace-pre-wrap opacity-90">
                <MessageContent content={msg.content} />
              </div>
              {msg.is_edited && (
                <span className="text-[10px] text-ds-muted italic opacity-60 ml-1 select-none">(РёР·РјРµРЅРµРЅРѕ)</span>
              )}
              {msg.isPending ? (
                 <span className="text-[9px] text-ds-accent animate-pulse font-black uppercase tracking-tighter mb-1 select-none flex-shrink-0">
                   РћРўРџР РђР’РљРђ...
                 </span>
              ) : (
                isMine && isRead !== undefined && (
                  <span className={`text-[11px] font-bold leading-none mb-1 select-none flex-shrink-0 ${isRead ? 'text-ds-accent vibe-glow-blue' : 'opacity-20'}`}>
                    {isRead ? 'вњ“вњ“' : 'вњ“'}
                  </span>
                )
              )}
            </div>
          )
        )}
        {msg.image_url && <Attachment url={msg.image_url} fileName={msg.file_name} previewUrl={msg.resolved_image_url} />}
        <ReactionList reactions={reactions} userId={currentUserId} onToggle={toggleReaction} />
      </div>

      {/* Time on hover on far right */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 vibe-time-final flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
         {expiryLabel && (
           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-ds-bg/60 backdrop-blur-md border border-ds-accent/20 text-ds-accent animate-pulse" title={expiryLabel}>
             <Trash2 size={10} strokeWidth={3} />
             <span className="text-[9px] font-black uppercase tracking-tighter">14d</span>
           </div>
         )}
         <span className="text-[10px] text-ds-muted font-bold tracking-tighter bg-ds-bg/40 backdrop-blur-md px-2 py-0.5 rounded-lg border border-ds-divider/20">{time}</span>
      </div>
    </div>
  );
}








