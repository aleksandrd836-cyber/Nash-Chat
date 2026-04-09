import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifications } from '../lib/notifications';
import { GHOST_PEER_GRACE_MS, ICE_SERVERS, RECONNECT_DELAY_MS, VOICE_HEARTBEAT_MS } from './voice/constants';
import {
  appendParticipantToChannel,
  buildParticipantMapFromPresenceState,
  pruneStaleParticipantMap,
  removeSessionFromParticipantMap,
  updateParticipantSpeakingMap,
} from './voice/participants';
import {
  getParticipantSessionKey,
  isSameRealtimeTopic,
  resolveStableVoiceChannelId,
} from './voice/utils';
import {
  attachScreenShareToPeers,
  buildScreenShareConstraints,
  detachScreenShareFromPeers,
  getScreenShareProfile,
} from './voice/screenShare';
import {
  attachRemoteAudioTrack,
  attachRemoteVideoTrack,
} from './voice/mediaTracks';
import {
  attachExistingPeerStreams,
  createIceCandidateHandler,
  createIceConnectionStateHandler,
  createNegotiationNeededHandler,
} from './voice/peerLifecycle';
import {
  clearManagedInterval,
  clearManagedTimeout,
  clearManagedTimeoutMap,
  restartManagedInterval,
  scheduleManagedTimeout,
} from './voice/runtime';
import {
  cleanupStaleVoiceSessions,
  fetchActiveVoiceSessions,
  removeVoiceSession,
  upsertVoiceSession,
} from '../lib/voiceSessions';

/**
 * Хук голосового чата (V7 - Ультра-стабильный)
 * Исправляет ошибки signalingState и добавляет мониторинг сети.
 */

