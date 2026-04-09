import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { notifications } from '../lib/notifications';
import { compressImage } from '../lib/image';

const PAGE_SIZE = 50;

/**
 * Хук для текстовых сообщений канала.
 * - Загружает историю (последние 50)
 * - Подписывается на real-time вставки через Supabase Realtime
 */
export function useMessages(channelId, currentUserId) {
  const [messages, setMessages]   = useState([]);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
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
        { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => [...prev, payload.new]);
            // Звук если сообщение не от нас
            if (payload.new.user_id !== currentUserId) {
              notifications.play('dm');
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) => prev.map(m => m.id === payload.new.id ? payload.new : m));
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter(m => m.id !== payload.old.id));
          }
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
    // Применяем сжатие, если это изображение
    const finalFile = await compressImage(file);
    
    const ext = finalFile.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('chat-images')
      .upload(fileName, finalFile, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('chat-images').getPublicUrl(fileName);
    return data.publicUrl;
  }, []);

  /** Отправить сообщение (text и/или image_url) */
  const sendMessage = useCallback(async (content, userId, username, imageUrl = null, userColor = null, fileName = null) => {
    // Если контента нет и картинки нет - выходим
    if (!content.trim() && !imageUrl) return;
    if (!channelId) return;

    setSending(true);
    
    // Создаем "оптимистичное" сообщение для мгновенного отображения
    const tempId = `temp-${Date.now()}`;
    const dbUsername = userColor ? `${username}@@${userColor}` : username;
    
    const optimisticMsg = {
      id: tempId,
      channel_id: channelId,
      user_id: userId,
      username: dbUsername,
      content: content.trim(),
      image_url: imageUrl,
      file_name: fileName,
      created_at: new Date().toISOString(),
      isPending: true // Флаг для UI
    };
    
    setOptimisticMessages(prev => [...prev, optimisticMsg]);

    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      user_id: userId,
      username: dbUsername,
      content: content.trim(),
      image_url: imageUrl ?? null,
      file_name: fileName ?? null,
    });

    setSending(false);
    // Удаляем из оптимистичных, так как придет Realtime вставка
    setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
    
    if (error) console.error('Ошибка отправки:', error);
    return { error };
  }, [channelId]);

  // Объединяем реальные и оптимистичные сообщения
  const allMessages = [...messages, ...optimisticMessages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return { messages: allMessages, loading, sending, sendMessage, uploadFile };
}
