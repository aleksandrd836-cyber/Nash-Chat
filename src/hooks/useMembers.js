import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для загрузки всех зарегистрированных пользователей
 * и отслеживания их онлайн-статуса через Supabase Realtime Presence.
 */
export function useMembers(currentUser) {
  const [members, setMembers]     = useState([]);   // [{ id, username, color, isOnline }]
  const [loading, setLoading]     = useState(true);
  const channelRef                = useRef(null);

  // ── Загрузка списка всех пользователей из таблицы profiles ──
  useEffect(() => {
    if (!currentUser) return;

    async function fetchMembers() {
      // Используем таблицу profiles (создадим через SQL), либо читаем user_metadata через RPC
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, color')
        .order('username');

      if (!error && data) {
        setMembers(data.map(m => ({ ...m, isOnline: false })));
      }
      setLoading(false);
    }

    fetchMembers();

    // Подписка на изменения таблицы profiles (если пользователь обновил никнейм)
    const sub = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchMembers();
      })
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [currentUser?.id]);

  // ── Presence: отслеживаем кто онлайн ──
  useEffect(() => {
    if (!currentUser) return;

    const username = currentUser.user_metadata?.username ?? currentUser.email?.split('@')[0] ?? 'Unknown';
    const color    = currentUser.user_metadata?.user_color ?? null;

    const channel = supabase.channel('online-members', {
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

    return () => {
      channel.unsubscribe();
    };
  }, [currentUser?.id]);

  return { members, loading };
}
