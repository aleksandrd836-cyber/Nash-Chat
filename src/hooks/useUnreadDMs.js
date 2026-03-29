import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { notifications } from '../lib/notifications';

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

    // 1. Грузим реально непрочитанные из БД
    const fetchUnreads = async () => {
      const { data } = await supabase
        .from('direct_messages')
        .select('sender_id')
        .eq('receiver_id', currentUserId)
        .eq('is_read', false);
      
      if (data && mounted) {
        const counts = {};
        data.forEach(msg => {
          counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
        });
        setUnreadCounts(counts);
      }
    };
    
    fetchUnreads();

    // 2. Слушаем новые входящие сообщения и обновления
    const sub = supabase.channel('global-docs-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${currentUserId}` }, (payload) => {
        const msg = payload.new;
        if (!msg || !msg.sender_id) return;

        if (payload.eventType === 'INSERT') {
          if (msg.sender_id !== activeDMRef.current && msg.is_read === false) {
            setUnreadCounts(prev => ({
              ...prev,
              [msg.sender_id]: (prev[msg.sender_id] || 0) + 1
            }));
            notifications.play('dm');
          }
        } else if (payload.eventType === 'UPDATE') {
          // Если обновился статус (стало прочитано)
          if (msg.is_read === true) {
            setUnreadCounts(prev => {
              const current = prev[msg.sender_id] || 0;
              return {
                ...prev,
                [msg.sender_id]: Math.max(0, current - 1)
              };
            });
          }
        }
      }).subscribe();

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, [currentUserId]);

  const markAsRead = (senderId) => {
    // В БД сообщения помечаются прочитанными через useDirectMessages
    setUnreadCounts(prev => ({ ...prev, [senderId]: 0 }));
  };

  return { unreadCounts, markAsRead };
}
