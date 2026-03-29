import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для личных сообщений между двумя пользователями.
 * Использует таблицу direct_messages.
 */
export function useDirectMessages(currentUserId, targetUserId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const subRef                  = useRef(null);

  useEffect(() => {
    if (!currentUserId || !targetUserId) {
      setMessages([]);
      return;
    }

    setLoading(true);

    // Загружаем историю сообщений
    async function fetchMessages() {
      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),` +
          `and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`
        )
        .order('created_at', { ascending: true })
        .limit(200);

      if (!error && data) setMessages(data);
      setLoading(false);
    }

    fetchMessages();

    // Realtime-подписка на новые сообщения
    const channelName = `dm-${[currentUserId, targetUserId].sort().join('-')}`;
    const sub = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const msg = payload.new;
          // Принимаем только сообщения этого диалога
          const isRelevant =
            (msg.sender_id === currentUserId && msg.receiver_id === targetUserId) ||
            (msg.sender_id === targetUserId   && msg.receiver_id === currentUserId);
          if (isRelevant) {
            setMessages(prev => [...prev, msg]);
          }
        }
      )
      .subscribe();

    subRef.current = sub;

    return () => {
      sub.unsubscribe();
    };
  }, [currentUserId, targetUserId]);

  const sendMessage = useCallback(async (content, senderUsername, senderColor) => {
    if (!content.trim() || !currentUserId || !targetUserId) return;
    setSending(true);

    const { error } = await supabase.from('direct_messages').insert({
      sender_id:       currentUserId,
      receiver_id:     targetUserId,
      sender_username: senderUsername,
      sender_color:    senderColor ?? null,
      content:         content.trim(),
    });

    if (error) {
      console.error('DM send error:', error);
      alert(`Ошибка отправки: ${error.message}`);
    }

    setSending(false);
  }, [currentUserId, targetUserId]);

  return { messages, loading, sending, sendMessage };
}
