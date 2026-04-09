import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { notifications } from '../lib/notifications';
import { compressImage } from '../lib/image';
import { createPrivateDmAttachmentPath, DM_PRIVATE_BUCKET, encodePrivateDmAttachment } from '../lib/dmAttachments';

/**
 * Хук для личных сообщений между двумя пользователями.
 * Использует таблицу direct_messages.
 */
export function useDirectMessages(currentUserId, targetUserId) {
  const [messages, setMessages] = useState([]);
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const subRef                  = useRef(null);

  const normalizeMessage = useCallback((message) => {
    if (!message) return message;
    return {
      ...message,
      resolved_image_url: message.resolved_image_url ?? null,
    };
  }, []);

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

      if (!error && data) setMessages(data.map(normalizeMessage));
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
          
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setMessages(prev => prev.filter(m => m.id !== deletedId));
            return;
          }

          if (isRelevant) {
            if (payload.eventType === 'INSERT') {
              setMessages(prev => [...prev, normalizeMessage(msg)]);
              if (msg.sender_id === targetUserId) {
                notifications.play('dm');
              }
            } else if (payload.eventType === 'UPDATE') {
              setMessages(prev => prev.map(m => m.id === msg.id ? normalizeMessage(msg) : m));
            }
          }
        }
      )
      .subscribe();

    subRef.current = sub;

    return () => {
      sub.unsubscribe();
    };
  }, [currentUserId, targetUserId, normalizeMessage]);

  /** Загрузить файл в Supabase Storage, вернуть публичный URL (аналогично useMessages) */
  const uploadFile = useCallback(async (file) => {
    if (!currentUserId || !targetUserId) {
      throw new Error('DM attachment upload requires both participants');
    }

    // Применяем сжатие, если это изображение
    const finalFile = await compressImage(file);

    const filePath = createPrivateDmAttachmentPath(currentUserId, targetUserId, finalFile.name);
    const { error } = await supabase.storage
      .from(DM_PRIVATE_BUCKET)
      .upload(filePath, finalFile, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return encodePrivateDmAttachment(filePath);
  }, [currentUserId, targetUserId]);

  const sendMessage = useCallback(async (
    content,
    senderUsername,
    senderColor,
    imageUrl = null,
    fileName = null,
    resolvedImageUrl = null,
  ) => {
    if (!content.trim() && !imageUrl) return;
    if (!currentUserId || !targetUserId) return;
    
    setSending(true);

    // Создаем "оптимистичное" сообщение
    const tempId = `temp-dm-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: targetUserId,
      sender_username: senderUsername,
      sender_color: senderColor ?? null,
      content: content.trim(),
      image_url: imageUrl,
      resolved_image_url: resolvedImageUrl ?? null,
      file_name: fileName,
      created_at: new Date().toISOString(),
      is_read: false,
      isPending: true
    };
    
    setOptimisticMessages(prev => [...prev, optimisticMsg]);

    const { error } = await supabase.from('direct_messages').insert({
      sender_id:       currentUserId,
      receiver_id:     targetUserId,
      sender_username: senderUsername,
      sender_color:    senderColor ?? null,
      content:         content.trim(),
      image_url:       imageUrl ?? null,
      file_name:       fileName ?? null,
    });

    setSending(false);
    // Удаляем из оптимистичных
    setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));

    if (error) {
      console.error('DM send error:', error);
      alert(`Ошибка отправки: ${error.message}`);
    }
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

  /** Редактировать ЛС */
  const editMessage = useCallback(async (id, newContent) => {
    if (!newContent.trim()) return;
    const { error } = await supabase
      .from('direct_messages')
      .update({ 
        content: newContent.trim(),
        is_edited: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) console.error('DM edit error:', error);
    return { error };
  }, []);

  /** Удалить ЛС */
  const deleteMessage = useCallback(async (id) => {
    // Оптимистичное удаление
    setMessages(prev => prev.filter(m => m.id !== id));

    const { error } = await supabase
      .from('direct_messages')
      .delete()
      .eq('id', id);
    
    if (error) {
       console.error('DM delete error:', error);
    }
    return { error };
  }, []);

  // Объединяем реальные и оптимистичные
  const allMessages = [...messages, ...optimisticMessages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return { messages: allMessages, loading, sending, sendMessage, markMessagesAsRead, uploadFile, editMessage, deleteMessage };
}
