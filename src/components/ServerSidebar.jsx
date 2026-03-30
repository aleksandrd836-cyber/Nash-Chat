import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';

/**
 * Вертикальная панель серверов слева.
 * Отображает иконки серверов участника и кнопку "+" для создания/вступления.
 */
export function ServerSidebar({ currentUserId, selectedServerId, onSelectServer, onCreateServer, onJoinServer }) {
  const [servers, setServers] = useState([]);

  const fetchServers = useCallback(async () => {
    if (!currentUserId) return;
    const { data, error } = await supabase
      .from('server_members')
      .select('server_id, role, servers(id, name, owner_id)')
      .eq('user_id', currentUserId);
    if (!error && data) {
      setServers(data.map(row => ({ ...row.servers, role: row.role })));
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchServers();
    // Подписка на изменения членства
    const sub = supabase
      .channel('server-members-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'server_members',
        filter: `user_id=eq.${currentUserId}`,
      }, fetchServers)
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [currentUserId, fetchServers]);

  return (
    <div className="w-[72px] flex-shrink-0 bg-ds-servers flex flex-col items-center py-3 gap-2 overflow-y-auto">
      {/* Список серверов */}
      {servers.map(server => {
        const isSelected = selectedServerId === server.id;
        const initial = server.name?.[0]?.toUpperCase() ?? '?';
        // Цвет иконки на основе названия
        const colors = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#9B59B6', '#E67E22'];
        const colorIndex = server.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
        const iconColor = colors[colorIndex];

        return (
          <div key={server.id} className="relative group flex items-center">
            {/* Полоска активного сервера */}
            <div className={`absolute left-0 w-1 rounded-r-full bg-ds-text transition-all duration-200 ${
              isSelected ? 'h-10' : 'h-5 opacity-0 group-hover:opacity-100'
            }`} />

            <button
              onClick={() => onSelectServer(server)}
              title={server.name}
              className={`w-12 h-12 rounded-[50%] hover:rounded-[30%] transition-all duration-200 flex items-center justify-center font-bold text-lg text-white shadow-lg ml-3 flex-shrink-0 ${
                isSelected ? 'rounded-[30%]' : ''
              }`}
              style={{ backgroundColor: iconColor }}
            >
              {initial}
            </button>
          </div>
        );
      })}

      {/* Разделитель */}
      {servers.length > 0 && (
        <div className="w-8 h-0.5 bg-ds-divider/50 rounded-full mx-auto my-1 flex-shrink-0" />
      )}

      {/* Кнопка "+" — создать или войти */}
      <div className="relative group flex items-center flex-shrink-0">
        <div className="absolute left-0 w-1 rounded-r-full bg-ds-green opacity-0 group-hover:h-5 group-hover:opacity-100 transition-all duration-200 h-0" />
        <button
          onClick={onCreateServer}
          title="Создать или войти на сервер"
          className="w-12 h-12 rounded-[50%] hover:rounded-[30%] transition-all duration-200 bg-ds-hover hover:bg-ds-green flex items-center justify-center text-ds-green hover:text-white shadow ml-3 group"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
