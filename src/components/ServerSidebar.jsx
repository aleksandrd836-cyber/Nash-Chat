import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAvatar } from '../lib/avatar';
import { AlertTriangle, Info } from 'lucide-react';

/**
 * Вертикальная панель серверов слева.
 * Отображает иконки серверов участника и кнопку "+" для создания/вступления.
 */
export function ServerSidebar({ currentUserId, selectedServerId, onSelectServer, onCreateServer, onHomeClick, onServerStateSync, refreshTrigger }) {
  const [servers, setServers] = useState([]);
  const [imageErrors, setImageErrors] = useState({});
  const [isSlow, setIsSlow] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const selectedServerSnapshotRef = useRef('');
  const onServerStateSyncRef = useRef(onServerStateSync);

  useEffect(() => {
    onServerStateSyncRef.current = onServerStateSync;
  }, [onServerStateSync]);

  const fetchServers = useCallback(async () => {
    if (!currentUserId) return;
    setIsLoading(true);
    const start = Date.now();
    
    const { data, error } = await supabase
      .from('server_members')
      .select('server_id, role, servers(id, name, owner_id, invite_code, icon_url)')
      .eq('user_id', currentUserId);
      
    const end = Date.now();
    if (end - start > 7000) setIsSlow(true); // Если грузится дольше 7 секунд
    else setIsSlow(false);

    if (!error && data) {
      const nextServers = data.map(row => ({ ...row.servers, role: row.role }));
      setServers(nextServers);

      if (selectedServerId) {
        const selectedServer = nextServers.find((server) => server.id === selectedServerId) || null;

        if (!selectedServer) {
          selectedServerSnapshotRef.current = '';
          onServerStateSyncRef.current?.(null);
        } else {
          const snapshot = JSON.stringify({
            id: selectedServer.id,
            name: selectedServer.name,
            icon_url: selectedServer.icon_url,
            owner_id: selectedServer.owner_id,
            invite_code: selectedServer.invite_code,
            role: selectedServer.role,
          });

          if (selectedServerSnapshotRef.current !== snapshot) {
            selectedServerSnapshotRef.current = snapshot;
            onServerStateSyncRef.current?.(selectedServer);
          }
        }
      } else {
        selectedServerSnapshotRef.current = '';
      }
    }
    setIsLoading(false);
  }, [currentUserId, selectedServerId]);

  useEffect(() => {
    fetchServers();
    const sub = supabase
      .channel('server-members-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'server_members',
        filter: `user_id=eq.${currentUserId}`,
      }, fetchServers)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'servers',
      }, fetchServers)
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [currentUserId, fetchServers, refreshTrigger]); // refreshTrigger заставляет перезапросить список

  return (
    <div className="w-[72px] flex-shrink-0 flex flex-col items-center py-3 gap-3 overflow-y-auto no-scrollbar select-none vibe-rail vibe-rail--servers">
      
      {/* Vibe Logo Button / Home */}
      <div className="relative group flex items-center mb-1">
        {/* Полоска активного "логотипа" (когда на главной) */}
        {!selectedServerId && (
          <div className="absolute left-0 w-1 h-10 rounded-r-full bg-ds-accent transition-all duration-300 shadow-[0_0_12px_#00f0ff]" />
        )}
        
        <button
          onClick={onHomeClick}
          title="Vibe — Главная"
          className={`w-12 h-12 transition-all duration-300 flex items-center justify-center shadow-2xl ml-3 flex-shrink-0 relative overflow-hidden group/btn border-2 vibe-nav-orb
            ${!selectedServerId 
              ? 'rounded-[14px] bg-ds-sidebar text-ds-accent vibe-glow-blue vibe-nav-orb--active border-ds-accent' 
              : 'rounded-[24px] hover:rounded-[14px] bg-ds-servers/40 backdrop-blur-md text-ds-accent/80 hover:text-ds-accent border-white/5 hover:border-ds-accent/40'
            }`}
        >
          {/* Иконка Звезды Vibe */}
          <svg viewBox="0 0 24 24" className={`w-7 h-7 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)] group-hover/btn:drop-shadow-[0_0_15px_rgba(0,240,255,0.8)] transition-all duration-300 ${!selectedServerId ? 'vibe-logo-glow animate-vibe-pulse' : 'vibe-logo-glow opacity-80 group-hover:opacity-100'}`}>
            <path fill="currentColor" d="M12 2L14.4 8.6H21L15.6 12.7L18 19.3L12 15.2L6 19.3L8.4 12.7L3 8.6H9.6L12 2Z" />
          </svg>
          
          {/* Внутренняя анимация свечения */}
          <div className="absolute inset-0 vibe-moving-glow opacity-[0.15] pointer-events-none" />
        </button>
      </div>

      {/* Разделитель */}
      <div className="w-8 vibe-divider-soft rounded-lg mx-auto mb-1 flex-shrink-0" />

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
              className={`w-12 h-12 transition-all duration-500 flex items-center justify-center font-black text-[13px] tracking-tighter shadow-2xl ml-3 flex-shrink-0 relative overflow-hidden group/btn border-2 server-sidebar-btn vibe-nav-orb
                ${isSelected 
                  ? 'rounded-[14px] bg-ds-sidebar text-ds-text vibe-glow-blue vibe-nav-orb--active border-ds-accent' 
                  : 'rounded-[18px] hover:rounded-[12px] bg-ds-servers/60 backdrop-blur-md text-ds-muted hover:text-ds-text hover:scale-110'
                }`}
              style={!isSelected ? { borderColor: `${iconColor}44` } : {}}
            >
              {/* Буква (FALLBACK) или Иконка */}
              {server.icon_url && !imageErrors[server.id] ? (
                <img 
                   src={server.icon_url} 
                   alt={server.name} 
                   loading="lazy"
                   onError={() => setImageErrors(prev => ({ ...prev, [server.id]: true }))}
                   className={`w-full h-full object-cover transition-transform duration-500 ${!isSelected ? 'group-hover/btn:scale-110' : ''}`}
                />
              ) : (
                <span className={`relative z-10 transition-transform duration-500 ${!isSelected ? 'group-hover/btn:scale-125' : ''}`}>
                   {initial}
                </span>
              )}

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
      <div className="w-8 vibe-divider-soft rounded-lg mx-auto my-1 flex-shrink-0" />

      {/* Кнопка "+" — создать или войти */}
      <div className="relative group flex items-center flex-shrink-0">
        <div className="absolute left-0 w-1 rounded-r-full bg-ds-accent opacity-0 group-hover:h-5 group-hover:opacity-100 transition-all duration-300 h-0 shadow-[0_0_10px_#00f0ff]" />
        <button
          onClick={onCreateServer}
          title="Создать или войти на сервер"
          className="w-12 h-12 rounded-[24px] hover:rounded-[14px] transition-all duration-300 bg-ds-sidebar hover:bg-ds-accent text-ds-accent hover:text-black border border-white/5 flex items-center justify-center shadow-lg ml-3 group vibe-nav-orb"
        >
          <svg className="w-6 h-6 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Network Stability Warning (Zapret Compatibility) */}
      {isSlow && (
        <div className="mt-auto mb-4 px-3 flex flex-col items-center gap-2 group relative">
          <div className="w-10 h-10 rounded-xl bg-ds-red/10 flex items-center justify-center text-ds-red animate-pulse cursor-help border border-ds-red/20 shadow-[0_0_15px_rgba(242,63,66,0.2)]">
            <AlertTriangle size={20} />
          </div>
          
          {/* Tooltip */}
          <div className="absolute left-[70px] bg-ds-sidebar border border-ds-divider p-3 rounded-xl shadow-2xl w-56 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 z-[100] translate-x-2 group-hover:translate-x-0">
             <div className="flex items-center gap-2 mb-2 text-ds-red">
                <Info size={14} />
                <span className="text-[10px] font-black uppercase tracking-wider">Сеть замедлена</span>
             </div>
             <p className="text-[10px] text-ds-text leading-relaxed font-medium">
                Если у вас включен <b>Zapret</b>, запустите <span className="text-ds-accent font-bold">vibe_fixer.ps1</span> из папки с Запретом или добавьте <span className="text-ds-accent">supabase.co</span> в белый список.
             </p>
          </div>
        </div>
      )}
    </div>
  );
}

