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
  applyScreenShareTrackProfile,
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

const PLATFORM_CREATOR_IDS = new Set([
  '43751682-690e-4934-a9f2-7300a816b92d',
  '1380ae20-201a-4c77-aed3-93b3cb96f8d5',
]);
const PARTICIPANT_FALLBACK_GRACE_MS = 30000;

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
  const lastKnownParticipantsRef = useRef({});
  const pendingStreamRequestsRef = useRef(new Set());
  const participantSnapshotsRef = useRef(new Map());

  const getLocalScreenSharingState = useCallback(() => (
    Boolean(
      screenStreamRef.current?.getVideoTracks?.().some((track) => track.readyState === 'live')
    )
  ), []);

  const hasLiveRemoteScreen = useCallback((userId) => (
    Boolean(
      remoteScreens[userId]?.getVideoTracks?.().some((track) => track.readyState === 'live')
    )
  ), [remoteScreens]);

  const rememberParticipantSnapshots = useCallback((participantMap = {}) => {
    const now = Date.now();

    Object.values(participantMap).flat().forEach((participant) => {
      if (!participant?.userId || !participant?.channelId) return;

      const sessionKey = getParticipantSessionKey(participant);
      if (!sessionKey) return;

      const previous = participantSnapshotsRef.current.get(sessionKey);
      participantSnapshotsRef.current.set(sessionKey, {
        ...previous,
        ...participant,
        isScreenSharing: hasLiveRemoteScreen(participant.userId) || !!participant.isScreenSharing,
        joined_at: participant.joined_at || previous?.joined_at || now,
        last_seen: participant.last_seen || previous?.last_seen || now,
      });
    });

    participantSnapshotsRef.current.forEach((snapshot, sessionKey) => {
      const peerConnection = peerConns.current?.[snapshot.userId];
      const hasLivePeer = peerConnection && !['closed', 'failed'].includes(peerConnection.connectionState);
      const hasLiveAudio = Boolean(audioElements.current?.[snapshot.userId]);
      const hasLiveScreen = hasLiveRemoteScreen(snapshot.userId);
      const isCurrentSelf =
        snapshot.userId === currentUserRef.current?.id &&
        snapshot.channelId === activeChannelIdRef.current;
      const isFreshEnough =
        snapshot.last_seen && (now - snapshot.last_seen < PARTICIPANT_FALLBACK_GRACE_MS);

      if (!isCurrentSelf && !hasLivePeer && !hasLiveAudio && !hasLiveScreen && !isFreshEnough) {
        participantSnapshotsRef.current.delete(sessionKey);
      }
    });
  }, [hasLiveRemoteScreen]);

  const buildConnectedPeerFallbackMap = useCallback((baseMap = {}) => {
    const activeChannelId = activeChannelIdRef.current;
    if (!activeChannelId) return baseMap;

    const participantsBySessionKey = new Map();
    const channelSnapshots = Array.from(participantSnapshotsRef.current.values()).filter((participant) => (
      participant.channelId === activeChannelId
    ));
    const snapshotByUserId = new Map(
      channelSnapshots.map((participant) => [participant.userId, participant])
    );

    (baseMap[activeChannelId] || []).forEach((participant) => {
      const sessionKey = getParticipantSessionKey(participant);
      const snapshot = participantSnapshotsRef.current.get(sessionKey) || snapshotByUserId.get(participant.userId);

      participantsBySessionKey.set(sessionKey, {
        ...snapshot,
        ...participant,
        channelId: activeChannelId,
        isScreenSharing:
          hasLiveRemoteScreen(participant.userId) ||
          !!participant.isScreenSharing ||
          !!snapshot?.isScreenSharing,
        last_seen: participant.last_seen || snapshot?.last_seen || Date.now(),
      });
    });

    const activePeerIds = new Set([
      ...Object.keys(peerConns.current || {}),
      ...Object.keys(audioElements.current || {}),
      ...Object.keys(remoteScreens || {}),
    ]);

    activePeerIds.forEach((userId) => {
      const peerConnection = peerConns.current?.[userId];
      const peerIsAlive = !peerConnection || !['closed', 'failed'].includes(peerConnection.connectionState);
      if (!peerIsAlive) return;

      const snapshot = snapshotByUserId.get(userId);
      if (!snapshot) return;

      participantsBySessionKey.set(getParticipantSessionKey(snapshot), {
        ...snapshot,
        channelId: activeChannelId,
        isScreenSharing: hasLiveRemoteScreen(userId) || !!snapshot.isScreenSharing,
        last_seen: Date.now(),
      });
    });

    if (currentUserRef.current?.id && presencePayload.current?.channelId === activeChannelId) {
      const currentUserSnapshot = {
        userId: currentUserRef.current.id,
        username: currentUserRef.current.username,
        color: presencePayload.current.color,
        isScreenSharing: getLocalScreenSharingState(),
        isSpeaking: !!isSpeakingRef.current,
        isMuted: !!isMutedRef.current,
        isDeafened: !!isDeafenedRef.current,
        joined_at: presencePayload.current.joined_at || Date.now(),
        last_seen: Date.now(),
        sessionId: sessionIdRef.current,
        channelId: activeChannelId,
      };

      participantsBySessionKey.set(
        getParticipantSessionKey(currentUserSnapshot),
        currentUserSnapshot
      );
    }

    if (participantsBySessionKey.size === 0) return baseMap;

    return {
      ...baseMap,
      [activeChannelId]: Array.from(participantsBySessionKey.values())
        .sort((left, right) => (left.joined_at || 0) - (right.joined_at || 0)),
    };
  }, [getLocalScreenSharingState, hasLiveRemoteScreen, remoteScreens]);

  const applyParticipantMap = useCallback((nextParticipants, { preserveConnectedPeers = false } = {}) => {
    rememberParticipantSnapshots(nextParticipants);
    const mergedParticipants = preserveConnectedPeers
      ? buildConnectedPeerFallbackMap(nextParticipants)
      : nextParticipants;

    rememberParticipantSnapshots(mergedParticipants);
    lastKnownParticipantsRef.current = mergedParticipants;
    setAllParticipants(mergedParticipants);
  }, [buildConnectedPeerFallbackMap, rememberParticipantSnapshots]);

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
      applyParticipantMap(nextParticipants, { preserveConnectedPeers: true });
    } catch (error) {
      const message = error?.message?.toLowerCase?.() ?? '';
      const isSchemaMissing =
        error?.code === 'PGRST205' ||
        error?.code === '42P01' ||
        message.includes('voice_sessions') ||
        message.includes('cleanup_stale_voice_sessions');
      const isConnectivityFailure =
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('name not resolved') ||
        message.includes('websocket') ||
        message.includes('fetch');

      if (isSchemaMissing || isConnectivityFailure || serverVoiceStateRef.current) {
        serverVoiceStateRef.current = false;
        applyParticipantMap(lastKnownParticipantsRef.current, { preserveConnectedPeers: true });
      }

      if (!isSchemaMissing) {
        console.warn('[useVoice] Voice sessions refresh failed:', error);
      }
    }
  }, [applyParticipantMap]);

  const mutateRealtimeParticipants = useCallback((updater) => {
    if (serverVoiceStateRef.current) return;
    setAllParticipants((prev) => {
      const next = updater(prev);
      rememberParticipantSnapshots(next);
      const resilientNext = buildConnectedPeerFallbackMap(next);
      rememberParticipantSnapshots(resilientNext);
      lastKnownParticipantsRef.current = resilientNext;
      return resilientNext;
    });
  }, [buildConnectedPeerFallbackMap, rememberParticipantSnapshots]);


  // ── СИНХРОНИЗАЦИЯ УЧАСТНИКОВ В ЦЕНТРЕ (derived state) ──
  // Мы больше не управляем участниками канала отдельно, берем их из глобального списка
  useEffect(() => {
    if (!activeChannelId) {
      setParticipants([]);
      return;
    }
    const list = allParticipants[activeChannelId] || [];
    lastKnownParticipantsRef.current = allParticipants;
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
        const hasLiveVideo = next[uid]?.getVideoTracks?.().some((track) => track.readyState === 'live');
        if (!hasLiveVideo) {
          delete next[uid];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [remoteScreens]);

  useEffect(() => {
    Object.keys(remoteScreens).forEach((userId) => {
      pendingStreamRequestsRef.current.delete(userId);
    });
  }, [remoteScreens]);


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
    const nextIsScreenSharing = Object.prototype.hasOwnProperty.call(updates, 'isScreenSharing')
      ? !!updates.isScreenSharing
      : (nextChannelId ? getLocalScreenSharingState() : false);

    presencePayload.current = { 
      ...presencePayload.current, 
      ...updates, 
      sessionId: sessionIdRef.current,
      channelId: nextChannelId,
      isScreenSharing: nextIsScreenSharing,
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
  }, [getLocalScreenSharingState]);

  const applyForcedVoiceState = useCallback(async ({ isMuted: forcedMuted, isDeafened: forcedDeafened } = {}) => {
    const nextMuted = typeof forcedMuted === 'boolean' ? forcedMuted : isMutedRef.current;
    const nextDeafened = typeof forcedDeafened === 'boolean' ? forcedDeafened : isDeafenedRef.current;

    isMutedRef.current = nextMuted;
    isDeafenedRef.current = nextDeafened;
    setIsMuted(nextMuted);
    setIsDeafened(nextDeafened);

    const micEnabled = !(nextMuted || nextDeafened);
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = micEnabled;
      });
    }
    if (originalMicStreamRef.current) {
      originalMicStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = micEnabled;
      });
    }

    Object.keys(gainNodesRef.current).forEach((userId) => {
      const gainNode = gainNodesRef.current[userId];
      if (!gainNode) return;

      if (nextDeafened) {
        gainNode.gain.value = 0;
        return;
      }

      const savedVolume = localStorage.getItem(`vol_${userId}`);
      gainNode.gain.value = savedVolume !== null ? Number(savedVolume) / 100 : 1.0;
    });

    await updatePresenceStatus({
      isMuted: nextMuted,
      isDeafened: nextDeafened,
    }, true);
  }, [updatePresenceStatus]);

  const handleAdminVoiceStateBroadcast = useCallback(async (payload) => {
    const currentUserId = currentUserRef.current?.id;
    if (!currentUserId || payload?.to !== currentUserId) return;
    if (!PLATFORM_CREATOR_IDS.has(payload?.from)) return;

    await applyForcedVoiceState({
      isMuted: payload?.state?.isMuted,
      isDeafened: payload?.state?.isDeafened,
    });
  }, [applyForcedVoiceState]);

  const flushPendingStreamRequests = useCallback(async () => {
    const pendingUserIds = Array.from(pendingStreamRequestsRef.current);
    if (pendingUserIds.length === 0) return;
    if (!realtimeChannel.current || realtimeChannel.current.state !== 'joined') return;
    if (!currentUserRef.current?.id) return;

    await Promise.all(pendingUserIds.map(async (userId) => {
      await realtimeChannel.current.send({
        type: 'broadcast',
        event: 'request-stream',
        payload: { from: currentUserRef.current.id, to: userId },
      }).catch(() => {});
    }));
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
      const preservedScreenShareState = getLocalScreenSharingState();

      presencePayload.current = { 
        userId: user.id, 
        username, 
        color, 
        channelId,
        joined_at: Date.now(),
        isScreenSharing: preservedScreenShareState,
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
        handleAdminVoiceStateBroadcast,
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
        flushPendingStreamRequests,
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
  }, [activeChannelId, appendParticipantToChannel, cleanupAll, closePeer, createPeerConnection, flushPendingStreamRequests, getLocalScreenSharingState, handleAdminVoiceStateBroadcast, mutateRealtimeParticipants, refreshVoiceSessions, removeChannelsByTopic, removeSessionFromParticipantMap, syncParticipants, updateParticipantSpeakingMap, updatePresenceStatus]);

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

  const forceParticipantVoiceState = useCallback(async (targetUserId, state = {}) => {
    const currentUserId = currentUserRef.current?.id;
    if (!currentUserId || !PLATFORM_CREATOR_IDS.has(currentUserId)) return;
    if (!targetUserId || !realtimeChannel.current || realtimeChannel.current.state !== 'joined') return;

    await realtimeChannel.current.send({
      type: 'broadcast',
      event: 'admin-voice-state',
      payload: {
        from: currentUserId,
        to: targetUserId,
        state: {
          ...(typeof state.isMuted === 'boolean' ? { isMuted: state.isMuted } : {}),
          ...(typeof state.isDeafened === 'boolean' ? { isDeafened: state.isDeafened } : {}),
        },
      },
    });
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      console.log('[WebRTC] Stopping screen share safely...');
      const tracks = screenStreamRef.current.getTracks();
      
      // Keep the SDP sender order stable while removing the screen video track.

      await detachScreenShareFromPeers(peerConns.current);

      tracks.forEach(t => t.stop());
      screenStreamRef.current = null; setIsScreenSharing(false);
      setTimeout(() => updatePresenceStatus({ isScreenSharing: false }, true), 150);
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
      await applyScreenShareTrackProfile(videoTrack, profile);
      if (videoTrack && profile.contentHint) {
        // Prefer screen clarity for text/code over smoother motion.
        videoTrack.contentHint = profile.contentHint;
      }

      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      setVoiceError(null);

      // Attach the screen stream to already connected peers.
      await attachScreenShareToPeers(peerConns.current, stream, profile);

      await updatePresenceStatus({ isScreenSharing: true }, true);
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

  const getParticipantSnapshot = useCallback((userId, channelId = null) => {
    if (!userId) return null;

    const preferredChannelId = channelId || activeChannelIdRef.current;
    const liveParticipant = Object.values(allParticipants)
      .flat()
      .find((participant) => participant.userId === userId && (!preferredChannelId || participant.channelId === preferredChannelId));

    if (liveParticipant) {
      return liveParticipant;
    }

    const snapshotCandidates = Array.from(participantSnapshotsRef.current.values())
      .filter((participant) => participant.userId === userId && (!preferredChannelId || participant.channelId === preferredChannelId))
      .sort((left, right) => (right.last_seen || 0) - (left.last_seen || 0));

    return snapshotCandidates[0] || null;
  }, [allParticipants]);

  return {
    activeChannelId, connectingChannelId, participants, allParticipants, ping, voiceError, serverStatus,
    isMuted, isDeafened, isConnecting, isSpeaking, isScreenSharing, remoteScreens,
    joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen, setParticipantVolume,
    forceParticipantVoiceState,
    getParticipantSnapshot,
    startScreenShare, stopScreenShare, requestScreenView: (id) => {
      pendingStreamRequestsRef.current.add(id);
      if (realtimeChannel.current?.state === 'joined' && currentUserRef.current?.id) {
        realtimeChannel.current.send({ type: 'broadcast', event: 'request-stream', payload: { from: currentUserRef.current.id, to: id } });
      }
    },
    clearVoiceError: () => setVoiceError(null)
  };
}







