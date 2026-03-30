import React from 'react';
import { getUserAvatar } from '../lib/avatar';

/**
 * Нижняя панель пользователя (слева в сайдбаре).
 * Показывает аватар, имя, кнопки голоса и настроек.
 */
export function UserPanel({ username, userColor, onSignOut, voice, onOpenSettings }) {
  const { activeChannelId, isMuted, isDeafened, isSpeaking, toggleMute, toggleDeafen, leaveVoiceChannel } = voice;
  const { imageUrl } = getUserAvatar(username);

  return (
    <div className="h-14 bg-ds-servers flex-shrink-0 flex items-center px-1.5 gap-1.5 border-t border-ds-divider/30 overflow-hidden">
      {/* Avatar */}
      <div className={`relative flex-shrink-0 w-8 h-8 rounded-full bg-ds-bg shadow-[inset_0_0_8px_rgba(0,0,0,0.2)] flex items-center justify-center transition-all duration-150
        ${isSpeaking ? 'ring-2 ring-ds-green' : 'ring-1 ring-white/5'}`}
      >
        <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
          <img src={imageUrl} alt={username} className="w-[48px] h-[48px] max-w-none select-none" />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-ds-green border-2 border-ds-servers z-10" />
      </div>

      {/* Username & Status */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-ds-text text-[13px] font-bold truncate leading-none mb-0.5" style={userColor ? { color: userColor } : {}}>
          {username}
        </p>
        <p className={`text-[9px] font-medium leading-none truncate ${activeChannelId ? 'text-ds-green' : 'text-ds-muted'}`}>
          {activeChannelId ? 'В голосовом' : 'Онлайн'}
        </p>
      </div>

      {/* Controls Container */}
      <div className="flex items-center gap-0">
        {activeChannelId && (
          <>
            {/* Mute */}
            <button
              onClick={toggleMute}
              title={isMuted ? 'Включить микрофон' : 'Отключить микрофон'}
              className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${isMuted ? 'text-ds-red hover:bg-ds-red/10' : 'text-ds-muted hover:text-ds-text hover:bg-ds-hover'}`}
            >
              {isMuted ? (
                <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </svg>
              )}
            </button>

            {/* Deafen (НАУШНИКИ) */}
            <button
              onClick={toggleDeafen}
              title={isDeafened ? 'Включить звук' : 'Выключить звук'}
              className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${isDeafened ? 'text-ds-red hover:bg-ds-red/10' : 'text-ds-muted hover:text-ds-text hover:bg-ds-hover'}`}
            >
              {isDeafened ? (
                <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12v7c0 1.1.9 2 2 2h3v-8H4v-1c0-4.41 3.59-8 8-8s8 3.59 8 8v1h-3v8h3c1.1 0 2-.9 2-2v-7c0-5.52-4.48-10-10-10zm-6 17H4v-5h2v5zm14 0h-2v-5h2v5z"/>
                  <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12v7c0 1.1.9 2 2 2h3v-8H4v-1c0-4.41 3.59-8 8-8s8 3.59 8 8v1h-3v8h3c1.1 0 2-.9 2-2v-7c0-5.52-4.48-10-10-10zm-6 17H4v-5h2v5zm14 0h-2v-5h2v5z"/>
                </svg>
              )}
            </button>

            {/* Leave */}
            <button
              onClick={leaveVoiceChannel}
              title="Выйти"
              className="w-7 h-7 rounded flex items-center justify-center text-ds-muted hover:text-ds-red hover:bg-ds-red/10 transition-colors"
            >
              <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 9v-4l8 7-8 7v-4H8V9h8zM2 3h14v2H4v14h12v2H2V3z"/>
              </svg>
            </button>
          </>
        )}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Настройки"
          className="w-7 h-7 rounded flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-ds-hover transition-colors"
        >
          <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.01 7.01 0 0 0-1.62-.94l-.36-2.54A.484.484 0 0 0 14 2h-4a.484.484 0 0 0-.48.41l-.36 2.54a7.38 7.38 0 0 0-1.62.94l-2.39-.96a.477.477 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.49.41h4c.22 0 .43-.17.47-.41l.36-2.54a7.38 7.38 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/>
          </svg>
        </button>

        {/* Logout */}
        <button
          onClick={onSignOut}
          title="Выход"
          className="w-7 h-7 rounded flex items-center justify-center text-ds-muted hover:text-ds-red hover:bg-ds-red/10 transition-colors"
        >
          <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
