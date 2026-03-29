import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук для управления реакциями конкретного сообщения.
 * Поддерживает как обычные каналы, так и ЛС (через флаг isDM).
 */
export function useMessageReactions(messageId, isDM = false) {
  const [reactions, setReactions] = useState([]);
  const [loading, setLoading]     = useState(false);
  
  const table = isDM ? 'direct_message_reactions' : 'message_reactions';

  useEffect(() => {
    if (!messageId) return;

    let cancelled = false;

    async function fetchReactions() {
      setLoading(true);
      const { data, error } = await supabase
        .from(table)
        .select('id, user_id, emoji')
        .eq('message_id', messageId);
      
      if (!cancelled && !error) {
        setReactions(data || []);
      }
      setLoading(false);
    }

    fetchReactions();

    const channel = supabase
      .channel(`reactions:${messageId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `message_id=eq.${messageId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setReactions(prev => {
              // Предотвращаем дубли (на случай гонки)
              if (prev.some(r => r.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } else if (payload.eventType === 'DELETE') {
            setReactions(prev => prev.filter(r => r.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setReactions(prev => prev.map(r => r.id === payload.new.id ? payload.new : r));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [messageId, table]);

  const toggleReaction = useCallback(async (userId, emoji) => {
    if (!userId || !messageId) return;

    // Ищем, есть ли уже реакция этого пользователя на это сообщение
    const existing = reactions.find(r => r.user_id === userId);

    if (existing) {
      if (existing.emoji === emoji) {
        // Если эмодзи тот же — удаляем реакцию
        await supabase.from(table).delete().eq('id', existing.id);
      } else {
        // Если другой — обновляем (благодаря UNIQUE(message_id, user_id) можно и upsert, но update надежнее)
        await supabase.from(table).update({ emoji }).eq('id', existing.id);
      }
    } else {
      // Если реакции нет — вставляем новую
      await supabase.from(table).insert({
        message_id: messageId,
        user_id:    userId,
        emoji:      emoji
      });
    }
  }, [messageId, table, reactions]);

  return { reactions, loading, toggleReaction };
}
