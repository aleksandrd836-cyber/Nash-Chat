import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для отслеживания количества непрочитанных сообщений во всех текстовых каналах.
 */
export function useUnreadCounts(userId, activeChannelId) {
  const [counts, setCounts]   = useState({}); // { channelId: number }
  const [loading, setLoading] = useState(true);
  const channelsRef           = useRef([]);

  /** Отметить канал как прочитанный */
  const markAsRead = useCallback(async (channelId) => {
    if (!userId || !channelId) return;

    // Обновляем метку времени в БД
    await supabase
      .from('channel_last_read')
      .upsert({ 
        user_id: userId, 
        channel_id: channelId, 
        last_read_at: new Date().toISOString() 
      }, { onConflict: 'user_id, channel_id' });

    setCounts(prev => ({ ...prev, [channelId]: 0 }));
  }, [userId]);

  // Сбрасываем счетчик и обновляем сервер при смене активного канала
  useEffect(() => {
    if (activeChannelId) {
      markAsRead(activeChannelId);
    }
  }, [activeChannelId, markAsRead]);

  // 1. Загружаем начальные значения
  const fetchInitialCounts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      // Получаем список всех текстовых каналов
      const { data: channels } = await supabase.from('channels').select('id').eq('type', 'text');
      channelsRef.current = channels || [];

      // Получаем временные метки прочтения для текущего пользователя
      const { data: lastReadData } = await supabase
        .from('channel_last_read')
        .select('channel_id, last_read_at')
        .eq('user_id', userId);

      const newCounts = {};

      // Для каждого канала считаем количество новых сообщений
      const promises = channelsRef.current.map(async (ch) => {
        const clr = lastReadData?.find(l => l.channel_id === ch.id);
        const lastReadAt = clr?.last_read_at || '1970-01-01T00:00:00Z';

        const { count, error } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', ch.id)
          .gt('created_at', lastReadAt);

        if (!error) {
          newCounts[ch.id] = count || 0;
        }
      });

      await Promise.all(promises);
      setCounts(newCounts);
    } catch (err) {
      console.error('Ошибка загрузки счетчиков:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchInitialCounts();
  }, [fetchInitialCounts]);

  // 2. Подписка на Realtime (новые сообщения во всех каналах)
  useEffect(() => {
    if (!userId) return;

    const subscription = supabase
      .channel('global-unread-counts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const { channel_id, user_id: sender_id } = payload.new;
          
          if (sender_id === userId) return;

          if (channel_id === activeChannelId) {
            // Если мы в этом канале, просто обновляем метку прочтения в фоне (без частого спама)
            markAsRead(channel_id);
            return;
          }

          setCounts(prev => ({
            ...prev,
            [channel_id]: (prev[channel_id] || 0) + 1
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId, activeChannelId, markAsRead]);

  return { counts, loading, markAsRead, refresh: fetchInitialCounts };
}
