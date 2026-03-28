import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук голосового чата.
 *
 * Сигналинг идёт через Supabase Realtime Broadcast — без отдельного сервера.
 * Аудио идёт напрямую P2P через нативный WebRTC.
 *
 * Схема:
 *  1. Пользователь A входит в голосовой канал → подписывается на Supabase Presence
 *  2. Уже находящиеся пользователи видят A через presence:join → инициируют offer
 *  3. A получает offer через broadcast, отвечает answer
 *  4. Обмен ICE-кандидатами через broadcast
 *  5. P2P аудио установлено
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export function useVoice() {
  const [activeChannelId, setActiveChannelId] = useState(null);   // текущий голосовой канал
  const [participants, setParticipants]        = useState([]);     // список участников
  const [isMuted, setIsMuted]                  = useState(false);
  const [isConnecting, setIsConnecting]        = useState(false);

  const localStream      = useRef(null);
  const peerConns        = useRef({});   // { [userId]: RTCPeerConnection }
  const audioElements    = useRef({});   // { [userId]: HTMLAudioElement }
  const realtimeChannel  = useRef(null);
  const currentUserRef   = useRef(null);

  // Очищаем ресурсы при размонтировании
  useEffect(() => () => { cleanupAll(); }, []);

  /** Создать RTCPeerConnection до конкретного собеседника */
  const createPeerConnection = useCallback((remoteUserId) => {
    if (peerConns.current[remoteUserId]) return peerConns.current[remoteUserId];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Добавляем дорожки своего микрофона
    localStream.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStream.current);
    });

    // Получаем аудио от собеседника
    pc.ontrack = (event) => {
      if (!audioElements.current[remoteUserId]) {
        const audio = new Audio();
        audio.autoplay = true;
        audioElements.current[remoteUserId] = audio;
      }
      audioElements.current[remoteUserId].srcObject = event.streams[0];
      audioElements.current[remoteUserId].play().catch(() => {});
    };

    // Шлём ICE-кандидатов через Supabase Broadcast
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && realtimeChannel.current) {
        realtimeChannel.current.send({
          type: 'broadcast',
          event: 'ice',
          payload: { from: currentUserRef.current.id, to: remoteUserId, candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        closePeer(remoteUserId);
      }
    };

    peerConns.current[remoteUserId] = pc;
    return pc;
  }, []);

  /** Закрыть соединение с одним пиром */
  const closePeer = useCallback((userId) => {
    peerConns.current[userId]?.close();
    delete peerConns.current[userId];
    if (audioElements.current[userId]) {
      audioElements.current[userId].srcObject = null;
      delete audioElements.current[userId];
    }
  }, []);

  /** Полная очистка */
  const cleanupAll = useCallback(async () => {
    Object.keys(peerConns.current).forEach(closePeer);
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    if (realtimeChannel.current) {
      try { await realtimeChannel.current.untrack(); } catch {}
      await supabase.removeChannel(realtimeChannel.current);
      realtimeChannel.current = null;
    }
    setActiveChannelId(null);
    setParticipants([]);
    setIsMuted(false);
    currentUserRef.current = null;
  }, [closePeer]);

  /** Обновить список участников из Presence-состояния (с дедупликацией) */
  const syncParticipants = useCallback((channel) => {
    const state = channel.presenceState();
    // flat() — у одного ключа может быть несколько presence-записей (реконнект)
    // Дедупликация по userId — берём последнюю запись для каждого
    const seen = new Map();
    Object.values(state).flat().forEach((p) => {
      seen.set(p.userId, { userId: p.userId, username: p.username });
    });
    setParticipants(Array.from(seen.values()));
  }, []);

  /** Войти в голосовой канал */
  const joinVoiceChannel = useCallback(async (channelId, user, username) => {
    if (activeChannelId) await leaveVoiceChannel();
    setIsConnecting(true);

    // Запросить микрофон
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      alert('Не удалось получить доступ к микрофону. Проверь разрешения браузера.');
      setIsConnecting(false);
      return;
    }
    localStream.current   = stream;
    currentUserRef.current = { id: user.id, username };

    // Создаём Supabase Realtime канал (Presence + Broadcast)
    const channel = supabase.channel(`voice:${channelId}`, {
      config: {
        presence: { key: user.id },
        broadcast: { self: false, ack: false },
      },
    });

    // === Presence events ===
    channel.on('presence', { event: 'sync' }, () => {
      syncParticipants(channel);
    });

    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      // Существующие пользователи инициируют оффер новому участнику
      newPresences.forEach(async (p) => {
        if (p.userId === user.id) return; // не соединяться с самим собой
        const pc    = createPeerConnection(p.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: 'broadcast',
          event: 'offer',
          payload: { from: user.id, to: p.userId, sdp: offer },
        });
      });
      syncParticipants(channel);
    });

    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach((p) => closePeer(p.userId));
      syncParticipants(channel);
    });

    // === Broadcast events (сигналинг) ===
    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = createPeerConnection(payload.from);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.send({
        type: 'broadcast',
        event: 'answer',
        payload: { from: user.id, to: payload.from, sdp: answer },
      });
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = peerConns.current[payload.from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });

    channel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = peerConns.current[payload.from];
      if (pc && payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {}
      }
    });

    // Подписываемся и публикуем своё присутствие
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ userId: user.id, username });
        setActiveChannelId(channelId);
        setIsConnecting(false);
      }
    });

    realtimeChannel.current = channel;
  }, [activeChannelId, createPeerConnection, closePeer, syncParticipants]);

  /** Выйти из голосового канала */
  const leaveVoiceChannel = useCallback(async () => {
    await cleanupAll();
  }, [cleanupAll]);

  /** Переключить микрофон */
  const toggleMute = useCallback(() => {
    localStream.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  return {
    activeChannelId,
    participants,
    isMuted,
    isConnecting,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
  };
}
