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
    <div className="h-auto py-3 bg-black/40 flex-shrink-0 flex flex-col px-3 gap-3 border-t border-white/5 overflow-hidden relative">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ds-accent/20 to-transparent opacity-30" />
      
      {/* Top Row: Identity */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className={`relative flex-shrink-0 w-10 h-10 rounded-2xl bg-black/60 shadow-inner flex items-center justify-center transition-all duration-300
          ${isSpeaking ? 'ring-2 ring-ds-accent vibe-glow-blue scale-105' : 'ring-1 ring-white/10'}`}
        >
          <div className="w-full h-full rounded-2xl overflow-hidden flex items-center justify-center">
            <img src={imageUrl} alt={username} className="w-full h-full object-cover select-none" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-ds-green border-2 border-[#0a0a0a] z-10 shadow-sm" />
        </div>

        {/* Username & Status */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className="text-white text-[14px] font-black truncate leading-tight tracking-tight" style={userColor ? { color: userColor } : {}}>
            {username}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${activeChannelId ? 'bg-ds-accent vibe-glow-blue animate-pulse' : 'bg-ds-muted/30'}`} />
            <p className={`text-[9px] font-black uppercase tracking-[0.15em] truncate ${activeChannelId ? 'text-ds-accent' : 'text-ds-muted'}`}>
              {activeChannelId ? 'В эфире' : 'В сети'}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Row: Controls */}
      <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5 shadow-2xl">
        <div className="flex flex-1 items-center gap-0.5">
          {activeChannelId && (
            <>
              {/* Mute */}
              <button
                onClick={toggleMute}
                title={isMuted ? 'Включить микрофон' : 'Отключить микрофон'}
                className={`flex-1 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${isMuted ? 'text-ds-red bg-ds-red/10 hover:bg-ds-red/20 vibe-glow-red animate-pulse' : 'text-white/40 hover:text-ds-accent hover:bg-ds-accent/10 hover:vibe-glow-blue'}`}
              >
                {isMuted ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                  </svg>
                )}
              </button>

              {/* Deafen (НАУШНИКИ) */}
              <button
                onClick={toggleDeafen}
                title={isDeafened ? 'Включить звук' : 'Выключить звук'}
                className={`flex-1 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${isDeafened ? 'text-ds-red bg-ds-red/10 hover:bg-ds-red/20 vibe-glow-red animate-pulse' : 'text-white/40 hover:text-ds-accent hover:bg-ds-accent/10 hover:vibe-glow-blue'}`}
              >
                {isDeafened ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12v7c0 1.1.9 2 2 2h3v-8H4v-1c0-4.41 3.59-8 8-8s8 3.59 8 8v1h-3v8h3c1.1 0 2-.9 2-2v-7c0-5.52-4.48-10-10-10zm-6 17H4v-5h2v5zm14 0h-2v-5h2v5z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12v7c0 1.1.9 2 2 2h3v-8H4v-1c0-4.41 3.59-8 8-8s8 3.59 8 8v1h-3v8h3c1.1 0 2-.9 2-2v-7c0-5.52-4.48-10-10-10zm-6 17H4v-5h2v5zm14 0h-2v-5h2v5z"/>
                  </svg>
                )}
              </button>

              {/* Leave */}
              <button
                onClick={leaveVoiceChannel}
                title="Выйти из голосового канала"
                className="flex-1 h-8 rounded-md flex items-center justify-center text-white/20 hover:text-ds-red hover:bg-ds-red/10 transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Separator if needed */}
        {activeChannelId && <div className="w-px h-3 bg-white/5 mx-0.5" />}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Настройки"
          className="w-8 h-8 rounded-md flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-all duration-200 flex-shrink-0"
        >
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
