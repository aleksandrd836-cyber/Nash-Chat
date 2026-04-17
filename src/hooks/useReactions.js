import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * РҐСѓРє РґР»СЏ СѓРїСЂР°РІР»РµРЅРёСЏ СЂРµР°РєС†РёСЏРјРё РєРѕРЅРєСЂРµС‚РЅРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ.
 * РџРѕРґРґРµСЂР¶РёРІР°РµС‚ РєР°Рє РѕР±С‹С‡РЅС‹Рµ РєР°РЅР°Р»С‹, С‚Р°Рє Рё Р›РЎ (С‡РµСЂРµР· С„Р»Р°Рі isDM).
 *
 * Важно: раньше каждый Message создавал собственный realtime channel
 * `reactions:<messageId>`, из-за чего один экран с историей сообщений мог
 * держать десятки подписок на одном общем Supabase socket. Для voice это
 * означало лишний realtime churn и периодические transport flaps.
 *
 * Теперь на таблицу используется один shared subscription, а каждый message hook
 * только подписывается на локальный кэш по своему `messageId`.
 */

function createReactionStore(table) {
  let channel = null;
  const listenersByMessageId = new Map();
  const reactionsByMessageId = new Map();
  const inflightFetches = new Map();

  const getListeners = (messageId) => listenersByMessageId.get(messageId) || null;

  const cloneReactions = (messageId) => [...(reactionsByMessageId.get(messageId) || [])];

  const notify = (messageId) => {
    const listeners = getListeners(messageId);
    if (!listeners || listeners.size === 0) return;

    const nextReactions = cloneReactions(messageId);
    listeners.forEach((listener) => listener(nextReactions));
  };

  const sortReactions = (reactions = []) => (
    [...reactions].sort((left, right) => {
      const leftId = String(left?.id ?? '');
      const rightId = String(right?.id ?? '');
      return leftId.localeCompare(rightId);
    })
  );

  const findMessageIdByReactionId = (reactionId) => {
    if (!reactionId) return null;

    for (const [messageId, reactions] of reactionsByMessageId.entries()) {
      if (reactions.some((reaction) => reaction.id === reactionId)) {
        return messageId;
      }
    }

    return null;
  };

  const resolveMessageIdFromPayload = (payload = {}) => (
    payload?.message_id ?? findMessageIdByReactionId(payload?.id)
  );

  const setMessageReactions = (messageId, nextReactions) => {
    if (!messageId) return;
    reactionsByMessageId.set(messageId, sortReactions(nextReactions));
    notify(messageId);
  };

  const ensureChannel = () => {
    if (channel) return channel;

    channel = supabase
      .channel(`shared-reactions:${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          const payloadRecord = payload.new ?? payload.old ?? {};
          const messageId = resolveMessageIdFromPayload(payloadRecord);
          if (!messageId) return;

          const isTrackedMessage =
            listenersByMessageId.has(messageId) ||
            reactionsByMessageId.has(messageId);

          if (!isTrackedMessage) return;

          const currentReactions = reactionsByMessageId.get(messageId) || [];

          if (payload.eventType === 'INSERT') {
            const exists = currentReactions.some((reaction) => reaction.id === payload.new.id);
            if (exists) return;
            setMessageReactions(messageId, [...currentReactions, payload.new]);
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const nextReactions = currentReactions.some((reaction) => reaction.id === payload.new.id)
              ? currentReactions.map((reaction) => (
                reaction.id === payload.new.id ? payload.new : reaction
              ))
              : [...currentReactions, payload.new];

            setMessageReactions(messageId, nextReactions);
            return;
          }

          if (payload.eventType === 'DELETE') {
            setMessageReactions(
              messageId,
              currentReactions.filter((reaction) => reaction.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return channel;
  };

  const releaseChannelIfIdle = () => {
    if (!channel) return;

    const hasListeners = Array.from(listenersByMessageId.values()).some((listeners) => listeners.size > 0);
    if (hasListeners) return;

    const staleChannel = channel;
    channel = null;
    supabase.removeChannel(staleChannel).catch(() => {});
  };

  const fetchMessageReactions = async (messageId) => {
    if (!messageId) return [];

    const existingFetch = inflightFetches.get(messageId);
    if (existingFetch) {
      return existingFetch;
    }

    const fetchPromise = supabase
      .from(table)
      .select('id, user_id, emoji, message_id')
      .eq('message_id', messageId)
      .then(({ data, error }) => {
        if (error) {
          throw error;
        }

        const nextReactions = data || [];
        reactionsByMessageId.set(messageId, sortReactions(nextReactions));
        notify(messageId);
        return nextReactions;
      })
      .finally(() => {
        inflightFetches.delete(messageId);
      });

    inflightFetches.set(messageId, fetchPromise);
    return fetchPromise;
  };

  return {
    ensureChannel,
    fetchMessageReactions,
    getCachedReactions(messageId) {
      return cloneReactions(messageId);
    },
    hasCachedReactions(messageId) {
      return reactionsByMessageId.has(messageId);
    },
    subscribe(messageId, listener) {
      if (!messageId) {
        listener([]);
        return () => {};
      }

      ensureChannel();

      const listeners = getListeners(messageId) || new Set();
      listeners.add(listener);
      listenersByMessageId.set(messageId, listeners);
      if (reactionsByMessageId.has(messageId)) {
        listener(cloneReactions(messageId));
      }

      return () => {
        const currentListeners = getListeners(messageId);
        if (!currentListeners) return;

        currentListeners.delete(listener);
        if (currentListeners.size === 0) {
          listenersByMessageId.delete(messageId);
          reactionsByMessageId.delete(messageId);
        }

        releaseChannelIfIdle();
      };
    },
  };
}

const reactionStores = {
  message_reactions: createReactionStore('message_reactions'),
  direct_message_reactions: createReactionStore('direct_message_reactions'),
};

export function useMessageReactions(messageId, isDM = false) {
  const [reactions, setReactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const table = isDM ? 'direct_message_reactions' : 'message_reactions';
  const reactionStore = reactionStores[table];

  useEffect(() => {
    if (!messageId) {
      setReactions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(!reactionStore.hasCachedReactions(messageId));

    const unsubscribe = reactionStore.subscribe(messageId, (nextReactions) => {
      if (cancelled) return;
      setReactions(nextReactions);
      setLoading(false);
    });

    reactionStore.fetchMessageReactions(messageId)
      .catch((error) => {
        if (cancelled) return;
        console.error('[useMessageReactions] РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё СЂРµР°РєС†РёР№:', error);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [messageId, reactionStore]);

  const toggleReaction = useCallback(async (userId, emoji) => {
    if (!userId || !messageId) return;

    if (String(messageId).startsWith('temp-')) return;

    const currentReactions = reactionStore.getCachedReactions(messageId);
    const existing = currentReactions.find((reaction) => reaction.user_id === userId);

    try {
      if (existing) {
        if (existing.emoji === emoji) {
          await supabase.from(table).delete().eq('id', existing.id);
        } else {
          await supabase.from(table).update({ emoji }).eq('id', existing.id);
        }
      } else {
        await supabase.from(table).insert({
          message_id: messageId,
          user_id: userId,
          emoji,
        });
      }
    } catch (error) {
      console.error('РћС€РёР±РєР° РїСЂРё РїРµСЂРµРєР»СЋС‡РµРЅРёРё СЂРµР°РєС†РёРё:', error);
    }
  }, [messageId, reactionStore, table]);

  return { reactions, loading, toggleReaction };
}