export function useVoice() {
  const [activeChannelId, setActiveChannelId]  = useState(null);
  const [participants, setParticipants]        = useState([]);
  const [allParticipants, setAllParticipants]  = useState({});
  const [isMuted, setIsMuted]                  = useState(false);
  const [isDeafened, setIsDeafened]            = useState(false);
  const [isConnecting, setIsConnecting]        = useState(false);
  const [isSpeaking, setIsSpeaking]            = useState(false);
  const [isScreenSharing, setIsScreenSharing]  = useState(false);
  const [remoteScreens, setRemoteScreens]      = useState({});
  const [voiceError, setVoiceError]            = useState(null);
  const [serverStatus, setServerStatus]        = useState('online'); // 'online' | 'offline'
  const [connectingChannelId, setConnectingChannelId] = useState(null);
  const [ping, setPing]                        = useState(null);

  const isDeafenedRef   = useRef(false);
  const isMutedRef      = useRef(false);
  const screenStreamRef = useRef(null);
  const localStream     = useRef(null);
  const globalPresence  = useRef(null);
  const peerConns       = useRef({});
  const audioElements   = useRef({});
  const realtimeChannel = useRef(null);
  const currentUserRef  = useRef(null);
  const presencePayload = useRef({});

  const isSpeakingRef    = useRef(false);
  const activeChannelIdRef = useRef(null);
  const fakeVADIntervalRef = useRef(null);
  const remoteAnalysersRef = useRef({}); // Локальный анализ громкости других участников
  const iceDisconnectTimers = useRef({});
  const autoMutedByDeafenRef = useRef(false);

  // Web Audio
  const audioContextRef = useRef(null);
  const originalMicStreamRef = useRef(null);
  const gainNodesRef = useRef({});
  const makingOfferRef = useRef({});
  const ignoreOfferRef = useRef({});
  const ghostPeersRef = useRef({});
  const isLeavingRef = useRef(false);
  const rnnoiseNodeRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const presenceDebounceRef = useRef(null);
  const isSwitchingRef = useRef(false);
  const sessionIdRef = useRef(Math.random().toString(36).substring(7));
  const heartbeatIntervalRef = useRef(null);
  const voiceSessionsPollRef = useRef(null);
  const lastVoiceSessionCleanupRef = useRef(0);
  const lastStableChannelIdRef = useRef(null);
  const serverVoiceStateRef = useRef(false);

  const removeChannelsByTopic = useCallback(async (topic, keepChannel = null) => {
    const existingChannels = typeof supabase.getChannels === 'function'
      ? supabase.getChannels()
      : [];

    const staleChannels = existingChannels.filter((channel) => (
      channel !== keepChannel && isSameRealtimeTopic(channel, topic)
    ));

    if (staleChannels.length === 0) return;

    await Promise.all(staleChannels.map((channel) => (
      supabase.removeChannel(channel).catch(() => {})
    )));
  }, []);

  const refreshVoiceSessions = useCallback(async () => {
    try {
      const nextParticipants = await fetchActiveVoiceSessions();
      serverVoiceStateRef.current = true;
      setAllParticipants(nextParticipants);
    } catch (error) {
      const message = error?.message?.toLowerCase?.() ?? '';
      const isSchemaMissing =
        error?.code === 'PGRST205' ||
        error?.code === '42P01' ||
        message.includes('voice_sessions') ||
        message.includes('cleanup_stale_voice_sessions');

      if (isSchemaMissing) {
        serverVoiceStateRef.current = false;
      }

      if (!isSchemaMissing) {
        console.warn('[useVoice] Voice sessions refresh failed:', error);
      }
    }
  }, []);

  const mutateRealtimeParticipants = useCallback((updater) => {
    if (serverVoiceStateRef.current) return;
    setAllParticipants(updater);
  }, []);


  // ── СИНХРОНИЗАЦИЯ УЧАСТНИКОВ В ЦЕНТРЕ (derived state) ──
  // Мы больше не управляем участниками канала отдельно, берем их из глобального списка
  useEffect(() => {
    if (!activeChannelId) {
      setParticipants([]);
      return;
    }
    const list = allParticipants[activeChannelId] || [];
    setParticipants(list);
  }, [allParticipants, activeChannelId]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      await refreshVoiceSessions();

      if (Date.now() - lastVoiceSessionCleanupRef.current > 60000) {
        lastVoiceSessionCleanupRef.current = Date.now();
        cleanupStaleVoiceSessions(25).catch(() => {});
      }
    };

    tick();
    voiceSessionsPollRef.current = setInterval(tick, 1500);

    return () => {
      cancelled = true;
      if (voiceSessionsPollRef.current) {
        clearInterval(voiceSessionsPollRef.current);
        voiceSessionsPollRef.current = null;
      }
    };
  }, [refreshVoiceSessions]);

  // СИНХРОНИЗАЦИЯ СТРИМОВ
  useEffect(() => {
    setRemoteScreens(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(uid => {
        const p = participants.find(part => part.userId === uid);
        // Если юзера нет в канале ИЛИ у него выключен флаг стрима — удаляем объект потока
        if (!p || !p.isScreenSharing) {
          delete next[uid];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [participants]);


  const closePeer = useCallback((userId, force = false) => {
    if (!force && ghostPeersRef.current[userId]) return;
    if (peerConns.current[userId]) {
      console.log(`[WebRTC] Closing ${userId}`);
      peerConns.current[userId].close();
      delete peerConns.current[userId];
    }
    if (audioElements.current[userId]) {
      audioElements.current[userId].srcObject = null;
      if (audioElements.current[userId].parentNode) {
        audioElements.current[userId].parentNode.removeChild(audioElements.current[userId]);
      }
      delete audioElements.current[userId];
    }
    if (gainNodesRef.current[userId]) {
      try { gainNodesRef.current[userId].disconnect(); } catch {}
      delete gainNodesRef.current[userId];
    }
    setRemoteScreens(prev => { const next = {...prev}; delete next[userId]; return next; });
  }, []);

  const createPeerConnection = useCallback((remoteUserId, signalingChannel) => {
    if (peerConns.current[remoteUserId]) return peerConns.current[remoteUserId];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    attachExistingPeerStreams(pc, localStream.current, screenStreamRef.current, remoteUserId);

    pc.onnegotiationneeded = createNegotiationNeededHandler({
      pc,
      remoteUserId,
      makingOfferRef,
      currentUserRef,
      realtimeChannelRef: realtimeChannel,
      signalingChannel,
    });

    pc.ontrack = (event) => {
      const track = event.track;
      console.log(`[WebRTC] Incoming track from ${remoteUserId}:`, track.kind);

      if (track.kind === 'video') {
        attachRemoteVideoTrack(remoteUserId, event, setRemoteScreens);
      } else if (track.kind === 'audio') {
        attachRemoteAudioTrack({
          remoteUserId,
          event,
          audioElementsRef: audioElements,
          gainNodesRef,
          audioContextRef,
          remoteAnalysersRef,
          isDeafenedRef,
        });
      }
    };

    pc.onicecandidate = createIceCandidateHandler({
      remoteUserId,
      currentUserRef,
      realtimeChannelRef: realtimeChannel,
      signalingChannel,
    });

    pc.oniceconnectionstatechange = createIceConnectionStateHandler({
      pc,
      remoteUserId,
      isLeavingRef,
      closePeer,
      iceDisconnectTimersRef: iceDisconnectTimers,
      realtimeChannelRef: realtimeChannel,
      syncParticipants,
      setVoiceError,
      ignoreOfferRef,
    });

    peerConns.current[remoteUserId] = pc;
    return pc;
  }, [closePeer]);

  const cleanupAll = useCallback(async () => {
    console.log('[useVoice] cleanupAll started (EXIT button clicked)');
    
    // СТАВИМ МЕТКУ ПЕРВОЙ ЖЕ СТРОЧКОЙ
    isLeavingRef.current = true;
    const myId = currentUserRef.current?.id;
    
    // Силовое зануление СПИСКА УЧАСТНИКОВ В ЦЕНТРЕ
    setParticipants([]);
    
    // В САЙДБАРЕ УДАЛЯЕМ ТОЛЬКО СЕБЯ, ЧТОБЫ НЕ БЫЛО ПУСТОТЫ
    mutateRealtimeParticipants((prev) => removeSessionFromParticipantMap(prev, {
      userId: currentUserRef.current?.id,
      sessionId: sessionIdRef.current,
    }));

    setActiveChannelId(null); 
    activeChannelIdRef.current = null;
    lastStableChannelIdRef.current = null;
    setConnectingChannelId(null);
    setIsScreenSharing(false); 
    setRemoteScreens({}); 
    setVoiceError(null); 
    await removeVoiceSession(sessionIdRef.current).catch(() => {});
    await refreshVoiceSessions();

    clearManagedTimeout(reconnectTimerRef, '[useVoice] Clearing background reconnect timer');
    clearManagedTimeout(presenceDebounceRef);
    clearManagedInterval(fakeVADIntervalRef);
    clearManagedTimeoutMap(ghostPeersRef);
    
    console.log('[useVoice] Closing peer connections...');
    Object.keys(peerConns.current).forEach(id => closePeer(id, true));

    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
    originalMicStreamRef.current?.getTracks().forEach(t => t.stop()); originalMicStreamRef.current = null;
    
    if (audioContextRef.current) { 
      audioContextRef.current.close().catch(() => {}); 
      audioContextRef.current = null; 
    }
    
    const currentRealtimeChannel = realtimeChannel.current;
    if (currentRealtimeChannel) {
      realtimeChannel.current = null; // Зануляем ДО удаления
      console.log('[useVoice] Removing Realtime channel...');
      await supabase.removeChannel(currentRealtimeChannel).catch(() => {});
    }

    if (globalPresence.current) {
      console.log('[useVoice] Updating global presence (EXIT)...');
      // СИЛОВОЕ УДАЛЕНИЕ: Кричим во ВСЕ доступные каналы (если они подключены)
      const broadcastPayload = { type: 'broadcast', event: 'user-left', payload: { userId: myId, sessionId: sessionIdRef.current } };
      
      if (globalPresence.current?.state === 'joined') {
        globalPresence.current.send(broadcastPayload).catch(() => {});
      }
      if (currentRealtimeChannel?.state === 'joined') {
        currentRealtimeChannel.send(broadcastPayload).catch(() => {});
      }

      await globalPresence.current.track({
        ...presencePayload.current,
        channelId: null,
        joined_at: presencePayload.current.joined_at || Date.now()
      }).catch(() => {});
      
      await globalPresence.current.untrack().catch(() => {});
    }
    
    mutateRealtimeParticipants((prev) => removeSessionFromParticipantMap(prev, {
      userId: currentUserRef.current?.id,
      sessionId: sessionIdRef.current,
    }));
  }, [closePeer, mutateRealtimeParticipants, removeSessionFromParticipantMap]);

  // Глобальный канал (инициализация после всех функций)
  useEffect(() => {
    let cancelled = false;
    const initGlobalChannel = async () => {
      if (globalPresence.current) {
        await supabase.removeChannel(globalPresence.current).catch(() => {});
        globalPresence.current = null;
      }
      await removeChannelsByTopic('global_voice_presence');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const channel = supabase.channel('global_voice_presence', {
        config: { presence: { key: user.id } }
      });
      globalPresence.current = channel;

      channel.on('broadcast', { event: 'speaking-update' }, ({ payload }) => {
        mutateRealtimeParticipants((prev) => (
          updateParticipantSpeakingMap(prev, payload.userId, payload.isSpeaking)
        ));
      });

      // HEARTBEAT REAPER: Удаляем принудительно, если last_seen устарел
      const startHeartbeat = () => {
        restartManagedInterval(heartbeatIntervalRef, async () => {
          if (isLeavingRef.current) return;
          // Обновляем свое состояние
          updatePresenceStatus({ 
            last_seen: Date.now(),
            channelId: activeChannelIdRef.current // ГАРАНТИРУЕМ наличие ID канала
          });

          // И ТУТ ЖЕ проверяем чужие состояния (Ghost Reaper)
          const now = Date.now();
          mutateRealtimeParticipants((prev) => pruneStaleParticipantMap(prev, now));
        }, VOICE_HEARTBEAT_MS); // 10 секунд — золотой стандарт liveness
      };

      const updateAllParticipants = () => {
        if (channel.state !== 'joined' || isLeavingRef.current) return;
        const nextParticipants = buildParticipantMapFromPresenceState(channel.presenceState(), {
          currentUserId: currentUserRef.current?.id,
          isLeaving: isLeavingRef.current,
          now: Date.now(),
        });
        mutateRealtimeParticipants(() => nextParticipants);
      };

      channel.on('presence', { event: 'sync' }, updateAllParticipants);
      channel.on('presence', { event: 'join' }, ({ newPresences }) => {
        updateAllParticipants();
      });
      channel.on('presence', { event: 'leave' }, ({ leftPresences, key }) => {
        // МОМЕНТАЛЬНОЕ УДАЛЕНИЕ: если сессия ушла из Supabase, режем её из UI сразу
        const leavingSessions = ((leftPresences && leftPresences.length > 0) ? leftPresences : [{ userId: key }]).map((presence) => ({
          userId: presence.userId || key,
          sessionId: presence.sessionId,
        }));
        mutateRealtimeParticipants((prev) => (
          leavingSessions.reduce(
            (items, leavingPresence) => removeSessionFromParticipantMap(items, leavingPresence),
            prev
          )
        ));
        updateAllParticipants();
      });

      channel.on('broadcast', { event: 'user-left' }, ({ payload }) => {
        mutateRealtimeParticipants((prev) => removeSessionFromParticipantMap(prev, payload));
      });

      channel.subscribe(async (status) => {
        // ЗАЩИТА: Игнорируем статусы от "старых" каналов, которые мы сами закрыли
        if (channel !== globalPresence.current) return;

        console.log(`[useVoice] Global channel status: ${status}`);
        if (status === 'SUBSCRIBED') {
          if (currentUserRef.current?.id && activeChannelIdRef.current) {
            await channel.track({
              ...presencePayload.current,
              channelId: activeChannelIdRef.current,
              joined_at: presencePayload.current.joined_at || Date.now(),
              sessionId: sessionIdRef.current,
              last_seen: Date.now(),
            }).catch(() => {});
          }
          return;
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (!cancelled && !isLeavingRef.current && !serverVoiceStateRef.current) {
            console.log('[useVoice] Global channel actually lost, recovering in 4s...');
            setTimeout(() => { 
              if (!cancelled && !isLeavingRef.current && !serverVoiceStateRef.current && globalPresence.current === channel) {
                initGlobalChannel(); 
              }
            }, RECONNECT_DELAY_MS);
          }
        }
      });
      startHeartbeat();
    };

    const handleUnload = () => {
      if (activeChannelIdRef.current) {
        cleanupAll();
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    initGlobalChannel();

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleUnload);
      if (globalPresence.current) {
        supabase.removeChannel(globalPresence.current).catch(() => {});
      }
      clearManagedInterval(heartbeatIntervalRef);
      globalPresence.current = null;
    };
  }, [buildParticipantMapFromPresenceState, cleanupAll, mutateRealtimeParticipants, pruneStaleParticipantMap, removeChannelsByTopic, removeSessionFromParticipantMap, updateParticipantSpeakingMap]);

  const updatePresenceStatus = useCallback(async (updates, immediate = false) => {
    const nextChannelId = Object.prototype.hasOwnProperty.call(updates, 'channelId')
      ? updates.channelId
      : activeChannelIdRef.current;
    const nextLastSeen = Object.prototype.hasOwnProperty.call(updates, 'last_seen')
      ? updates.last_seen
      : (presencePayload.current.last_seen || Date.now());

    presencePayload.current = { 
      ...presencePayload.current, 
      ...updates, 
      sessionId: sessionIdRef.current,
      channelId: nextChannelId,
      last_seen: nextLastSeen,
      joined_at: updates.joined_at || presencePayload.current.joined_at || Date.now() 
    };
    
    clearManagedTimeout(presenceDebounceRef);

    const sendUpdate = async () => {
      const payload = { ...presencePayload.current };
      
      // БЛОКИРОВКА: Не шлем, если мы в процессе смены канала или вылета
      if (isLeavingRef.current || isSwitchingRef.current) return;

      if (payload.channelId && payload.userId) {
        await upsertVoiceSession(payload).catch(() => {});
      } else if (!payload.channelId) {
        await removeVoiceSession(sessionIdRef.current).catch(() => {});
      }

      if (realtimeChannel.current && realtimeChannel.current.state === 'joined') {
        await realtimeChannel.current.track(payload).catch(() => {});
      }
      
      const chId = payload.channelId;
      if (!serverVoiceStateRef.current && globalPresence.current && globalPresence.current.state === 'joined' && chId) {
        await globalPresence.current.track({ ...payload, channelId: chId }).catch(() => {});
      }
    };

    if (immediate) {
      await sendUpdate();
    } else {
      presenceDebounceRef.current = setTimeout(sendUpdate, 400); // 400ms – золотая середина
    }
  }, []);

  const syncParticipants = useCallback((channel) => {
    if (channel.state !== 'joined' || isLeavingRef.current) return;

    const state = channel.presenceState();
    const myId = currentUserRef.current?.id;
    const seenUids = new Set();
    
    Object.values(state).flat().forEach(p => {
      if (!p.userId || (isLeavingRef.current && p.userId === myId)) return;
      seenUids.add(p.userId);

      // Локальный канал ТЕПЕРЬ отвечает ТОЛЬКО за создание пиров
      if (p.userId !== myId && !peerConns.current[p.userId] && !ghostPeersRef.current[p.userId]) {
        createPeerConnection(p.userId, channel);
      }
    });

    // Очистка призраков: сокращаем интервал до 5 секунд для отзывчивости
    Object.keys(peerConns.current).forEach(uid => {
      if (!seenUids.has(uid) && !ghostPeersRef.current[uid]) {
        ghostPeersRef.current[uid] = setTimeout(() => { 
          closePeer(uid, true); 
          delete ghostPeersRef.current[uid]; 
        }, GHOST_PEER_GRACE_MS); 
      } else if (seenUids.has(uid) && ghostPeersRef.current[uid]) {
        clearTimeout(ghostPeersRef.current[uid]); 
        delete ghostPeersRef.current[uid];
      }
    });
  }, [createPeerConnection, closePeer]);

  const joinVoiceChannel = useCallback(async (channelId, user, username, color, isSilent = false) => {
    if (!channelId || !user) return;
    const currentStableChannelId = resolveStableVoiceChannelId(
      lastStableChannelIdRef.current,
      activeChannelIdRef.current,
      presencePayload.current.channelId
    );
    setConnectingChannelId(channelId);
    
    // Если мы уже подключаемся к ЭТОМУ ЖЕ каналу — игнорируем повторный вызов
    if (isConnecting && activeChannelIdRef.current === channelId) {
      console.log('[useVoice] Already connecting to this channel, skipping...');
      return;
    }

    // 1. Очистка старого КАНАЛА (сигналки) — делаем всегда, чтобы не дублировать слушателей
    if (realtimeChannel.current) {
      console.log('[useVoice] Intentionally removing old channel before re-joining');
      const oldChannel = realtimeChannel.current;
      realtimeChannel.current = null; // Mark as inactive BEFORE removal to stop loop
      await supabase.removeChannel(oldChannel).catch(() => {});
    }

    isSwitchingRef.current = true;

    // 2. Полная очистка МЕДИА (микрофон, пиры) — ТОЛЬКО если мы реально меняем комнату
    if (currentStableChannelId && currentStableChannelId !== channelId) {
      console.log('[useVoice] Changing channel, full cleanup...');
      await cleanupAll();
    }
    
    // МЯГКИЙ РЕКОННЕКТ: Если это тихий перезапуск того же канала — не убиваем поток и пиры
    const isActuallyReconnecting = isSilent && currentStableChannelId === channelId && localStream.current;
    
    if (isActuallyReconnecting && localStream.current) {
      console.log('[useVoice] Reusing existing streams for soft reconnect');
    } else {
      isLeavingRef.current = false;
      activeChannelIdRef.current = channelId; // УСТАНАВЛИВАЕМ СРАЗУ, чтобы не было "невидимости" в сайдбаре
      setIsConnecting(true); setVoiceError(null);
      try {
        const constraints = { 
          audio: { 
            echoCancellation: false, 
            noiseSuppression: false, 
            autoGainControl: true,
            sampleRate: 48000 
          }, 
          video: false 
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        originalMicStreamRef.current = stream;
        
        // Принудительно ставим статус мута сразу при создании
        stream.getAudioTracks().forEach(t => t.enabled = !(isMutedRef.current || isDeafenedRef.current));

        // ── Интеллектуальное шумоподавление (RNNoise AI) ──
        const nsEnabled = localStorage.getItem('vibe_noise_suppression') === 'true';
        let finalStream = stream;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        audioContextRef.current = audioCtx;
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        if (nsEnabled) {
          try {
            console.log('[useVoice] Активация AI шумоподавления...');
            await audioCtx.audioWorklet.addModule('/audio/rnnoise_processor.js');
            
            const source = audioCtx.createMediaStreamSource(stream);
            const rnnoiseNode = new AudioWorkletNode(audioCtx, 'rnnoise-processor');
            
            // Сохраняем в Ref для внешнего управления
            rnnoiseNodeRef.current = rnnoiseNode;

            // Ставим начальную интенсивность
            const initialIntensity = parseInt(localStorage.getItem('vibe_noise_intensity') || '100');
            rnnoiseNode.port.postMessage({ type: 'setIntensity', value: initialIntensity });
            
            // Живое обновление интенсивности
            const handleLiveIntensity = (e) => {
              if (rnnoiseNodeRef.current) {
                 rnnoiseNodeRef.current.port.postMessage({ type: 'setIntensity', value: e.detail.value });
              }
            };
            window.addEventListener('vibe-update-ns-intensity', handleLiveIntensity);
            
            const destination = audioCtx.createMediaStreamDestination();
            source.connect(rnnoiseNode).connect(destination);
            
            finalStream = destination.stream;
            console.log('[useVoice] AI шумоподавление запущено (Интенсивность:', initialIntensity, '%) 🛡️🎙️');
          } catch (err) {
            console.error('[useVoice] Ошибка шумодава (Safe Fallback):', err);
            finalStream = stream;
          }
        }

        localStream.current = finalStream;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        const vadSource = audioCtx.createMediaStreamSource(finalStream.clone());
        vadSource.connect(analyser);

        let lastPresenceUpdate = 0;
        fakeVADIntervalRef.current = setInterval(() => {
          // ПРОВЕРКА ПОТОКА: если поток умер — тормозим
          if (!localStream.current || !localStream.current.active) return;

          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          let sumSquares = 0.0;
          for (const amplitude of data) sumSquares += amplitude * amplitude;
          const rms = Math.sqrt(sumSquares / data.length);
          const speaking = rms > 0.015 && !isMutedRef.current;

          if (speaking !== isSpeakingRef.current) {
            setIsSpeaking(speaking);
            isSpeakingRef.current = speaking;
            
            // БЫСТРЫЙ BROADCAST ДЛЯ ВСЕХ (БЕЗЛИМИТНЫЙ)
            const payload = { userId: currentUserRef.current.id, isSpeaking: speaking };
            if (realtimeChannel.current && realtimeChannel.current.state === 'joined') {
              realtimeChannel.current.send({ type: 'broadcast', event: 'speaking-update', payload });
            }
            
            // МЕДЛЕННЫЙ TRACK (ТОЛЬКО РАЗ В 500мс ДЛЯ СТАБИЛЬНОСТИ)
            const now = Date.now();
            if (now - lastPresenceUpdate > 500) {
               lastPresenceUpdate = now;
               updatePresenceStatus({ isSpeaking: speaking });
            }
          }

          // 2. Анализируем ВСЕХ ОСТАЛЬНЫХ в канале (ЛОКАЛЬНО)
          Object.keys(remoteAnalysersRef.current).forEach(uid => {
            const { analyser: rAnalyser, data: rData } = remoteAnalysersRef.current[uid];
            rAnalyser.getFloatTimeDomainData(rData);
            let rSum = 0; for (let i = 0; i < rData.length; i++) rSum += rData[i] * rData[i];
            const rRms = Math.sqrt(rSum / rData.length);
            const rSpeaking = rRms > 0.01;

            // Синхронизируем с общим списком (все управление через AllParticipants)
            mutateRealtimeParticipants((all) => updateParticipantSpeakingMap(all, uid, rSpeaking));
          });
        }, 150);
      } catch (err) {
        console.error('[useVoice] Media initialization failed:', err);
        setVoiceError(`Ошибка микрофона: ${err.message}`);
        setIsConnecting(false);
        return;
      }
    }

    try {
      currentUserRef.current = { id: user.id, username };
      presencePayload.current = { 
        userId: user.id, 
        username, 
        color, 
        channelId,
        joined_at: Date.now(),
        isScreenSharing: false, 
        isSpeaking: false, 
        isMuted: isMutedRef.current, 
        isDeafened: isDeafenedRef.current,
        sessionId: sessionIdRef.current,
        last_seen: Date.now()
      };

      await removeChannelsByTopic(`voice:${channelId}`);
      const channel = supabase.channel(`voice:${channelId}`, { config: { presence: { key: user.id } } });
      realtimeChannel.current = channel;
      channel.on('presence', { event: 'sync' }, () => syncParticipants(channel));
      channel.on('presence', { event: 'join' }, () => syncParticipants(channel));
      // ?????????????????? ?????????? ???????????? ???? ?????????????? ???????????? ????????????????????, ?????????? ???? ???????? ???????????????????? ?? ????????????????????.
      // ???????????????????????? ???????????????????? ??? ?????????????????? ????????????, ???? ???? ???? ???????? ???????????????????????????? ?????????? ?????? ????????????
      channel.on('broadcast', { event: 'speaking-update' }, ({ payload }) => {
        mutateRealtimeParticipants((prev) => (
          updateParticipantSpeakingMap(prev, payload.userId, payload.isSpeaking)
        ));
      });

      channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        console.log(`[WebRTC] Handle offer from ${payload.from}`);
        
        try {
          const pc = peerConns.current[payload.from] || createPeerConnection(payload.from, channel);
          const myId = user.id;
          
          // Механизм Perfect Negotiation (Polite peer logic)
          const offerCollision = (payload.event === 'offer') && 
                                 (makingOfferRef.current[payload.from] || pc.signalingState !== 'stable');
          
          // Мы вежливые (polite), если наш ID меньше ID собеседника (или любая другая стабильная логика)
          const isPolite = myId < payload.from;

          ignoreOfferRef.current[payload.from] = !isPolite && offerCollision;
          if (ignoreOfferRef.current[payload.from]) {
            console.warn(`[WebRTC] Collision: Ignoring offer from ${payload.from} (Impolite)`);
            return;
          }

          if (offerCollision) {
            console.log(`[WebRTC] Collision: Rolling back local for ${payload.from} (Polite)`);
            await pc.setLocalDescription({ type: 'rollback' });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          if (channel.state === 'joined') {
            channel.send({ 
              type: 'broadcast', event: 'answer', 
              payload: { from: user.id, to: payload.from, sdp: answer } 
            });
          }
        } catch (err) {
          console.error('[WebRTC] Error handling offer:', err);
        }
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to === user.id && peerConns.current[payload.from]) {
          console.log(`[WebRTC] Handle answer from ${payload.from}`);
          try {
            const pc = peerConns.current[payload.from];
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          } catch (err) {
            console.warn(`[Signaling] Answer handling failed for ${payload.from}: ${err.message}`);
          }
        }
      });

      channel.on('broadcast', { event: 'ice' }, ({ payload }) => {
        if (payload.to === user.id && peerConns.current[payload.from]) {
          peerConns.current[payload.from].addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(()=>{});
        }
      });

      // СЛУШАЕМ УХОД В ЛОКАЛЬНОМ КАНАЛЕ (БЫСТРАЯ ОЧИСТКА)
      channel.on('broadcast', { event: 'user-left' }, ({ payload }) => {
        mutateRealtimeParticipants((prev) => removeSessionFromParticipantMap(prev, payload));
        closePeer(payload.userId, true);
      });

      channel.on('broadcast', { event: 'request-stream' }, ({ payload }) => {
        if (payload.to === user.id && screenStreamRef.current && peerConns.current[payload.from]) {
          const pc = peerConns.current[payload.from];
          const currentSenders = pc.getSenders();
          
          screenStreamRef.current.getTracks().forEach(track => {
            // ПРОВЕРКА: Если трек уже был добавлен ранее, не добавляем его снова
            const alreadyAdded = currentSenders.some(s => s.track === track);
            if (!alreadyAdded) {
               console.log(`[WebRTC] Adding screen track for requester ${payload.from}`);
               pc.addTrack(track, screenStreamRef.current);
            }
          });
        }
      });

      channel.subscribe(async (status) => {
        console.log(`[useVoice] Channel status: ${status} for instance:`, channel.topic);
        
        if (status === 'SUBSCRIBED') {
          // ЗАЩИТА ОТ ГОНКИ: Если мы уже нажали выход ИЛИ переключились на другой канал
          if (isLeavingRef.current || activeChannelIdRef.current !== channelId || channel !== realtimeChannel.current) {
             console.warn('[useVoice] Late subscription aborted to prevent ghosting.');
             if (channel !== realtimeChannel.current) {
               supabase.removeChannel(channel).catch(() => {});
             }
             setIsConnecting(false);
             setConnectingChannelId(null);
             return;
          }

          isSwitchingRef.current = false;
          reconnectAttemptsRef.current = 0;
          setServerStatus('online');
          setVoiceError(null);
          lastStableChannelIdRef.current = channelId;
          
          await updatePresenceStatus({}, true);
          await upsertVoiceSession({ ...presencePayload.current, channelId }).catch(() => {});
          await refreshVoiceSessions();

          
          // УВЕДОМЛЕНИЕ О ВХОДЕ (ТОЛЬКО ЕСЛИ НЕ ТИХИЙ РЕКОННЕКТ)
          if (!isSilent) notifications.play('self_join');
          
          if (globalPresence.current) {
            mutateRealtimeParticipants((prev) => appendParticipantToChannel(prev, channelId, {
              ...presencePayload.current,
              channelId,
            }));
          }
          
          setActiveChannelId(channelId); 
          activeChannelIdRef.current = channelId;
          setIsConnecting(false);
          setConnectingChannelId(null);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          // ЗАЩИТА: Игнорируем статусы от старых инстансов канала
          if (channel !== realtimeChannel.current || isLeavingRef.current || isSwitchingRef.current) {
            return;
          }
          
          reconnectAttemptsRef.current++;
          console.warn(`[useVoice] Realtime lost (${status}). Attempt ${reconnectAttemptsRef.current}/5`);
          
          setServerStatus('reconnecting');
          
          if (reconnectAttemptsRef.current > 5) {
            setServerStatus('offline');
            setVoiceError('[Server] Соединение полностью потеряно');
            setIsConnecting(false);
            setConnectingChannelId(null);
          } else {
            scheduleManagedTimeout(reconnectTimerRef, () => {
              const reconnectChannelId = resolveStableVoiceChannelId(
                lastStableChannelIdRef.current,
                activeChannelIdRef.current,
                presencePayload.current.channelId
              );
              if (reconnectChannelId && !isLeavingRef.current && realtimeChannel.current === channel) {
                console.log(`[useVoice] Attempting background reconnect...`);
                joinVoiceChannel(reconnectChannelId, currentUserRef.current, currentUserRef.current.username, presencePayload.current.color, true);
              }
            }, RECONNECT_DELAY_MS);
          }
        }
      });
    } catch (err) { 
      console.error('[useVoice] Fatal join error:', err);
      if (reconnectAttemptsRef.current === 0 || reconnectAttemptsRef.current > 5) {
        setVoiceError(err.message); 
      }
      setIsConnecting(false); 
      setConnectingChannelId(null);
      // При фатальной ошибке зануляем реконнект, чтобы не спамить
      clearManagedTimeout(reconnectTimerRef);
    }
  }, [activeChannelId, appendParticipantToChannel, cleanupAll, closePeer, createPeerConnection, mutateRealtimeParticipants, refreshVoiceSessions, removeChannelsByTopic, removeSessionFromParticipantMap, syncParticipants, updateParticipantSpeakingMap, updatePresenceStatus]);

  const leaveVoiceChannel = cleanupAll;

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next; setIsMuted(next);
    
    // Выключаем звук ВЕЗДЕ: и в AI-потоке, и в сыром микрофоне
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(t => t.enabled = !next);
    }
    if (originalMicStreamRef.current) {
      originalMicStreamRef.current.getAudioTracks().forEach(t => t.enabled = !next);
    }
    
    updatePresenceStatus({ isMuted: next });
    notifications.play(next ? 'mute' : 'unmute');
  }, [updatePresenceStatus]);

  const toggleDeafen = useCallback(() => {
    const next = !isDeafenedRef.current;
    isDeafenedRef.current = next; setIsDeafened(next);
    
    // При выключении звука (Deafen) ставим всем 0. 
    // При включении - восстанавливаем сохраненную громкость для каждого.
    Object.keys(gainNodesRef.current).forEach(uid => {
      const g = gainNodesRef.current[uid];
      if (!g) return;
      if (next) {
        g.gain.value = 0;
      } else {
        const saved = localStorage.getItem(`vol_${uid}`);
        g.gain.value = saved !== null ? Number(saved) / 100 : 1.0;
      }
    });

    updatePresenceStatus({ isDeafened: next });
    notifications.play(next ? 'deafen' : 'undeafen');
  }, [updatePresenceStatus]);

  const setParticipantVolume = useCallback((userId, volumePct) => {
    localStorage.setItem(`vol_${userId}`, volumePct);
    const g = gainNodesRef.current[userId];
    if (g) {
      // Прямое управление громкостью через GainNode
      g.gain.setTargetAtTime(volumePct / 100, audioContextRef.current.currentTime, 0.05);
    }
    // Оповещаем другие компоненты об изменении
    window.dispatchEvent(new CustomEvent('volumeChanged', { 
      detail: { userId, volumePct } 
    }));
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      console.log('[WebRTC] Stopping screen share safely...');
      const tracks = screenStreamRef.current.getTracks();
      
      // Keep the SDP sender order stable while removing the screen video track.

      await detachScreenShareFromPeers(peerConns.current);

      tracks.forEach(t => t.stop());
      screenStreamRef.current = null; setIsScreenSharing(false);
      setTimeout(() => updatePresenceStatus({ isScreenSharing: false }), 300);
    }
  }, [updatePresenceStatus]);

  const startScreenShare = useCallback(async (quality = '720p', user = null, sourceId = null) => {
    try {
      console.log('[WebRTC] Starting screen share, sourceId:', sourceId);

      const profile = getScreenShareProfile(quality);
      const constraints = buildScreenShareConstraints(profile, sourceId);

      setVoiceError(null);
      const stream = sourceId
        ? await navigator.mediaDevices.getUserMedia(constraints)
        : await navigator.mediaDevices.getDisplayMedia(constraints);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && profile.contentHint) {
        // Prefer screen clarity for text/code over smoother motion.
        videoTrack.contentHint = profile.contentHint;
      }

      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      setVoiceError(null);

      // Attach the screen stream to already connected peers.
      await attachScreenShareToPeers(peerConns.current, stream, profile);

      updatePresenceStatus({ isScreenSharing: true });
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {
      console.error('Screen sharing error', err);

      // Ignore the cancellation case when the user closes the picker.
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
        return;
      }

      setVoiceError(`Unable to start stream: ${err.message}`);
      setIsScreenSharing(false);
      screenStreamRef.current = null;
      stopScreenShare(); // Final cleanup guard.
    }
  }, [updatePresenceStatus, stopScreenShare]);
  useEffect(() => {
    if (!activeChannelId) {
      setPing(null);
      return;
    }

    const interval = setInterval(async () => {
      const start = Date.now();
      try {
        await supabase.from('profiles').select('id').limit(1);
        setPing(Date.now() - start);
      } catch {
        setPing(null);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeChannelId]);


  // ЭФФЕКТ ДЛЯ ГЛОБАЛЬНЫХ ГОРЯЧИХ КЛАВИШ (EXE-ONLY)
  useEffect(() => {
    if (window.electronAPI) {
      console.log('[useVoice] Desktop mode: Initializing Global Hotkeys...');
      
      // 1. Регистрируем текущие клавиши (Электрон) с проверкой
      if (window.electronAPI && typeof window.electronAPI.registerHotkeys === 'function') {
        const muteKey = localStorage.getItem('vibe_hotkey_mute') || '';
        const deafenKey = localStorage.getItem('vibe_hotkey_deafen') || '';
        window.electronAPI.registerHotkeys({ mute: muteKey, deafen: deafenKey });
      }

      // 2. Слушаем глобальные горячие клавиши (Электрон)
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.onHotkey === 'function') {
        const unsubscribe = window.electronAPI.onHotkey((action) => {
          if (action === 'mute') toggleMute();
          else if (action === 'deafen') toggleDeafen();
        });
        return () => unsubscribe();
      }
    }
  }, [toggleMute, toggleDeafen]);

  return {
    activeChannelId, connectingChannelId, participants, allParticipants, ping, voiceError, serverStatus,
    isMuted, isDeafened, isConnecting, isSpeaking, isScreenSharing, remoteScreens,
    joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen, setParticipantVolume,
    startScreenShare, stopScreenShare, requestScreenView: (id) => {
      realtimeChannel.current?.send({ type: 'broadcast', event: 'request-stream', payload: { from: currentUserRef.current.id, to: id } });
    },
    clearVoiceError: () => setVoiceError(null)
  };
}






