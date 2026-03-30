import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для загрузки участников текущего сервера и отслеживания онлайн-статуса.
 * Использует RPC get_server_members (SECURITY DEFINER) чтобы обойти проблемы RLS и foreign key join.
 */
export function useMembers(currentUser, serverId) {
  const presenceIdsRef = useRef(new Set());
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  // ── Загрузка участников через RPC ──
  useEffect(() => {
    if (!currentUser || !serverId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    async function fetchMembers() {
      const { data, error } = await supabase
        .rpc('get_server_members', { p_server_id: serverId });

      if (error) {
        console.error('[useMembers] Ошибка загрузки участников:', error);
        setMembers([]);
      } else {
        // Пытаемся сохранить текущий онлайн-статус при перезагрузке списка
        setMembers((data ?? []).map(m => ({ 
          ...m, 
          isOnline: presenceIdsRef.current.has(m.id) 
        })));
      }
      setLoading(false);
    }

    fetchMembers();

    // Обновляем при изменении состава сервера или профилей
    const sub = supabase
      .channel(`server-members-watch-${serverId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'server_members',
        filter: `server_id=eq.${serverId}`,
      }, fetchMembers)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
      }, fetchMembers)
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [currentUser?.id, serverId]);

  // ── Presence: онлайн-статус ──
  useEffect(() => {
    if (!currentUser || !serverId) return;

    const username = currentUser.user_metadata?.username ?? currentUser.email?.split('@')[0] ?? 'Unknown';
    const color    = currentUser.user_metadata?.user_color ?? null;

    const channel = supabase.channel(`online-${serverId}`, {
      config: { presence: { key: currentUser.id } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set(Object.keys(state));
        presenceIdsRef.current = onlineIds; // Обновляем реф для будущих fetchMembers
        
        setMembers(prev => prev.map(m => ({ 
          ...m, 
          isOnline: onlineIds.has(m.id) 
        })));
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        presenceIdsRef.current.add(key);
        setMembers(prev => prev.map(m => m.id === key ? { ...m, isOnline: true } : m));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        presenceIdsRef.current.delete(key);
        setMembers(prev => prev.map(m => m.id === key ? { ...m, isOnline: false } : m));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ username, color, online_at: new Date().toISOString() });
        }
      });

    return () => { channel.unsubscribe(); };
  }, [currentUser?.id, serverId]);

  return { members, loading };
}
