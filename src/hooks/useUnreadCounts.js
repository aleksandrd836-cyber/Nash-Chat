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

    // Мгновенный сброс в UI
    setCounts(prev => ({ ...prev, [channelId]: 0 }));

    try {
      // Обновляем метку времени в БД. 
      // Добавляем 1 секунду к текущему времени, чтобы мелкий рассинхрон с сервером не оставлял сообщение "непрочитанным"
      const futureDate = new Date();
      futureDate.setSeconds(futureDate.getSeconds() + 1);

      await supabase
        .from('channel_last_read')
        .upsert({ 
          user_id: userId, 
          channel_id: channelId, 
          last_read_at: futureDate.toISOString() 
        }, { onConflict: 'user_id, channel_id' });
    } catch (err) {
      console.warn('[useUnreadCounts] Ошибка сохранения прочтения:', err);
    }
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
      if (!channels) return;
      channelsRef.current = channels;

      // Получаем временные метки прочтения
      const { data: lastReadData } = await supabase
        .from('channel_last_read')
        .select('channel_id, last_read_at')
        .eq('user_id', userId);

      const newCounts = {};

      const promises = channels.map(async (ch) => {
        // Если это текущий канал - счетчик 0
        if (ch.id === activeChannelId) {
          newCounts[ch.id] = 0;
          return;
        }

        const clr = lastReadData?.find(l => l.channel_id === ch.id);
        const lastReadAt = clr?.last_read_at || '1970-01-01T00:00:00Z';

        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
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
  }, [userId, activeChannelId]);

  useEffect(() => {
    fetchInitialCounts();
  }, [fetchInitialCounts]);

  // 2. Подписка на Realtime
  useEffect(() => {
    if (!userId) return;

    const subscription = supabase
      .channel('global-unread-counts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const { channel_id, user_id: sender_id } = payload.new;
          
          // Не считаем свои сообщения
          if (sender_id === userId) return;

          // Если мы в этом канале - игнорируем инкремент и помечаем как прочитано
          if (channel_id === activeChannelId) {
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
