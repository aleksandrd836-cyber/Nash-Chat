import React from 'react';
import { getUserAvatar } from '../lib/avatar';

/**
 * Панель голосового канала.
 * Отображается вместо TextChannel, когда выбран voice-канал.
 * Показывает участников и управление голосом.
 */
export function VoiceChannel({ channel, user, username, userColor, voice }) {
  const {
    activeChannelId,
    participants,
    isMuted,
    isConnecting,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
  } = voice;

  const isInThisChannel = activeChannelId === channel?.id;

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-ds-bg">
        <p className="text-ds-muted">Выбери канал</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-ds-bg">
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-ds-divider/50 flex-shrink-0 bg-ds-bg/80 backdrop-blur-sm">
        <svg className="text-ds-muted w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
        <span className="text-ds-text font-semibold text-sm">{channel.name}</span>
        {isInThisChannel && (
          <span className="ml-auto flex items-center gap-1.5 text-ds-green text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-ds-green animate-pulse" />
            Подключён
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        {/* Channel visual */}
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-ds-sidebar border-4 border-ds-divider flex items-center justify-center mx-auto mb-4">
            <svg className={`w-12 h-12 ${isInThisChannel ? 'text-ds-green animate-pulse-soft' : 'text-ds-muted'}`}
              fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </div>
          <h2 className="text-ds-text text-2xl font-bold">{channel.name}</h2>
          <p className="text-ds-muted text-sm mt-1">
            {isInThisChannel
              ? `${participants.length} участник${participants.length === 1 ? '' : participants.length < 5 ? 'а' : 'ов'}`
              : 'Голосовой канал'}
          </p>
        </div>

        {/* Participants grid */}
        {isInThisChannel && participants.length > 0 && (
          <div className="flex flex-wrap gap-4 justify-center max-w-md">
            {participants.map((p) => {
              const { imageUrl, color } = getUserAvatar(p.username);
              return (
              <div key={p.userId} className="flex flex-col items-center gap-2 animate-fade-in">
                <div className="w-[96px] h-[96px] rounded-full bg-ds-bg shadow-[inset_0_0_15px_rgba(0,0,0,0.2)] overflow-hidden flex items-center justify-center">
                  <img
                    src={imageUrl}
                    alt={p.username}
                    className="w-[144px] h-[144px] max-w-none select-none"
                  />
                </div>
                <p 
                  className="text-ds-text font-semibold text-sm truncate w-full text-center group-hover:text-white transition-colors z-20 drop-shadow-md"
                  style={p.color ? { color: p.color } : {}}
                >
                  {p.username}
                </p>
              </div>
            )})}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 w-full max-w-xs">
          {!isInThisChannel ? (
            <button
              id="join-voice-btn"
              onClick={() => joinVoiceChannel(channel.id, user, username, userColor)}
              disabled={isConnecting}
              className="w-full py-3 rounded-xl bg-ds-green hover:bg-ds-green/90 active:scale-[0.98] text-white font-semibold transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-ds-green/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Подключение...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                  </svg>
                  Войти в канал
                </>
              )}
            </button>
          ) : (
            <div className="flex gap-3 w-full">
              {/* Mute toggle */}
              <button
                id="mute-btn"
                onClick={toggleMute}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all duration-150 flex items-center justify-center gap-2
                  ${isMuted
                    ? 'bg-ds-red/20 border border-ds-red/50 text-ds-red hover:bg-ds-red/30'
                    : 'bg-ds-input hover:bg-ds-hover text-ds-text border border-ds-divider/30'
                  }`}
              >
                {isMuted ? (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                    </svg>
                    Включить
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                    </svg>
                    Микрофон вкл.
                  </>
                )}
              </button>

              {/* Leave */}
              <button
                id="leave-voice-btn"
                onClick={leaveVoiceChannel}
                className="py-3 px-4 rounded-xl bg-ds-red/15 hover:bg-ds-red/25 text-ds-red border border-ds-red/30 font-semibold transition-all duration-150 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10.9 15.6L9.4 17c-.99-.63-1.88-1.42-2.58-2.34l1.59-1.59c.55.73 1.22 1.37 2.49 2.53zm7.42-7.23c-.68-.7-1.5-1.3-2.43-1.76l-1.59 1.59c.89.59 1.66 1.34 2.18 2.12l1.84-1.95zM21 1l-3 3c-.9-.52-1.87-.91-2.91-1.14L14 6c1.08.17 2.09.55 3 1.13L15.13 9H21v5.86L17 17v4l-3-3-.68.68L2.75 8l-.75.75 3 3v.11c0 3.63 1.78 6.84 4.5 8.82l2.05-2.05C9.77 17.46 9 15.79 9 14v-.13l1.9 1.9L12 14.13V21h-2L7 24l4-4v-2h5.86L19 16v6l4-4-3-3V3l1-2zM4 11L2 9l.75-.75L15.13 21H13v2l-4-4h6v-2.86L12 14v-2H7.14L5.13 9.86 4.27 11z"/>
                </svg>
                Выйти
              </button>
            </div>
          )}

          {!isInThisChannel && (
            <p className="text-ds-muted text-xs text-center">
              Браузер запросит разрешение на использование микрофона
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
