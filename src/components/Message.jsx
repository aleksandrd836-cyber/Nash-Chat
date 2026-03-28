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

/**
 * Компонент одного сообщения.
 * Поддерживает compact-режим (компактный показ если тот же автор и < 5 мин)
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
        <p className="text-ds-text text-sm leading-relaxed break-words flex-1">{msg.content}</p>
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
        <p className="text-ds-text text-sm leading-relaxed break-words">{msg.content}</p>
      </div>
    </div>
  );
}
