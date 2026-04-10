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
import { initializeLocalVoiceMedia } from './voice/mediaInit';
import {
  createAnswerBroadcastHandler,
  createIceBroadcastHandler,
  createOfferBroadcastHandler,
  createRequestStreamBroadcastHandler,
  createUserLeftBroadcastHandler,
} from './voice/signaling';
import { createLocalVoiceChannelStatusHandler } from './voice/channelStatus';
import {
  createGlobalParticipantsUpdater,
  createGlobalPresenceLeaveHandler,
  createGlobalPresenceStatusHandler,
} from './voice/globalPresence';
import { syncLocalVoiceParticipants } from './voice/sessionSync';
import { cleanupVoiceSessionState } from './voice/cleanup';
import { setupLocalVoiceChannel } from './voice/localChannelBootstrap';
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
    await cleanupVoiceSessionState({
      currentUserRef,
      sessionIdRef,
      isLeavingRef,
      mutateRealtimeParticipants,
      removeSessionFromParticipantMap,
      setParticipants,
      setActiveChannelId,
      activeChannelIdRef,
      lastStableChannelIdRef,
      setConnectingChannelId,
      setIsScreenSharing,
      setRemoteScreens,
      setVoiceError,
      setIsConnecting,
      removeVoiceSession,
      refreshVoiceSessions,
      reconnectTimerRef,
      presenceDebounceRef,
      fakeVADIntervalRef,
      heartbeatIntervalRef,
      ghostPeersRef,
      clearManagedTimeout,
      clearManagedInterval,
      clearManagedTimeoutMap,
      peerConnsRef: peerConns,
      closePeer,
      localStreamRef: localStream,
      originalMicStreamRef,
      screenStreamRef,
      audioContextRef,
      rnnoiseNodeRef,
      gainNodesRef,
      remoteAnalysersRef,
      audioElementsRef: audioElements,
      realtimeChannelRef: realtimeChannel,
      globalPresenceRef: globalPresence,
      presencePayloadRef: presencePayload,
      supabaseClient: supabase,
    });
  }, [closePeer, mutateRealtimeParticipants, refreshVoiceSessions, removeSessionFromParticipantMap]);

  // Глобальный канал (инициализация после всех функций)
  useEffect(() => {
    const cancelledRef = { current: false };
    const initGlobalChannel = async () => {
      if (globalPresence.current) {
        await supabase.removeChannel(globalPresence.current).catch(() => {});
        globalPresence.current = null;
      }
      await removeChannelsByTopic('global_voice_presence');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelledRef.current) return;

      const channel = supabase.channel('global_voice_presence', {
        config: { presence: { key: user.id } }
      });
      globalPresence.current = channel;

      channel.on('broadcast', { event: 'speaking-update' }, ({ payload }) => {
        mutateRealtimeParticipants((prev) => (
          updateParticipantSpeakingMap(prev, payload.userId, payload.isSpeaking)
        ));
      });

      const startHeartbeat = () => {
        restartManagedInterval(heartbeatIntervalRef, async () => {
          if (isLeavingRef.current) return;
          updatePresenceStatus({
            last_seen: Date.now(),
            channelId: activeChannelIdRef.current,
          });

          const now = Date.now();
          mutateRealtimeParticipants((prev) => pruneStaleParticipantMap(prev, now));
        }, VOICE_HEARTBEAT_MS);
      };

      const updateAllParticipants = createGlobalParticipantsUpdater({
        channel,
        currentUserRef,
        isLeavingRef,
        buildParticipantMapFromPresenceState,
        mutateRealtimeParticipants,
      });

      channel.on('presence', { event: 'sync' }, updateAllParticipants);
      channel.on('presence', { event: 'join' }, updateAllParticipants);
      channel.on('presence', { event: 'leave' }, createGlobalPresenceLeaveHandler({
        mutateRealtimeParticipants,
        removeSessionFromParticipantMap,
        updateAllParticipants,
      }));

      channel.on('broadcast', { event: 'user-left' }, ({ payload }) => {
        mutateRealtimeParticipants((prev) => removeSessionFromParticipantMap(prev, payload));
      });

      channel.subscribe(createGlobalPresenceStatusHandler({
        channel,
        cancelledRef,
        globalPresenceRef: globalPresence,
        currentUserRef,
        activeChannelIdRef,
        presencePayloadRef: presencePayload,
        sessionIdRef,
        isLeavingRef,
        serverVoiceStateRef,
        RECONNECT_DELAY_MS,
        scheduleRecovery: (delayMs, shouldRecover) => {
          setTimeout(() => {
            if (shouldRecover()) {
              initGlobalChannel();
            }
          }, delayMs);
        },
      }));
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
      cancelledRef.current = true;
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
    syncLocalVoiceParticipants({
      channel,
      isLeavingRef,
      currentUserRef,
      peerConnsRef: peerConns,
      ghostPeersRef,
      createPeerConnection,
      closePeer,
      GHOST_PEER_GRACE_MS,
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
        await initializeLocalVoiceMedia({
          isMutedRef,
          isDeafenedRef,
          originalMicStreamRef,
          audioContextRef,
          rnnoiseNodeRef,
          localStreamRef: localStream,
          fakeVADIntervalRef,
          remoteAnalysersRef,
          currentUserRef,
          realtimeChannelRef: realtimeChannel,
          isSpeakingRef,
          setIsSpeaking,
          mutateRealtimeParticipants,
          updateParticipantSpeakingMap,
          updatePresenceStatus,
        });
      } catch (err) {
        console.error('[useVoice] Media initialization failed:', err);
        setVoiceError(`Microphone error: ${err.message}`);
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
      setupLocalVoiceChannel({
        supabaseClient: supabase,
        channelId,
        user,
        realtimeChannelRef: realtimeChannel,
        syncParticipants,
        mutateRealtimeParticipants,
        updateParticipantSpeakingMap,
        createOfferBroadcastHandler,
        createAnswerBroadcastHandler,
        createIceBroadcastHandler,
        createUserLeftBroadcastHandler,
        createRequestStreamBroadcastHandler,
        createLocalVoiceChannelStatusHandler,
        createPeerConnection,
        removeSessionFromParticipantMap,
        closePeer,
        peerConnsRef: peerConns,
        makingOfferRef,
        ignoreOfferRef,
        screenStreamRef,
        isSilent,
        isLeavingRef,
        isSwitchingRef,
        activeChannelIdRef,
        reconnectAttemptsRef,
        reconnectTimerRef,
        lastStableChannelIdRef,
        presencePayloadRef: presencePayload,
        globalPresenceRef: globalPresence,
        currentUserRef,
        setServerStatus,
        setVoiceError,
        setIsConnecting,
        setConnectingChannelId,
        setActiveChannelId,
        updatePresenceStatus,
        upsertVoiceSession,
        refreshVoiceSessions,
        appendParticipantToChannel,
        scheduleManagedTimeout,
        resolveStableVoiceChannelId,
        joinVoiceChannel,
        notifications,
        RECONNECT_DELAY_MS,
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







