import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 50;

/**
 * Хук для текстовых сообщений канала.
 * - Загружает историю (последние 50)
 * - Подписывается на real-time вставки через Supabase Realtime
 */
export function useMessages(channelId) {
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [sending, setSending]     = useState(false);
  const subscriptionRef           = useRef(null);

  // Загружаем историю при смене канала
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;

    setMessages([]);
    setLoading(true);

    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setMessages(data ?? []);
        setLoading(false);
      });

    // Real-time подписка
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  /** Загрузить файл в Supabase Storage, вернуть публичный URL */
  const uploadFile = useCallback(async (file) => {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('chat-images')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('chat-images').getPublicUrl(fileName);
    return data.publicUrl;
  }, []);

  /** Отправить сообщение (text и/или image_url) */
  const sendMessage = useCallback(async (content, userId, username, imageUrl = null) => {
    if (!content.trim() && !imageUrl) return;
    if (!channelId) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      user_id: userId,
      username,
      content: content.trim(),
      image_url: imageUrl ?? null,
    });
    setSending(false);
    if (error) console.error('Ошибка отправки:', error);
  }, [channelId]);

  return { messages, loading, sending, sendMessage, uploadFile };
}
