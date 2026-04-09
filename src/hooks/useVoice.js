import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifications } from '../lib/notifications';

/**
 * Хук голосового чата (V7 - Ультра-стабильный)
 * Исправляет ошибки signalingState и добавляет мониторинг сети.
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:iphone-stun.strato-iphone.de:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },
  { urls: 'stun:stun.bitmask.net:443' },
];

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

  const getParticipantSessionKey = useCallback((participant) => (
    participant?.sessionId ? `${participant.userId}:${participant.sessionId}` : participant?.userId
  ), []);

  const removeParticipantSession = useCallback((items, payload = {}) => {
    const exactSessionKey = payload.userId && payload.sessionId
      ? `${payload.userId}:${payload.sessionId}`
      : null;

    return items.filter((participant) => {
      const participantKey = getParticipantSessionKey(participant);
      if (exactSessionKey) {
        return participantKey !== exactSessionKey;
      }
      return participant.userId !== payload.userId;
    });
  }, [getParticipantSessionKey]);


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
    
    // Добавляем микрофон
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current));
    }

    // ВАЖНО: Если мы УЖЕ стримим экран — добавляем его новому пиру сразу
    if (screenStreamRef.current) {
      console.log(`[WebRTC] Adding existing screen stream for new peer ${remoteUserId}`);
      screenStreamRef.current.getTracks().forEach(track => pc.addTrack(track, screenStreamRef.current));
    }

    pc.onnegotiationneeded = async () => {
      try {
        if (makingOfferRef.current[remoteUserId]) return;
        makingOfferRef.current[remoteUserId] = true;
        
        const offer = await pc.createOffer();
        // Если за это время стейт изменился (пришел чужой оффер), игнорируем свой оффер
        if (pc.signalingState !== 'stable') return;

        await pc.setLocalDescription(offer);
        
        const myId = currentUserRef.current?.id;
        if (!myId) return;

        const payload = { 
          type: 'broadcast', event: 'offer', 
          payload: { from: myId, to: remoteUserId, sdp: pc.localDescription } 
        };
        const chan = realtimeChannel.current || signalingChannel;
        if (chan && chan.state === 'joined') chan.send(payload);
      } catch (err) {
        console.warn(`[WebRTC] Negotiation error with ${remoteUserId}:`, err);
      } finally {
        makingOfferRef.current[remoteUserId] = false;
      }
    };

    pc.ontrack = (event) => {
      const track = event.track;
      console.log(`[WebRTC] Incoming track from ${remoteUserId}:`, track.kind);

      if (track.kind === 'video') {
        const stream = event.streams[0] || new MediaStream([track]);
        setRemoteScreens(prev => ({ ...prev, [remoteUserId]: stream }));
        
        // Автоматически чистим, если трек завершился
        track.onended = () => {
          setRemoteScreens(prev => {
            const next = { ...prev };
            delete next[remoteUserId];
            return next;
          });
        };
      } else if (track.kind === 'audio') {
        const stream = event.streams[0] || new MediaStream([track]);
        if (!audioElements.current[remoteUserId]) {
          const audio = new Audio();
          audio.autoplay = true; audio.muted = true; audio.volume = 0;
          document.body.appendChild(audio); audioElements.current[remoteUserId] = audio;
        }
        if (!gainNodesRef.current[remoteUserId] && audioContextRef.current) {
          try {
            const source = audioContextRef.current.createMediaStreamSource(stream);
            
            // ── Создаем Analyser для ЛОКАЛЬНОГО детектирования голоса ──
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            remoteAnalysersRef.current[remoteUserId] = { analyser, data: new Float32Array(analyser.fftSize) };

            const gain = audioContextRef.current.createGain();
            const savedVol = localStorage.getItem(`vol_${remoteUserId}`);
            gain.gain.value = isDeafenedRef.current ? 0 : (savedVol !== null ? Number(savedVol)/100 : 1.0);
            source.connect(gain); gain.connect(audioContextRef.current.destination);
            gainNodesRef.current[remoteUserId] = gain;
          } catch {}
        }
        audioElements.current[remoteUserId].srcObject = stream;
        audioElements.current[remoteUserId].play().catch(() => {});
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && currentUserRef.current?.id) {
        const payload = { type: 'broadcast', event: 'ice', payload: { from: currentUserRef.current.id, to: remoteUserId, candidate } };
        const chan = realtimeChannel.current || signalingChannel;
        if (chan && chan.state === 'joined') chan.send(payload);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed') {
        closePeer(remoteUserId, true);
      } else if (state === 'disconnected') {
        // ИГНОРИРУЕМ ОШИБКИ, ЕСЛИ МЫ ВЫХОДИМ (БОРЬБА С ЛОЖНЫМИ АЛЕРТАМИ)
        if (isLeavingRef.current) return;

        console.log(`[WebRTC] Connection disconnected with ${remoteUserId}, attempting recovery...`);
        try {
          pc.restartIce();
        } catch (e) {
          console.warn('[WebRTC] restartIce error:', e);
        }
        
        iceDisconnectTimers.current[remoteUserId] = setTimeout(() => {
          if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            console.log(`[WebRTC] Watchdog trigger for ${remoteUserId}`);
            closePeer(remoteUserId, true);
            if (realtimeChannel.current) syncParticipants(realtimeChannel.current);
          }
        }, 8000);
      } else if (state === 'connected' || state === 'completed') {
        setVoiceError(null);
        ignoreOfferRef.current[remoteUserId] = false;
        if (iceDisconnectTimers.current[remoteUserId]) {
          clearTimeout(iceDisconnectTimers.current[remoteUserId]);
          delete iceDisconnectTimers.current[remoteUserId];
        }
      }
    };

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
    setAllParticipants(prev => {
      const next = { ...prev };
      const myId = currentUserRef.current?.id;
      let changed = false;
      Object.keys(next).forEach(chId => {
        const filtered = removeParticipantSession(next[chId], {
          userId: myId,
          sessionId: sessionIdRef.current,
        });
        if (filtered.length !== next[chId].length) {
          next[chId] = filtered;
          if (next[chId].length === 0) delete next[chId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setActiveChannelId(null); 
    activeChannelIdRef.current = null;
    setIsScreenSharing(false); 
    setRemoteScreens({}); 
    setVoiceError(null); 

    if (reconnectTimerRef.current) { 
      console.log('[useVoice] Clearing background reconnect timer');
      clearTimeout(reconnectTimerRef.current); 
      reconnectTimerRef.current = null; 
    }
    
    if (fakeVADIntervalRef.current) {
      clearInterval(fakeVADIntervalRef.current);
      fakeVADIntervalRef.current = null;
    }

    Object.values(ghostPeersRef.current).forEach(clearTimeout); 
    ghostPeersRef.current = {};
    
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
    
    setAllParticipants(prev => {
      const next = { ...prev };
      const myId = currentUserRef.current?.id;
      Object.keys(next).forEach(chId => {
        next[chId] = removeParticipantSession(next[chId], {
          userId: myId,
          sessionId: sessionIdRef.current,
        });
        if (next[chId].length === 0) delete next[chId];
      });
      return next;
    });
  }, [closePeer, removeParticipantSession]);

  // Глобальный канал (инициализация после всех функций)
  useEffect(() => {
    let cancelled = false;
    const initGlobalChannel = async () => {
      if (globalPresence.current) {
        supabase.removeChannel(globalPresence.current).catch(() => {});
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const channel = supabase.channel('global_voice_presence', {
        config: { presence: { key: user.id } }
      });

      channel.on('broadcast', { event: 'speaking-update' }, ({ payload }) => {
        setAllParticipants(prev => {
          const next = { ...prev };
          let changed = false;
          Object.keys(next).forEach(chId => {
            next[chId] = next[chId].map(p => {
              if (p.userId === payload.userId && p.isSpeaking !== payload.isSpeaking) {
                changed = true;
                return { ...p, isSpeaking: payload.isSpeaking };
              }
              return p;
            });
          });
          return changed ? next : prev;
        });
      });

      // HEARTBEAT REAPER: Удаляем принудительно, если last_seen устарел
      const startHeartbeat = () => {
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(async () => {
          if (isLeavingRef.current) return;
          // Обновляем свое состояние
          updatePresenceStatus({ 
            last_seen: Date.now(),
            channelId: activeChannelIdRef.current // ГАРАНТИРУЕМ наличие ID канала
          });

          // И ТУТ ЖЕ проверяем чужие состояния (Ghost Reaper)
          const now = Date.now();
          setAllParticipants(prev => {
            const next = { ...prev };
            let removedCount = 0;
            Object.keys(next).forEach(chId => {
              const before = next[chId].length;
              // Удаляем сессии, которые не подавали признаков жизни более 60 сек
              next[chId] = next[chId].filter(p => {
                const isAlive = !p.last_seen || (now - p.last_seen < 60000);
                if (!isAlive) {
                  console.warn(`[HolyReaper] Session ${p.sessionId} of ${p.username} timed out after 60s`);
                }
                return isAlive;
              });
              removedCount += (before - next[chId].length);
              if (next[chId].length === 0) delete next[chId];
            });
            return removedCount > 0 ? next : prev;
          });
        }, 10000); // 10 секунд — золотой стандарт liveness
      };

      const updateAllParticipants = () => {
        if (channel.state !== 'joined' || isLeavingRef.current) return;
        
        const state = channel.presenceState();
        const latestUserSessions = new Map(); // sessionId -> presence
        const myId = currentUserRef.current?.id;
        const now = Date.now();

        Object.values(state).flat().forEach(p => {
          if (!p.userId || !p.username) return;
          if (isLeavingRef.current && p.userId === myId) return;

          // Игнорируем мертвые сессии сразу при расчете (60 сек)
          if (p.last_seen && (now - p.last_seen > 60000)) return;

          const sId = p.sessionId || p.userId; // fallback если нет sessionId
          const existing = latestUserSessions.get(sId);
          
          // Дедупликация сессий
          if (!existing || (p.joined_at > (existing.joined_at || 0))) {
            latestUserSessions.set(sId, p);
          }
        });

        const finalAll = {};
        latestUserSessions.forEach(p => {
          if (!p.channelId) return;
          
          if (!finalAll[p.channelId]) finalAll[p.channelId] = [];
          finalAll[p.channelId].push({
            userId: p.userId, 
            username: p.username, 
            color: p.color,
            isScreenSharing: p.isScreenSharing, 
            isSpeaking: !!p.isSpeaking,
            isMuted: !!p.isMuted, 
            isDeafened: !!p.isDeafened,
            joined_at: p.joined_at,
            last_seen: p.last_seen,
            sessionId: p.sessionId
          });
        });

        // Сортируем участников внутри каналов по времени входа для стабильности UI
        Object.keys(finalAll).forEach(chId => {
          finalAll[chId].sort((a, b) => a.joined_at - b.joined_at);
        });

        setAllParticipants(finalAll);
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
        setAllParticipants(prev => {
          const next = { ...prev };
          let changed = false;
          Object.keys(next).forEach(chId => {
            const before = next[chId].length;
            next[chId] = leavingSessions.reduce(
              (items, leavingPresence) => removeParticipantSession(items, leavingPresence),
              next[chId]
            );
            if (next[chId].length !== before) {
              changed = true;
              if (next[chId].length === 0) delete next[chId];
            }
          });
          return changed ? next : prev;
        });
        updateAllParticipants();
      });

      channel.on('broadcast', { event: 'user-left' }, ({ payload }) => {
        setAllParticipants(prev => {
          const next = { ...prev };
          let changed = false;
          Object.keys(next).forEach(chId => {
            const filtered = removeParticipantSession(next[chId], payload);
            if (filtered.length !== next[chId].length) {
              next[chId] = filtered;
              if (next[chId].length === 0) delete next[chId];
              changed = true;
            }
          });
          return changed ? next : prev;
        });
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
          if (!cancelled && !isLeavingRef.current) {
            console.log('[useVoice] Global channel actually lost, recovering in 4s...');
            setTimeout(() => { 
              if (!cancelled && !isLeavingRef.current && globalPresence.current === channel) {
                initGlobalChannel(); 
              }
            }, 4000);
          }
        }
      });
      globalPresence.current = channel;
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
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      globalPresence.current = null;
    };
  }, [cleanupAll, removeParticipantSession]);

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
    
    if (presenceDebounceRef.current) {
      clearTimeout(presenceDebounceRef.current);
      presenceDebounceRef.current = null;
    }

    const sendUpdate = async () => {
      const payload = { ...presencePayload.current };
      
      // БЛОКИРОВКА: Не шлем, если мы в процессе смены канала или вылета
      if (isLeavingRef.current || isSwitchingRef.current) return;

      if (realtimeChannel.current && realtimeChannel.current.state === 'joined') {
        await realtimeChannel.current.track(payload).catch(() => {});
      }
      
      const chId = payload.channelId;
      if (globalPresence.current && globalPresence.current.state === 'joined' && chId) {
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
        }, 5000); 
      } else if (seenUids.has(uid) && ghostPeersRef.current[uid]) {
        clearTimeout(ghostPeersRef.current[uid]); 
        delete ghostPeersRef.current[uid];
      }
    });
  }, [createPeerConnection, closePeer]);

  const joinVoiceChannel = useCallback(async (channelId, user, username, color, isSilent = false) => {
    if (!channelId || !user) return;
    
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
    if (activeChannelIdRef.current && activeChannelIdRef.current !== channelId) {
      console.log('[useVoice] Changing channel, full cleanup...');
      await cleanupAll();
    }
    
    // МЯГКИЙ РЕКОННЕКТ: Если это тихий перезапуск того же канала — не убиваем поток и пиры
    const isActuallyReconnecting = isSilent && activeChannelIdRef.current === channelId && localStream.current;
    
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
            setAllParticipants(all => {
              const next = { ...all };
              let changed = false;
              Object.keys(next).forEach(chId => {
                next[chId] = (next[chId] || []).map(item => {
                  if (item.userId === uid && item.isSpeaking !== rSpeaking) {
                    changed = true;
                    return { ...item, isSpeaking: rSpeaking };
                  }
                  return item;
                });
              });
              return changed ? next : all;
            });
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

      const channel = supabase.channel(`voice:${channelId}`, { config: { presence: { key: user.id } } });
    channel.on('presence', { event: 'sync' }, () => syncParticipants(channel));
    channel.on('presence', { event: 'join' }, () => syncParticipants(channel));
    
    // ЛОКАЛЬНЫЙ КАНАЛ больше не трогает стейты участников, чтобы не было конфликтов с глобальным.
    // Единственное исключение — индикация голоса, но мы ее тоже синхронизируем через все стейты
    channel.on('broadcast', { event: 'speaking-update' }, ({ payload }) => {
      setAllParticipants(all => {
        const next = { ...all };
        Object.keys(next).forEach(chId => {
          next[chId] = next[chId].map(p => 
            p.userId === payload.userId ? { ...p, isSpeaking: payload.isSpeaking } : p
          );
        });
        return next;
      });
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
        setParticipants(prev => removeParticipantSession(prev, payload));
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
             return;
          }

          isSwitchingRef.current = false;
          reconnectAttemptsRef.current = 0;
          setServerStatus('online');
          setVoiceError(null);
          
          await updatePresenceStatus({}, true);
          
          // УВЕДОМЛЕНИЕ О ВХОДЕ (ТОЛЬКО ЕСЛИ НЕ ТИХИЙ РЕКОННЕКТ)
          if (!isSilent) notifications.play('self_join');
          
          if (globalPresence.current) {
            setAllParticipants(prev => {
              const next = { ...prev };
              const currentInCh = next[channelId] || [];
              if (!currentInCh.find(p => p.userId === user.id && p.sessionId === sessionIdRef.current)) {
                next[channelId] = [...currentInCh, { ...presencePayload.current, channelId }];
                return next;
              }
              return prev;
            });
          }
          
          setActiveChannelId(channelId); 
          activeChannelIdRef.current = channelId;
          setIsConnecting(false);
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
          } else {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              if (activeChannelIdRef.current && !isLeavingRef.current && realtimeChannel.current === channel) {
                console.log(`[useVoice] Attempting background reconnect...`);
                joinVoiceChannel(activeChannelIdRef.current, currentUserRef.current, currentUserRef.current.username, presencePayload.current.color, true);
              }
            }, 4000);
          }
        }
      });
      realtimeChannel.current = channel;
    } catch (err) { 
      console.error('[useVoice] Fatal join error:', err);
      if (reconnectAttemptsRef.current === 0 || reconnectAttemptsRef.current > 5) {
        setVoiceError(err.message); 
      }
      setIsConnecting(false); 
      // При фатальной ошибке зануляем реконнект, чтобы не спамить
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }
  }, [activeChannelId, cleanupAll, closePeer, createPeerConnection, removeParticipantSession, syncParticipants, updatePresenceStatus]);

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
      
      // Вместо removeTrack используем replaceTrack(null), 
      // чтобы не ломать порядок m-lines в SDP
      Object.values(peerConns.current).forEach(pc => {
        pc.getSenders().forEach(async (s) => { 
          if (s.track?.kind === 'video') {
            try {
              await s.replaceTrack(null);
              // Теперь можно безопасно убрать, т.к. стейт стабилен
              pc.removeTrack(s);
            } catch (e) { console.warn(e); }
          }
        });
      });

      tracks.forEach(t => t.stop());
      screenStreamRef.current = null; setIsScreenSharing(false);
      setTimeout(() => updatePresenceStatus({ isScreenSharing: false }), 300);
    }
  }, [updatePresenceStatus]);
  
  // Профили качества для трансляции
  const qualityProfiles = {
    '1080p': { 
      width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 },
      bitrate: 6000000, contentHint: 'detail' 
    },
    '720p':  { 
      width: { ideal: 1280 }, height: { ideal: 720 },  frameRate: { ideal: 30 },
      bitrate: 2500000, contentHint: 'detail'
    },
    '480p':  { 
      width: { ideal: 854 },  height: { ideal: 480 },  frameRate: { ideal: 30 },
      bitrate: 1000000, contentHint: 'detail'
    }
  };

  const startScreenShare = useCallback(async (quality = '720p', user = null, sourceId = null) => {
    try {
      console.log('[WebRTC] Starting screen share, sourceId:', sourceId);
      
      const profile = qualityProfiles[quality] || qualityProfiles['720p'];

      let constraints;
      if (sourceId) {
        // МАКСИМАЛЬНО упрощенный формат для Electron
        constraints = {
          audio: false, 
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: profile.width.ideal,
              maxWidth: profile.width.ideal,
              minHeight: profile.height.ideal,
              maxHeight: profile.height.ideal,
              maxFrameRate: profile.frameRate.ideal
            }
          }
        };
      } else {
        // Стандарт для браузера
        constraints = { 
          video: {
            ...profile,
            cursor: 'always'
          }, 
          audio: false 
        };
      }

      setVoiceError(null); 
      const stream = sourceId 
        ? await navigator.mediaDevices.getUserMedia(constraints)
        : await navigator.mediaDevices.getDisplayMedia(constraints);
      
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && profile.contentHint) {
        // Подсказка браузеру: приоритет четкости (текста) над плавностью
        videoTrack.contentHint = profile.contentHint;
      }

      screenStreamRef.current = stream; 
      setIsScreenSharing(true);
      setVoiceError(null); 
      
      // Добавляем трек всем существующим пирам
      Object.values(peerConns.current).forEach(async (pc) => {
        const tracks = stream.getTracks();
        for (const t of tracks) {
          const sender = pc.addTrack(t, stream);
          
          // ПРИМЕНЯЕМ ПАРАМЕТРЫ КАЧЕСТВА (БИТРЕЙТ)
          if (t.kind === 'video' && sender && sender.getParameters) {
            try {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              params.encodings[0].maxBitrate = profile.bitrate;
              // Для стрима экрана также полезно разрешить масштабирование вниз при плохой сети
              params.encodings[0].networkPriority = 'high';
              await sender.setParameters(params);
              console.log(`[WebRTC] Bitrate set to ${profile.bitrate} for sender`);
            } catch (e) {
              console.warn('[WebRTC] Failed to set encoding parameters:', e);
            }
          }
        }
      });

      updatePresenceStatus({ isScreenSharing: true });
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { 
      console.error('Screen sharing error', err);
      
      // Игнорируем ошибку, если пользователь просто нажал "Отмена"
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
        return;
      }

      setVoiceError(`Не удалось запустить трансляцию: ${err.message}`);
      setIsScreenSharing(false);
      screenStreamRef.current = null;
      stopScreenShare(); // Финальная очистка
    }
  }, [updatePresenceStatus, stopScreenShare]);

  const [ping, setPing] = useState(null);
  useEffect(() => {
    if (!activeChannelId) return;
    const interval = setInterval(async () => {
      const start = Date.now();
      try { await supabase.from('profiles').select('id').limit(1); setPing(Date.now() - start); } catch { setPing(null); }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
    activeChannelId, participants, allParticipants, ping, voiceError, serverStatus,
    isMuted, isDeafened, isConnecting, isSpeaking, isScreenSharing, remoteScreens,
    joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen, setParticipantVolume,
    startScreenShare, stopScreenShare, requestScreenView: (id) => {
      realtimeChannel.current?.send({ type: 'broadcast', event: 'request-stream', payload: { from: currentUserRef.current.id, to: id } });
    },
    clearVoiceError: () => setVoiceError(null)
  };
}


