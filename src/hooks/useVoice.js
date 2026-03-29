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
  const [activeChannelId, setActiveChannelId]  = useState(null);   // текущий голосовой канал
  const [participants, setParticipants]        = useState([]);     // список участников (текущий канал)
  const [allParticipants, setAllParticipants]  = useState({});     // глобальный список: кто в каком канале
  const [isMuted, setIsMuted]                  = useState(false);
  const [isDeafened, setIsDeafened]            = useState(false);
  const [isConnecting, setIsConnecting]        = useState(false);
  const [isSpeaking, setIsSpeaking]            = useState(false);
  
  const [isScreenSharing, setIsScreenSharing]  = useState(false);
  const [remoteScreens, setRemoteScreens]      = useState({}); // { [userId]: MediaStream }

  const isDeafenedRef    = useRef(false);
  const screenStreamRef  = useRef(null);

  const localStream      = useRef(null);
  const globalPresence   = useRef(null);
  const peerConns        = useRef({});   // { [userId]: RTCPeerConnection }
  const audioElements    = useRef({});   // { [userId]: HTMLAudioElement }
  const realtimeChannel   = useRef(null);
  const currentUserRef    = useRef(null);
  const isMutedRef        = useRef(false);
  const presencePayload   = useRef({});

  // Noise Suppression / VAD refs
  const audioContextRef  = useRef(null);
  const analyserRef      = useRef(null);
  const vadIntervalRef   = useRef(null);
  const lastSpeakTimeRef = useRef(0);
  const vadStreamRef     = useRef(null);

  // Инициализируем глобальный канал присутствия для боковой панели
  useEffect(() => {
    const channel = supabase.channel('global_voice_presence');
    
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      
      // Дедубликация: 
      // Если у пользователя зависла старая сессия (призрак), мы оставляем только ту, где joined_at новее.
      const latestUserPresence = new Map();

      Object.values(state).flat().forEach(p => {
        if (!p.channelId || !p.userId || !p.username) return;
        
        const existing = latestUserPresence.get(p.userId);
        if (!existing || (p.joined_at && existing.joined_at && p.joined_at > existing.joined_at)) {
          latestUserPresence.set(p.userId, p);
        } else if (!existing && !p.joined_at) {
          // Фолбэк на старые форматы, если они есть
          latestUserPresence.set(p.userId, p);
        }
      });

      const newAll = {};
      latestUserPresence.forEach(p => {
        if (!newAll[p.channelId]) newAll[p.channelId] = new Map();
        newAll[p.channelId].set(p.userId, { 
          userId: p.userId, 
          username: p.username, 
          color: p.color, 
          isScreenSharing: p.isScreenSharing 
        });
      });

      const finalAll = {};
      Object.keys(newAll).forEach(chId => {
        finalAll[chId] = Array.from(newAll[chId].values());
      });
      setAllParticipants(finalAll);
    });

    channel.subscribe();
    globalPresence.current = channel;

    return () => {
      cleanupAll();
      supabase.removeChannel(channel);
    };
  }, []);

  /** Создать RTCPeerConnection до конкретного собеседника */
  const createPeerConnection = useCallback((remoteUserId) => {
    if (peerConns.current[remoteUserId]) return peerConns.current[remoteUserId];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Добавляем дорожки своего микрофона
    localStream.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStream.current);
    });

    // Обработка renegotiation (необходима для добавления видеопотоков на лету)
    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (realtimeChannel.current && currentUserRef.current) {
          realtimeChannel.current.send({
            type: 'broadcast',
            event: 'offer',
            payload: { from: currentUserRef.current.id, to: remoteUserId, sdp: offer },
          });
        }
      } catch (err) {
        console.error('onnegotiationneeded error', err);
      }
    };

    // Получаем аудио/видео от собеседника
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      
      // Логика разграничения: если у нас уже создан аудио-плеер для голоса, 
      // и приходит поток с ДРУГИМ ID, значит это стрим демонстрации экрана.
      // (т.к. голос всегда подключается первым).
      if (audioElements.current[remoteUserId] && audioElements.current[remoteUserId].srcObject?.id !== stream.id) {
        setRemoteScreens(prev => ({ ...prev, [remoteUserId]: stream }));
      } else {
        // Это голосовой поток
        if (!audioElements.current[remoteUserId]) {
          const audio = new Audio();
          audio.autoplay = true;
          audio.muted = isDeafenedRef.current;
          // Применяем выбранное пользователем устройство вывода (если поддерживается)
          const outputDeviceId = localStorage.getItem('outputDeviceId');
          if (outputDeviceId && typeof audio.setSinkId === 'function') {
            audio.setSinkId(outputDeviceId).catch(() => {});
          }
          audioElements.current[remoteUserId] = audio;
        }
        audioElements.current[remoteUserId].srcObject = event.streams[0];
        audioElements.current[remoteUserId].play().catch(() => {});
      }
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

    // Очистка шумодава
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (vadStreamRef.current) {
      vadStreamRef.current.getTracks().forEach(t => t.stop());
      vadStreamRef.current = null;
    }
    setIsSpeaking(false);
    lastSpeakTimeRef.current = 0;
    if (realtimeChannel.current) {
      try { await realtimeChannel.current.untrack(); } catch {}
      await supabase.removeChannel(realtimeChannel.current);
      realtimeChannel.current = null;
    }
    if (globalPresence.current) {
      try { await globalPresence.current.untrack(); } catch {} // удаляем себя из всех списков
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    setRemoteScreens({});
    setActiveChannelId(null);
    setParticipants([]);
    setIsMuted(false);
    setIsDeafened(false);
    isDeafenedRef.current = false;
    currentUserRef.current = null;
  }, [closePeer]);

  /** Обновить список участников из Presence-состояния */
  const syncParticipants = useCallback((channel) => {
    const state = channel.presenceState();
    const seen = new Map();
    Object.values(state).flat().forEach((p) => {
      seen.set(p.userId, { 
        userId: p.userId, 
        username: p.username, 
        color: p.color, 
        isScreenSharing: p.isScreenSharing,
        isSpeaking: p.isSpeaking 
      });
    });
    setParticipants(Array.from(seen.values()));
  }, []);

  /** Войти в голосовой канал */
  const joinVoiceChannel = useCallback(async (channelId, user, username, color) => {
    if (activeChannelId) await leaveVoiceChannel();
    setIsConnecting(true);

    // Запросить микрофон с улучшенными фильтрами
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }, 
        video: false 
      });
    } catch (err) {
      console.error('Mic capture error:', err);
      alert('Не удалось получить доступ к микрофону. Проверь разрешения браузера.');
      setIsConnecting(false);
      return;
    }
    
    // Инициализируем VAD (Voice Activity Detection / Шумодав) только для UI.
    try {
      const vadStream = stream.clone();
      vadStreamRef.current = vadStream;
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});

      const source = audioContext.createMediaStreamSource(vadStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const SPEAK_THRESHOLD = 20; // Чувствительность к пикам
      const SPEAK_HOLD_TIME = 400;

      const checkVolume = () => {
        if (isMutedRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        
        let maxFreq = 0;
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > maxFreq) maxFreq = dataArray[i];
        }

        const now = Date.now();
        const currentlySpeaking = maxFreq > SPEAK_THRESHOLD;

        if (currentlySpeaking) {
          lastSpeakTimeRef.current = now;
          setIsSpeaking(curr => {
            if (!curr && realtimeChannel.current) {
              realtimeChannel.current.track({ ...presencePayload.current, isSpeaking: true }).catch(() => {});
            }
            return true;
          });
        } else if (now - lastSpeakTimeRef.current > SPEAK_HOLD_TIME) {
          setIsSpeaking(curr => {
            if (curr && realtimeChannel.current) {
              realtimeChannel.current.track({ ...presencePayload.current, isSpeaking: false }).catch(() => {});
            }
            return false;
          });
        }
      };

      vadIntervalRef.current = setInterval(checkVolume, 50);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    } catch (vadErr) {
      console.warn('Failed to init Noise Gate:', vadErr);
    }

    localStream.current   = stream;
    currentUserRef.current = { id: user.id, username };
    
    // Изначальный пейлоад для локального отслеживания
    presencePayload.current = { userId: user.id, username, color, isScreenSharing: false, isSpeaking: false };

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
      // Существующие пользователи создают PeerConnection (onnegotiationneeded сам создаст offer)
      newPresences.forEach((p) => {
        if (p.userId === user.id) return;
        createPeerConnection(p.userId);
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

    // Обработка запроса на трансляцию
    channel.on('broadcast', { event: 'request-stream' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      if (!screenStreamRef.current) return;
      
      const pc = peerConns.current[payload.from];
      if (pc) {
        // Добавляем дорожки экрана. Это триггернет onnegotiationneeded (renegotiation)
        screenStreamRef.current.getTracks().forEach(track => {
          // Проверяем, не добавлены ли уже
          const senders = pc.getSenders();
          if (!senders.some(s => s.track === track)) {
            pc.addTrack(track, screenStreamRef.current);
          }
        });
      }
    });

    // Подписываемся и публикуем своё присутствие
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(presencePayload.current);
        if (globalPresence.current) {
          await globalPresence.current.track({ channelId, userId: user.id, username, color, joined_at: Date.now() });
        }
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
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      
      // Включаем или выключаем саму передачу звука
      localStream.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });

      if (next) {
        setIsSpeaking(false);
        if (realtimeChannel.current) realtimeChannel.current.track({ ...presencePayload.current, isSpeaking: false }).catch(() => {});
      }
      return next;
    });
  }, []);

  /** Переключить заглушение (наушники) */
  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      isDeafenedRef.current = next;
      Object.values(audioElements.current).forEach((audio) => {
        if (audio) audio.muted = next;
      });
      return next;
    });
  }, []);

  /**
   * Трансляция экрана
   */
  const RESOLUTIONS = {
    '1080p': { width: 1920, height: 1080 },
    '720p':  { width: 1280, height: 720 },
    '480p':  { width: 854,  height: 480 },
    '360p':  { width: 640,  height: 360 },
  };

  const startScreenShare = useCallback(async (quality = '720p', currentUser, sourceId = null, withAudio = false) => {
    try {
      const res = RESOLUTIONS[quality] || RESOLUTIONS['720p'];
      let stream;

      if (sourceId && window.electronAPI) {
        // Специальный захват для Electron (конкретное окно/экран)
        const constraints = {
          audio: withAudio ? {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          } : false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: res.width,
              maxWidth: res.width,
              minHeight: res.height,
              maxHeight: res.height
            }
          }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        // Стандартный захват для браузера
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: res.width }, height: { ideal: res.height }, frameRate: { ideal: 30 } },
          audio: true, 
        });
      }
      
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      
      // Обновляем статус в Presence, чтобы появилась кнопка у других
      if (realtimeChannel.current) {
        realtimeChannel.current.track({ ...presencePayload.current, isScreenSharing: true }).catch(() => {});
      }

      // Если закрыли доступ на уровне браузера/системы
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare(currentUser);
      };
    } catch (err) {
      console.error('Screen sharing error', err);
    }
  }, []);

  const stopScreenShare = useCallback(async (currentUser) => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      
      // Удаляем треки у всех слушателей
      Object.values(peerConns.current).forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track && screenStreamRef.current.getTracks().includes(sender.track)) {
            pc.removeTrack(sender);
          }
        });
      });
      
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    
    if (realtimeChannel.current) {
      realtimeChannel.current.track({ ...presencePayload.current, isScreenSharing: false }).catch(() => {});
    }
  }, []);

  const requestScreenView = useCallback((targetUserId) => {
    if (realtimeChannel.current && currentUserRef.current) {
      realtimeChannel.current.send({
        type: 'broadcast',
        event: 'request-stream',
        payload: { from: currentUserRef.current.id, to: targetUserId },
      });
    }
  }, []);

  /**
   * Установить громкость конкретного участника (0–200).
   * 100 = нормальная, 200 = максимальная, 0 = заглушить.
   * Применяется прямо к HTMLAudioElement.volume (0..2 через GainNode невозможен без Web Audio).
   */
  const setParticipantVolume = useCallback((userId, volumePct) => {
    const audio = audioElements.current[userId];
    if (audio) {
      // Нативный volume поддерживает 0..1, двигаем плавно
      audio.volume = Math.max(0, Math.min(2, volumePct / 100));
    }
    // Сохраняем в localStorage
    localStorage.setItem(`vol_${userId}`, String(volumePct));
    // Оповещаем другие компоненты об изменении громкости
    window.dispatchEvent(new CustomEvent('volumeChanged', { detail: { userId, volumePct } }));
  }, []);

  return {
    activeChannelId,
    participants,
    allParticipants,
    isMuted,
    isDeafened,
    isConnecting,
    isSpeaking,
    isScreenSharing,
    remoteScreens,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    setParticipantVolume,
    startScreenShare,
    stopScreenShare,
    requestScreenView,
  };
}
