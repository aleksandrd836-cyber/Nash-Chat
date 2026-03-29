import React, { useState } from 'react';

const COLORS = [
  '#5865F2','#57F287','#FEE75C','#EB459E',
  '#ED4245','#9B59B6','#E67E22','#1ABC9C',
];

/** Стабильный цвет аватара по имени */
function nameToColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** Инициал для аватара */
function initial(name = '') {
  return (name[0] ?? '?').toUpperCase();
}

/** Компонент для отображения изображения с увеличением по клику */
function ImageAttachment({ url }) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <>
      <img
        src={url}
        alt="Вложение"
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
            alt="Вложение (полный размер)"
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
          />
          <button
            className="absolute top-4 right-4 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
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

/**
 * Компонент одного сообщения.
 * Поддерживает compact-режим и отображение прикреплённых изображений.
 */
export function Message({ msg, prevMsg }) {
  const isSameAuthor =
    prevMsg &&
    prevMsg.username === msg.username &&
    new Date(msg.created_at) - new Date(prevMsg.created_at) < 5 * 60 * 1000;

  const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const fullTime = new Date(msg.created_at).toLocaleString('ru-RU');

  if (isSameAuthor) {
    return (
      <div className="group flex items-start gap-3 px-4 py-0.5 hover:bg-ds-hover/30 rounded transition-colors">
        {/* Вместо аватара — время при наведении */}
        <div className="w-10 flex-shrink-0 flex items-center justify-end">
          <span className="text-[10px] text-ds-muted hidden group-hover:block">{time}</span>
        </div>
        <div className="flex-1 min-w-0">
          {msg.content && (
            <p className="text-ds-text text-sm leading-relaxed break-words">{msg.content}</p>
          )}
          {msg.image_url && <ImageAttachment url={msg.image_url} />}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-4 py-1 mt-2 hover:bg-ds-hover/30 rounded transition-colors animate-fade-in">
      {/* Аватар */}
      <div
        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm select-none"
        style={{ background: nameToColor(msg.username) }}
      >
        {initial(msg.username)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Шапка: имя + время */}
        <div className="flex items-baseline gap-2">
          <span
            className="font-semibold text-sm"
            style={{ color: nameToColor(msg.username) }}
          >
            {msg.username}
          </span>
          <span className="text-[10px] text-ds-muted" title={fullTime}>{time}</span>
        </div>

        {/* Текст */}
        {msg.content && (
          <p className="text-ds-text text-sm leading-relaxed break-words">{msg.content}</p>
        )}

        {/* Изображение */}
        {msg.image_url && <ImageAttachment url={msg.image_url} />}
      </div>
    </div>
  );
}
