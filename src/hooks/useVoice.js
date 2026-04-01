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

  // Глобальный канал
  useEffect(() => {
    let channel;
    let cancelled = false;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      channel = supabase.channel('global_voice_presence', {
        config: { presence: { key: user.id } }
      });
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const latestUserPresence = new Map();
        const myId = currentUserRef.current?.id;

        Object.values(state).flat().forEach(p => {
          if (!p.channelId || !p.userId || !p.username) return;
          
          // ЗАЩИТА ОТ ПРИЗРАКОВ: Если это МЫ, то верим только нашему Ref-у
          if (myId && p.userId === myId) {
            if (p.channelId !== activeChannelIdRef.current) return;
          }

          const existing = latestUserPresence.get(p.userId);
          if (!existing || (p.joined_at && existing.joined_at && p.joined_at > existing.joined_at)) {
            latestUserPresence.set(p.userId, p);
          }
        });
        const finalAll = {};
        latestUserPresence.forEach(p => {
          if (!finalAll[p.channelId]) finalAll[p.channelId] = [];
          finalAll[p.channelId].push({
            userId: p.userId, username: p.username, color: p.color,
            isScreenSharing: p.isScreenSharing, isSpeaking: !!p.isSpeaking,
            isMuted: !!p.isMuted, isDeafened: !!p.isDeafened
          });
        });
        setAllParticipants(finalAll);
      });
      channel.subscribe();
      globalPresence.current = channel;
    });

    return () => {
      cancelled = true;
      if (channel) {
        channel.untrack().catch(() => {});
        supabase.removeChannel(channel).catch(() => {});
      }
      globalPresence.current = null;
    };
  }, []);

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
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current));
    }

    pc.onnegotiationneeded = async () => {
      try {
        if (makingOfferRef.current[remoteUserId]) return;
        makingOfferRef.current[remoteUserId] = true;
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        const payload = { 
          type: 'broadcast', event: 'offer', 
          payload: { from: currentUserRef.current.id, to: remoteUserId, sdp: pc.localDescription } 
        };
        const chan = realtimeChannel.current || signalingChannel;
        if (chan) chan.send(payload);
      } catch (err) {
        console.warn(`[WebRTC] Negotiation error with ${remoteUserId}:`, err);
      } finally {
        makingOfferRef.current[remoteUserId] = false;
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const track = event.track;
      if (track.kind === 'video') {
        setRemoteScreens(prev => ({ ...prev, [remoteUserId]: stream }));
      } else if (track.kind === 'audio') {
        if (!audioElements.current[remoteUserId]) {
          const audio = new Audio();
          audio.autoplay = true; audio.muted = true; audio.volume = 0;
          document.body.appendChild(audio); audioElements.current[remoteUserId] = audio;
        }
        if (!gainNodesRef.current[remoteUserId] && audioContextRef.current) {
          try {
            const source = audioContextRef.current.createMediaStreamSource(stream);
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
      if (candidate) {
        const payload = { type: 'broadcast', event: 'ice', payload: { from: currentUserRef.current.id, to: remoteUserId, candidate } };
        (realtimeChannel.current || signalingChannel).send(payload);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed') {
        closePeer(remoteUserId, true);
      } else if (state === 'disconnected') {
        setVoiceError(`[Network] Попытка восстановления связи с ${remoteUserId}...`);
        pc.restartIce().catch(() => {});
        
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
    isLeavingRef.current = true; // СТАВИМ МЕТКУ: ВЫХОДИМ САМИ
    // 1. Сначала чистим ошибки, чтобы не триггерить UI на закрытие канала
    setVoiceError(null);
    
    Object.values(ghostPeersRef.current).forEach(clearTimeout); ghostPeersRef.current = {};
    Object.keys(peerConns.current).forEach(id => closePeer(id, true));
    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
    originalMicStreamRef.current?.getTracks().forEach(t => t.stop()); originalMicStreamRef.current = null;
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    
    if (realtimeChannel.current) {
      const chan = realtimeChannel.current;
      realtimeChannel.current = null; // Зануляем ДО удаления, чтобы коллбэк subscribe проигнорировал CLOSED
      await supabase.removeChannel(chan).catch(() => {});
    }

    if (globalPresence.current) {
      // Явный сигнал "Я вышел" для всех остальных (чтобы не было призраков)
      await globalPresence.current.track({
        ...presencePayload.current,
        channelId: null,
        joined_at: Date.now()
      }).catch(() => {});
      
      await globalPresence.current.untrack().catch(() => {});
    }
    
    if (fakeVADIntervalRef.current) clearInterval(fakeVADIntervalRef.current);
    setIsScreenSharing(false); setRemoteScreens({}); 
    setActiveChannelId(null); 
    activeChannelIdRef.current = null;
    setParticipants([]);

    // Непосредственно очищаем себя из локального списка всех участников (для мгновенного UI-отклика)
    setAllParticipants(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(chId => {
        next[chId] = next[chId].filter(p => p.userId !== currentUserRef.current?.id);
        if (next[chId].length === 0) delete next[chId];
      });
      return next;
    });
  }, [closePeer]);

  const updatePresenceStatus = useCallback(async (updates) => {
    presencePayload.current = { ...presencePayload.current, ...updates };
    if (realtimeChannel.current) await realtimeChannel.current.track(presencePayload.current).catch(() => {});
    if (globalPresence.current && activeChannelId) {
      await globalPresence.current.track({ ...presencePayload.current, channelId: activeChannelId, joined_at: Date.now() }).catch(() => {});
    }
  }, [activeChannelId]);

  const syncParticipants = useCallback((channel) => {
    const state = channel.presenceState();
    const seen = new Map();
    Object.values(state).flat().forEach(p => {
      seen.set(p.userId, { 
        userId: p.userId, username: p.username, color: p.color, 
        isScreenSharing: p.isScreenSharing, isSpeaking: p.isSpeaking, 
        isMuted: p.isMuted, isDeafened: p.isDeafened 
      });
      if (p.userId !== currentUserRef.current?.id && !peerConns.current[p.userId] && !ghostPeersRef.current[p.userId]) {
        createPeerConnection(p.userId, channel);
      }
    });
    Object.keys(peerConns.current).forEach(uid => {
      if (!seen.has(uid) && !ghostPeersRef.current[uid]) {
        ghostPeersRef.current[uid] = setTimeout(() => { closePeer(uid, true); delete ghostPeersRef.current[uid]; }, 60000);
      } else if (seen.has(uid) && ghostPeersRef.current[uid]) {
        clearTimeout(ghostPeersRef.current[uid]); delete ghostPeersRef.current[uid];
      }
    });
    setParticipants(Array.from(seen.values()));
  }, [createPeerConnection, closePeer]);

  const joinVoiceChannel = useCallback(async (channelId, user, username, color) => {
    if (activeChannelId) await cleanupAll();
    isLeavingRef.current = false; // СБРАСЫВАЕМ МЕТКУ: МЫ СНОВА В ИГРЕ
    setIsConnecting(true); setVoiceError(null);
    try {
      const constraints = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      originalMicStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => t.enabled = !(isMutedRef.current || isDeafenedRef.current));

      // ── Интеллектуальное шумоподавление (RNNoise AI) ──
      const nsEnabled = localStorage.getItem('vibe_noise_suppression') === 'true';
      let finalStream = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      if (nsEnabled) {
        try {
          console.log('[useVoice] Активация AI шумоподавления...');
          // Проверяем наличие файлов перед загрузкой
          await audioCtx.audioWorklet.addModule('/audio/rnnoise_processor.js');
          
          const source = audioCtx.createMediaStreamSource(stream);
          const rnnoiseNode = new AudioWorkletNode(audioCtx, 'rnnoise-processor');
          
          // Передаем путь к wasm файлу через порт сообщения (или как опцию, если процессор поддерживает)
          rnnoiseNode.port.postMessage({ type: 'init', wasmPath: '/audio/rnnoise.wasm' });
          
          const destination = audioCtx.createMediaStreamDestination();
          source.connect(rnnoiseNode).connect(destination);
          
          finalStream = destination.stream;
          console.log('[useVoice] AI шумоподавление успешно запущено! 🛡️🎙️');
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

      const analyserData = new Float32Array(analyser.fftSize);
      let lastPresenceUpdate = 0;
      fakeVADIntervalRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(analyserData);
        let sum = 0; for (let i = 0; i < analyserData.length; i++) sum += analyserData[i] * analyserData[i];
        const rms = Math.sqrt(sum / analyserData.length);
        const speaking = rms > 0.015 && !isMutedRef.current;
        if (speaking !== isSpeakingRef.current) {
          isSpeakingRef.current = speaking; setIsSpeaking(speaking);
          const now = Date.now();
          if (now - lastPresenceUpdate > 2000) {
            lastPresenceUpdate = now; updatePresenceStatus({ isSpeaking: speaking });
          }
        }
      }, 150);

      currentUserRef.current = { id: user.id, username };
      presencePayload.current = { userId: user.id, username, color, isScreenSharing: false, isSpeaking: false, isMuted: isMutedRef.current, isDeafened: isDeafenedRef.current };

      const channel = supabase.channel(`voice:${channelId}`, { config: { presence: { key: user.id } } });
      channel.on('presence', { event: 'sync' }, () => syncParticipants(channel));
      channel.on('presence', { event: 'join' }, () => syncParticipants(channel));
      
      channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        const pc = createPeerConnection(payload.from, channel);
        try {
          const polite = user.id < payload.from;
          const collision = pc.signalingState !== 'stable' || makingOfferRef.current[payload.from];
          ignoreOfferRef.current[payload.from] = !polite && collision;
          if (ignoreOfferRef.current[payload.from]) return;
          if (collision) {
            console.log(`[WebRTC] Rollback offer from ${payload.from}`);
            await pc.setLocalDescription({ type: 'rollback' });
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          channel.send({ 
            type: 'broadcast', event: 'answer', 
            payload: { from: user.id, to: payload.from, sdp: pc.localDescription } 
          });
        } catch (err) {
          console.error('[WebRTC] Error handling offer:', err);
          if (err.message.includes('m-lines') || err.message.includes('order')) {
            closePeer(payload.from, true);
          }
        }
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to === user.id && peerConns.current[payload.from] && !ignoreOfferRef.current[payload.from]) {
          try { await peerConns.current[payload.from].setRemoteDescription(new RTCSessionDescription(payload.sdp)); } catch (err) {
            setVoiceError(`[Signaling] ${err.message}`);
            if (err.message.includes('m-lines') || err.message.includes('SDP')) {
              console.warn('[WebRTC] SDP Mismatch detected, forcing recreate...');
              closePeer(payload.from, true);
            }
          }
        }
      });

      channel.on('broadcast', { event: 'ice' }, ({ payload }) => {
        if (payload.to === user.id && peerConns.current[payload.from]) {
          peerConns.current[payload.from].addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(()=>{});
        }
      });

      channel.on('broadcast', { event: 'request-stream' }, ({ payload }) => {
        if (payload.to === user.id && screenStreamRef.current && peerConns.current[payload.from]) {
          screenStreamRef.current.getTracks().forEach(t => peerConns.current[payload.from].addTrack(t, screenStreamRef.current));
        }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setServerStatus('online');
          await channel.track(presencePayload.current).catch(() => {});
          notifications.play('self_join');
          if (globalPresence.current) {
            globalPresence.current.track({ ...presencePayload.current, channelId, joined_at: Date.now() }).catch(() => {});
          }
          setActiveChannelId(channelId); 
          activeChannelIdRef.current = channelId;
          setIsConnecting(false);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          // ЕСЛИ МЫ ВЫХОДИМ САМИ - НИКАКИХ ОШИБОК
          if (isLeavingRef.current) return;
          
          setServerStatus('offline');
          setVoiceError('[Server] Потеряно соединение с сервером (Realtime Offline)');
          setIsConnecting(false);
        }
      });
      realtimeChannel.current = channel;
    } catch (err) { setVoiceError(err.message); setIsConnecting(false); }
  }, [activeChannelId, cleanupAll, createPeerConnection, syncParticipants, updatePresenceStatus]);

  const leaveVoiceChannel = cleanupAll;

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next; setIsMuted(next);
    if (localStream.current) localStream.current.getAudioTracks().forEach(t => t.enabled = !next);
    updatePresenceStatus({ isMuted: next });
    notifications.play(next ? 'mute' : 'unmute');
  }, [updatePresenceStatus]);

  const toggleDeafen = useCallback(() => {
    const next = !isDeafenedRef.current;
    isDeafenedRef.current = next; setIsDeafened(next);
    Object.values(gainNodesRef.current).forEach(g => { g.gain.value = next ? 0 : 1; });
    updatePresenceStatus({ isDeafened: next });
    notifications.play(next ? 'deafen' : 'undeafen');
  }, [updatePresenceStatus]);

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

  const startScreenShare = useCallback(async (quality = '720p', user = null, sourceId = null) => {
    try {
      console.log('[WebRTC] Starting screen share, sourceId:', sourceId);
      
      let constraints;
      if (sourceId) {
        // МАКСИМАЛЬНО упрощенный формат для Electron (без лишних ограничений)
        constraints = {
          audio: false, 
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          }
        };
      } else {
        // Стандарт для браузера
        constraints = { video: true, audio: false };
      }

      setVoiceError(null); 
      const stream = sourceId 
        ? await navigator.mediaDevices.getUserMedia(constraints)
        : await navigator.mediaDevices.getDisplayMedia(constraints);
      screenStreamRef.current = stream; setIsScreenSharing(true);
      setVoiceError(null); // Сбрасываем старые ошибки
      
      // Добавляем трек всем существующим пирам
      // WebRTC сам триггернет onnegotiationneeded при добавлении трека
      Object.values(peerConns.current).forEach(pc => {
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      });

      updatePresenceStatus({ isScreenSharing: true });
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { 
      console.error('Screen sharing error', err);
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
  }, [activeChannelId]);

  return {
    activeChannelId, participants, allParticipants, ping, voiceError, serverStatus,
    isMuted, isDeafened, isConnecting, isSpeaking, isScreenSharing, remoteScreens,
    joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen,
    startScreenShare, stopScreenShare, requestScreenView: (id) => {
      realtimeChannel.current?.send({ type: 'broadcast', event: 'request-stream', payload: { from: currentUserRef.current.id, to: id } });
    },
    clearVoiceError: () => setVoiceError(null)
  };
}
