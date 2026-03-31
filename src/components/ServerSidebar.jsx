import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';

/**
 * Вертикальная панель серверов слева.
 * Отображает иконки серверов участника и кнопку "+" для создания/вступления.
 */
export function ServerSidebar({ currentUserId, selectedServerId, onSelectServer, onCreateServer, refreshTrigger }) {
  const [servers, setServers] = useState([]);

  const fetchServers = useCallback(async () => {
    if (!currentUserId) return;
    const { data, error } = await supabase
      .from('server_members')
      .select('server_id, role, servers(id, name, owner_id, invite_code)')
      .eq('user_id', currentUserId);
    if (!error && data) {
      setServers(data.map(row => ({ ...row.servers, role: row.role })));
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchServers();
    const sub = supabase
      .channel('server-members-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'server_members',
        filter: `user_id=eq.${currentUserId}`,
      }, fetchServers)
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [currentUserId, fetchServers, refreshTrigger]); // refreshTrigger заставляет перезапросить список

  return (
    <div className="w-[72px] flex-shrink-0 bg-ds-servers/92 backdrop-blur-[40px] flex flex-col items-center py-3 gap-3 overflow-y-auto no-scrollbar select-none">
      {/* Список серверов */}
      {servers.map(server => {
        const isSelected = selectedServerId === server.id;
        const initial = server.name?.[0]?.toUpperCase() ?? '?';
        const colors = ['#5865F2', '#23A55A', '#F0B232', '#EB459E', '#F23F42', '#9B59B6', '#E67E22'];
        const colorIndex = server.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
        const iconColor = colors[colorIndex];

        return (
          <div key={server.id} className="relative group flex items-center">
            {/* Полоска активного сервера — ВАЙБОВЫЙ циановый неон */}
            <div className={`absolute left-0 w-1 rounded-r-full bg-ds-accent transition-all duration-300 shadow-[0_0_12px_#00f0ff] ${
              isSelected ? 'h-10' : 'h-5 opacity-0 group-hover:opacity-100 group-hover:h-8'
            }`} />

            <button
              onClick={() => onSelectServer(server)}
              title={server.name}
              className={`w-12 h-12 transition-all duration-500 flex items-center justify-center font-black text-[13px] tracking-tighter shadow-2xl ml-3 flex-shrink-0 relative overflow-hidden group/btn border-2 server-sidebar-btn
                ${isSelected 
                  ? 'rounded-[14px] bg-ds-sidebar text-ds-text vibe-glow-blue border-ds-accent' 
                  : 'rounded-[18px] hover:rounded-[12px] bg-ds-servers/60 backdrop-blur-md text-ds-muted hover:text-ds-text hover:scale-110'
                }`}
              style={!isSelected ? { borderColor: `${iconColor}44` } : {}}
            >
              {/* Буква (увеличиваем при наведении) */}
              <span className={`relative z-10 transition-transform duration-500 ${!isSelected ? 'group-hover/btn:scale-125' : ''}`}>
                {initial}
              </span>

              {/* Фоновое свечение (только при наведении или выборе) */}
              <div 
                className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${
                    isSelected ? 'opacity-30' : 'opacity-0 group-hover/btn:opacity-20'
                }`}
                style={{ backgroundColor: iconColor }}
              />

              {isSelected && <div className="absolute inset-0 vibe-moving-glow opacity-30" />}
              {!isSelected && (
                 <div className="absolute inset-0 rounded-inherit pointer-events-none" />
              )}
            </button>
          </div>
        );
      })}

      {/* Разделитель */}
      <div className="w-8 h-[2px] bg-ds-divider/40 rounded-lg mx-auto my-1 flex-shrink-0" />

      {/* Кнопка "+" — создать или войти */}
      <div className="relative group flex items-center flex-shrink-0">
        <div className="absolute left-0 w-1 rounded-r-full bg-ds-accent opacity-0 group-hover:h-5 group-hover:opacity-100 transition-all duration-300 h-0 shadow-[0_0_10px_#00f0ff]" />
        <button
          onClick={onCreateServer}
          title="Создать или войти на сервер"
          className="w-12 h-12 rounded-[24px] hover:rounded-[14px] transition-all duration-300 bg-ds-sidebar hover:bg-ds-accent text-ds-accent hover:text-black border border-white/5 flex items-center justify-center shadow-lg ml-3 group"
        >
          <svg className="w-6 h-6 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
