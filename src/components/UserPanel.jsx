import React from 'react';
import { getUserAvatar } from '../lib/avatar';
import { Mic, MicOff, Headphones, LogOut, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';

/**
 * Нижняя панель пользователя (слева в сайдбаре).
 * Показывает аватар, имя, кнопки голоса и настроек.
 */
export const UserPanel = React.memo(({ onSignOut, voice, ownerId, currentUserId, username: propUsername }) => {
  const { 
    localUsername, 
    setSettingsOpen 
  } = useStore();
  
  const username = propUsername || localUsername || 'Пользователь';
  const { activeChannelId, isMuted, isDeafened, isSpeaking, toggleMute, toggleDeafen, leaveVoiceChannel } = voice;
  const { imageUrl } = getUserAvatar(username);

  return (
    <div className="h-auto py-3 bg-transparent flex-shrink-0 flex flex-col px-3 gap-3 border-t border-white/5 overflow-hidden relative">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ds-accent/20 to-transparent opacity-30" />
      
      {/* Top Row: Identity */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className={`relative flex-shrink-0 w-10 h-10 rounded-2xl bg-ds-sidebar/60 shadow-inner flex items-center justify-center transition-all duration-300
          ${isSpeaking ? 'ring-2 ring-ds-green shadow-[0_0_8px_rgba(35,165,89,0.5)] scale-105' : 'ring-1 ring-white/10'}`}
        >
          <div className="w-full h-full rounded-2xl overflow-hidden flex items-center justify-center">
            <img src={imageUrl} alt={username} className="w-full h-full object-cover select-none" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-ds-green border-2 border-ds-bg z-10 shadow-sm" />
        </div>

        {/* Username & Status */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className="text-ds-text text-[14px] font-black truncate leading-tight tracking-tight flex items-center gap-2">
            <span style={{ color: currentUserId === ownerId ? '#ff4444' : 'var(--ds-text)' }}>{username}</span>
            {['43751682-690e-4934-a9f2-7300a816b92d', '1380ae20-201a-4c77-aed3-93b3cb96f8d5'].includes(currentUserId) ? (
              <span className="px-1.5 py-0.5 rounded-md bg-ds-accent/10 border border-ds-accent/30 text-[8px] font-black text-ds-accent uppercase tracking-tighter vibe-glow-blue align-middle vibe-creator-badge select-none">
                СОЗДАТЕЛЬ
              </span>
            ) : currentUserId === ownerId ? (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[8px] font-black text-amber-500 uppercase tracking-tighter shadow-[0_0_8px_rgba(245,158,11,0.2)] align-middle select-none">
                АДМИН
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${activeChannelId ? 'bg-ds-green vibe-glow-green animate-pulse' : 'bg-ds-muted'}`} />
            <p className={`text-[9px] font-black uppercase tracking-[0.15em] truncate ${activeChannelId ? 'text-ds-green' : 'text-ds-muted'}`}>
              {activeChannelId ? 'В эфире' : 'В сети'}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Row: Controls */}
      <div className="flex items-center gap-1 p-0.5 rounded-xl border border-white/5 shadow-2xl bg-black/10 backdrop-blur-md">
        <div className="flex flex-1 items-center gap-0.5">
          {activeChannelId && (
            <>
              {/* Mute */}
              <button
                onClick={toggleMute}
                title={isMuted ? 'Включить микрофон' : 'Отключить микрофон'}
                className={`flex-1 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${isMuted ? 'text-ds-red bg-ds-red/10 hover:bg-ds-red/20 vibe-glow-red animate-pulse' : 'text-ds-muted hover:text-ds-accent hover:bg-ds-accent/10 hover:vibe-glow-blue'}`}
              >
                {isMuted ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {/* Deafen (НАУШНИКИ) */}
              <button
                onClick={toggleDeafen}
                title={isDeafened ? 'Включить звук' : 'Выключить звук'}
                className={`flex-1 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${isDeafened ? 'text-ds-red bg-ds-red/10 hover:bg-ds-red/20 vibe-glow-red animate-pulse' : 'text-ds-muted hover:text-ds-accent hover:bg-ds-accent/10 hover:vibe-glow-blue'}`}
              >
                <div className="slashed-container">
                  <Headphones className="w-4 h-4" />
                  {isDeafened && <div className="slashed-icon-line" style={{ height: '1.5px' }} />}
                </div>
              </button>

              {/* Leave */}
              <button
                onClick={leaveVoiceChannel}
                title="Выйти из голосового канала"
                className="flex-1 h-8 rounded-md flex items-center justify-center text-ds-muted hover:text-ds-red hover:bg-ds-red/10 transition-all duration-200"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Separator if needed */}
        {activeChannelId && <div className="w-px h-3 bg-white/5 mx-0.5" />}

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Настройки"
          className="w-8 h-8 rounded-md flex items-center justify-center text-ds-muted hover:text-ds-text hover:bg-white/10 transition-all duration-200 flex-shrink-0"
        >
          <Settings className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
});
