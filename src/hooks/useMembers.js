import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для загрузки участников текущего сервера и отслеживания их онлайн-статуса.
 * Если serverId не передан — возвращает пустой массив.
 */
export function useMembers(currentUser, serverId) {
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const channelRef                = useRef(null);

  // ── Загрузка участников текущего сервера ──
  useEffect(() => {
    if (!currentUser || !serverId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    async function fetchMembers() {
      const { data, error } = await supabase
        .from('server_members')
        .select('user_id, role, profiles(id, username, color)')
        .eq('server_id', serverId);

      if (!error && data) {
        setMembers(data.map(row => ({
          ...row.profiles,
          role: row.role,
          isOnline: false,
        })));
      }
      setLoading(false);
    }

    fetchMembers();

    // Подписка на изменения состава сервера
    const sub = supabase
      .channel(`server-members-${serverId}`)
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

  // ── Presence: отслеживаем онлайн-статус ──
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
        setMembers(prev => prev.map(m => ({ ...m, isOnline: onlineIds.has(m.id) })));
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setMembers(prev => prev.map(m => m.id === key ? { ...m, isOnline: true } : m));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
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
