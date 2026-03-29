import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для отслеживания непрочитанных личных сообщений.
 */
export function useUnreadDMs(currentUserId, activeDMId) {
  const [unreadCounts, setUnreadCounts] = useState({});
  const activeDMRef = useRef(activeDMId);

  useEffect(() => {
    activeDMRef.current = activeDMId;
  }, [activeDMId]);

  useEffect(() => {
    if (!currentUserId) return;

    let mounted = true;

    // 1. Грузим последние 100 входящих сообщений и проверяем локальный last_read
    const fetchUnreads = async () => {
      const { data } = await supabase
        .from('direct_messages')
        .select('sender_id, created_at')
        .eq('receiver_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (data && mounted) {
        const counts = {};
        data.forEach(msg => {
          const lastRead = localStorage.getItem(`dm_last_read_${msg.sender_id}`) || 0;
          if (new Date(msg.created_at).getTime() > Number(lastRead)) {
            counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
          }
        });
        setUnreadCounts(counts);
      }
    };
    
    fetchUnreads();

    // 2. Слушаем новые входящие сообщения из БД
    const sub = supabase.channel('global-docs-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${currentUserId}` }, (payload) => {
        const msg = payload.new;
        if (msg.sender_id === activeDMRef.current) {
          // Если чат открыт — сразу помечаем как прочитанное (обновляем время)
          localStorage.setItem(`dm_last_read_${msg.sender_id}`, Date.now().toString());
        } else {
          // Иначе увеличиваем счетчик непрочитанных
          setUnreadCounts(prev => ({
            ...prev,
            [msg.sender_id]: (prev[msg.sender_id] || 0) + 1
          }));
        }
      }).subscribe();

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, [currentUserId]);

  const markAsRead = (senderId) => {
    localStorage.setItem(`dm_last_read_${senderId}`, Date.now().toString());
    setUnreadCounts(prev => ({ ...prev, [senderId]: 0 }));
  };

  return { unreadCounts, markAsRead };
}
