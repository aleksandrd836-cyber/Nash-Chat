import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для получения списка недавно начатых переписок.
 * Находит всех уникальных пользователей, с которыми текущий юзер обменивался сообщениями.
 */
export function useRecentConversations(currentUserId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) {
      setConversations([]);
      setLoading(false);
      return;
    }

    let isCancelled = false;

    async function fetchConversations() {
      if (isCancelled) return;
      setLoading(true);
      try {
        // Загружаем все сообщения, где юзер отправитель ИЛИ получатель
        const { data, error } = await supabase
          .from('direct_messages')
          .select('*')
          .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
          .order('created_at', { ascending: false });

        if (isCancelled) return;
        if (error) throw error;
        if (!data) {
          setConversations([]);
          return;
        }

        // Группируем по уникальным собеседникам
        const partners = new Map();
        data.forEach(msg => {
          const partnerId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
          if (!partners.has(partnerId)) {
            partners.set(partnerId, {
              id: partnerId,
              username: 'Пользователь', // Фолбек до загрузки профиля
              lastMessage: msg.content,
              timestamp: msg.created_at,
              isRead: msg.receiver_id === currentUserId ? msg.is_read : true,
              partnerId: partnerId
            });
          }
        });

        // Теперь нам нужны актуальные данные профилей этих людей (аватары и т.д.)
        const partnerIds = Array.from(partners.keys());
        if (partnerIds.length > 0 && !isCancelled) {
          const { data: profiles, error: profError } = await supabase
            .from('profiles')
            .select('id, username, color')
            .in('id', partnerIds);

          if (isCancelled) return;
          if (profError) throw profError;

          if (profiles) {
            profiles.forEach(p => {
              const conv = partners.get(p.id);
              if (conv) {
                conv.username = p.username || 'Пользователь';
                conv.color = p.color || null;
              }
            });
          }
        }

        if (!isCancelled) {
          setConversations(Array.from(partners.values()));
        }
      } catch (e) {
        if (!isCancelled) console.error('[useRecentConversations] Error:', e);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchConversations();

    // Подписка на новые сообщения для обновления списка в реальном времени
    const channel = supabase.channel('recent-dms-hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, (payload) => {
        const msg = payload.new;
        if (!msg) return;
        if (msg.sender_id === currentUserId || msg.receiver_id === currentUserId) {
           fetchConversations();
        }
      })
      .subscribe();

    return () => { 
      isCancelled = true;
      channel.unsubscribe(); 
    };
  }, [currentUserId]);

  return { conversations, loading };
}
