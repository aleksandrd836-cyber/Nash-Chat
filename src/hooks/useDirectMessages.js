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
        { event: '*', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const msg = payload.new;
          if (!msg || !msg.sender_id) return; // ignore deletes if any
          // Принимаем только сообщения этого диалога
          const isRelevant =
            (msg.sender_id === currentUserId && msg.receiver_id === targetUserId) ||
            (msg.sender_id === targetUserId   && msg.receiver_id === currentUserId);
          
          if (isRelevant) {
            if (payload.eventType === 'INSERT') {
              setMessages(prev => [...prev, msg]);
            } else if (payload.eventType === 'UPDATE') {
              setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
            }
          }
        }
      )
      .subscribe();

    subRef.current = sub;

    return () => {
      sub.unsubscribe();
    };
  }, [currentUserId, targetUserId]);

  /** Загрузить файл в Supabase Storage, вернуть публичный URL (аналогично useMessages) */
  const uploadFile = useCallback(async (file) => {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_dm_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('chat-images')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('chat-images').getPublicUrl(fileName);
    return data.publicUrl;
  }, []);

  const sendMessage = useCallback(async (content, senderUsername, senderColor, imageUrl = null, fileName = null) => {
    if (!content.trim() && !imageUrl) return;
    if (!currentUserId || !targetUserId) return;
    setSending(true);

    const { error } = await supabase.from('direct_messages').insert({
      sender_id:       currentUserId,
      receiver_id:     targetUserId,
      sender_username: senderUsername,
      sender_color:    senderColor ?? null,
      content:         content.trim(),
      image_url:       imageUrl ?? null,
      file_name:       fileName ?? null,
    });

    if (error) {
      console.error('DM send error:', error);
      alert(`Ошибка отправки: ${error.message}`);
    }

    setSending(false);
  }, [currentUserId, targetUserId]);

  const markMessagesAsRead = useCallback(async () => {
    if (!currentUserId || !targetUserId) return;
    
    // Обновляем только те, где мы получатель, и они не прочитаны
    const { error } = await supabase
      .from('direct_messages')
      .update({ is_read: true })
      .eq('receiver_id', currentUserId)
      .eq('sender_id', targetUserId)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [currentUserId, targetUserId]);

  return { messages, loading, sending, sendMessage, markMessagesAsRead, uploadFile };
}
