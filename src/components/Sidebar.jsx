import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserPanel } from './UserPanel';

/**
 * Боковая панель со списком каналов.
 * Каналы загружаются из Supabase один раз при монтировании.
 */
export function Sidebar({ username, selectedChannel, onSelectChannel, onSignOut, voice, onOpenSettings }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading]   = useState(true);

  const { activeChannelId, allParticipants } = voice;

  useEffect(() => {
    supabase
      .from('channels')
      .select('*')
      .order('position')
      .then(({ data }) => {
        setChannels(data ?? []);
        setLoading(false);
      });
  }, []);

  const textChannels  = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  return (
    <div className="w-60 flex-shrink-0 bg-ds-sidebar flex flex-col">
      {/* Server header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-ds-divider/50 flex-shrink-0 cursor-default">
        <span className="text-ds-text font-bold text-sm truncate">🎮 NashChat</span>
        <svg className="w-4 h-4 text-ds-muted flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-ds-muted border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Text channels */}
            <div>
              <p className="text-ds-muted text-[11px] font-semibold uppercase tracking-wider px-2 mb-1">
                Текстовые каналы
              </p>
              {textChannels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => onSelectChannel(ch)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                    ${selectedChannel?.id === ch.id
                      ? 'bg-ds-active text-ds-text'
                      : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'
                    }`}
                >
                  <span className="text-base leading-none opacity-70">#</span>
                  <span className="truncate">{ch.name}</span>
                </button>
              ))}
            </div>

            {/* Voice channels */}
            <div>
              <p className="text-ds-muted text-[11px] font-semibold uppercase tracking-wider px-2 mb-1">
                Голосовые каналы
              </p>
              {voiceChannels.map(ch => {
                const isActive       = activeChannelId === ch.id;
                const chParticipants = allParticipants[ch.id] || [];

                return (
                  <div key={ch.id}>
                    <button
                      onClick={() => onSelectChannel(ch)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                        ${selectedChannel?.id === ch.id
                          ? 'bg-ds-active text-ds-text'
                          : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'
                        }`}
                    >
                      <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-ds-green' : 'opacity-60'}`}
                        fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                      <span className="truncate flex-1 text-left">{ch.name}</span>
                      {chParticipants.length > 0 && (
                        <span className={`text-[10px] font-semibold ml-auto ${isActive ? 'text-ds-green' : 'text-ds-muted'}`}>
                          {chParticipants.length}
                        </span>
                      )}
                    </button>

                    {/* Показываем участников голосового канала всем */}
                    {chParticipants.length > 0 && (
                      <div className="ml-6 mt-0.5 space-y-0.5">
                        {chParticipants.map(p => (
                          <div key={p.userId} className="flex items-center gap-1.5 px-2 py-0.5">
                            <div className="w-5 h-5 rounded-full bg-ds-green/20 border border-ds-green/40 flex items-center justify-center">
                              <span className="text-[9px] text-ds-green font-bold">
                                {(p.username?.[0] ?? '?').toUpperCase()}
                              </span>
                            </div>
                            <span className="text-[11px] text-ds-muted truncate">{p.username}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* User panel */}
      <UserPanel username={username} onSignOut={onSignOut} voice={voice} onOpenSettings={onOpenSettings} />
    </div>
  );
}
