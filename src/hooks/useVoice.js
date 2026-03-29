import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук голосового чата.
 *
 * Сигналинг идёт через Supabase Realtime Broadcast — без отдельного сервера.
 * Аудио идёт напрямую P2P через нативный WebRTC.
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

  const audioContextRef  = useRef(null);
  const analyserRef      = useRef(null);
  const gateNodeRef      = useRef(null);
  const vadIntervalRef   = useRef(null);
  const lastSpeakTimeRef = useRef(0);

  // Инициализируем глобальный канал присутствия для боковой панели
  useEffect(() => {
    const channel = supabase.channel('global_voice_presence');
    
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const latestUserPresence = new Map();

      Object.values(state).flat().forEach(p => {
        if (!p.channelId || !p.userId || !p.username) return;
        const existing = latestUserPresence.get(p.userId);
        if (!existing || (p.joined_at && existing.joined_at && p.joined_at > existing.joined_at)) {
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
    const tracks = localStream.current?.getTracks() || [];
    console.log(`[WebRTC] Adding ${tracks.length} local tracks to PC for ${remoteUserId}`);
    tracks.forEach((track) => {
      pc.addTrack(track, localStream.current);
    });

    // Обработка renegotiation
    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        console.log(`[WebRTC] Creating offer for ${remoteUserId}`);
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
        console.error(`[WebRTC] onnegotiationneeded error for ${remoteUserId}:`, err);
      }
    };

    // Получаем аудио/видео от собеседника
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const track = event.track;
      console.log(`[WebRTC] Received track from ${remoteUserId}:`, { kind: track.kind, streamId: stream.id });
      
      if (track.kind === 'video') {
        setRemoteScreens(prev => ({ ...prev, [remoteUserId]: stream }));
      } else if (track.kind === 'audio') {
        if (!audioElements.current[remoteUserId]) {
          console.log(`[WebRTC] Creating new Audio element for ${remoteUserId}`);
          const audio = new Audio();
          audio.autoplay = true;
          audio.muted = isDeafenedRef.current;
          
          const outputDeviceId = localStorage.getItem('outputDeviceId');
          if (outputDeviceId && typeof audio.setSinkId === 'function') {
            audio.setSinkId(outputDeviceId).catch(err => console.warn('[WebRTC] sinkId error', err));
          }
          audioElements.current[remoteUserId] = audio;
        }
        
        const audioElement = audioElements.current[remoteUserId];
        if (audioElement.srcObject?.id !== stream.id) {
          audioElement.srcObject = stream;
        }

        audioElement.play().catch(err => {
          console.error(`[WebRTC] Playback failed for ${remoteUserId}. Autoplay policy?`, err);
          const playOnAction = () => {
            audioElement.play().catch(() => {});
            document.removeEventListener('click', playOnAction);
          };
          document.addEventListener('click', playOnAction);
        });
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && realtimeChannel.current) {
        realtimeChannel.current.send({
          type: 'broadcast',
          event: 'ice',
          payload: { from: currentUserRef.current.id, to: remoteUserId, candidate },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state for ${remoteUserId}: ${pc.iceConnectionState}`);
      if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) {
        closePeer(remoteUserId);
      }
    };

    peerConns.current[remoteUserId] = pc;
    return pc;
  }, []);

  const closePeer = useCallback((userId) => {
    peerConns.current[userId]?.close();
    delete peerConns.current[userId];
    if (audioElements.current[userId]) {
      audioElements.current[userId].srcObject = null;
      delete audioElements.current[userId];
    }
  }, []);

  const cleanupAll = useCallback(async () => {
    Object.keys(peerConns.current).forEach(closePeer);
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;

    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsSpeaking(false);
    lastSpeakTimeRef.current = 0;
    if (realtimeChannel.current) {
      try { await realtimeChannel.current.untrack(); } catch {}
      await supabase.removeChannel(realtimeChannel.current);
      realtimeChannel.current = null;
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

  const joinVoiceChannel = useCallback(async (channelId, user, username, color) => {
    if (activeChannelId) await leaveVoiceChannel();
    setIsConnecting(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
        video: false 
      });
    } catch (err) {
      console.error('Mic capture error:', err);
      alert('Не удалось получить доступ к микрофону.');
      setIsConnecting(false);
      return;
    }
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const gateNode = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();

      analyser.fftSize = 256;
      gateNode.gain.value = 0; 

      source.connect(gateNode).connect(destination);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const SPEAK_THRESHOLD = 15; 
      const SPEAK_HOLD_TIME = 500; 

      const checkVolume = () => {
        if (isMutedRef.current || isDeafenedRef.current) {
          if (gateNode.gain.value > 0) gateNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let maxFreq = 0;
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > maxFreq) maxFreq = dataArray[i];
        }

        const now = Date.now();
        const currentlySpeaking = maxFreq > SPEAK_THRESHOLD;

        if (currentlySpeaking) {
          lastSpeakTimeRef.current = now;
          if (gateNode.gain.value < 0.9) {
            gateNode.gain.setTargetAtTime(1.0, audioContext.currentTime, 0.02);
            setIsSpeaking(true);
            presencePayload.current.isSpeaking = true;
            if (realtimeChannel.current) realtimeChannel.current.track(presencePayload.current).catch(() => {});
          }
        } else if (now - lastSpeakTimeRef.current > SPEAK_HOLD_TIME) {
          if (gateNode.gain.value > 0.1) {
            gateNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.1);
            setIsSpeaking(false);
            presencePayload.current.isSpeaking = false;
            if (realtimeChannel.current) realtimeChannel.current.track(presencePayload.current).catch(() => {});
          }
        }
      };

      vadIntervalRef.current = setInterval(checkVolume, 50);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      gateNodeRef.current = gateNode;

      console.log('VAD: Initialized Digital Gate', { threshold: SPEAK_THRESHOLD });
      localStream.current = destination.stream;
    } catch (vadErr) {
      console.error('VAD Error:', vadErr);
      localStream.current = stream; 
    }

    currentUserRef.current = { id: user.id, username };
    presencePayload.current = { userId: user.id, username, color, isScreenSharing: false, isSpeaking: false };

    const channel = supabase.channel(`voice:${channelId}`, {
      config: {
        presence: { key: user.id },
        broadcast: { self: false, ack: false },
      },
    });

    channel.on('presence', { event: 'sync' }, () => syncParticipants(channel));
    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
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
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
      }
    });

    channel.on('broadcast', { event: 'request-stream' }, async ({ payload }) => {
      if (payload.to !== user.id || !screenStreamRef.current) return;
      const pc = peerConns.current[payload.from];
      if (pc) {
        screenStreamRef.current.getTracks().forEach(track => {
          const senders = pc.getSenders();
          if (!senders.some(s => s.track === track)) pc.addTrack(track, screenStreamRef.current);
        });
      }
    });

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

  const leaveVoiceChannel = useCallback(async () => {
    await cleanupAll();
  }, [cleanupAll]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      localStream.current?.getAudioTracks().forEach((track) => track.enabled = !next);
      if (next) {
        setIsSpeaking(false);
        presencePayload.current.isSpeaking = false;
        if (realtimeChannel.current) realtimeChannel.current.track(presencePayload.current).catch(() => {});
      }
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      isDeafenedRef.current = next;
      Object.values(audioElements.current).forEach((audio) => { if (audio) audio.muted = next; });
      return next;
    });
  }, []);

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
        stream = await navigator.mediaDevices.getUserMedia({
          audio: withAudio ? { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } : false,
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, minWidth: res.width, maxWidth: res.width, minHeight: res.height, maxHeight: res.height } }
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: res.width }, height: { ideal: res.height }, frameRate: { ideal: 30 } },
          audio: true, 
        });
      }
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      if (realtimeChannel.current) {
        presencePayload.current.isScreenSharing = true;
        realtimeChannel.current.track(presencePayload.current).catch(() => {});
      }
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {
      console.error('Screen sharing error', err);
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      Object.values(peerConns.current).forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track && screenStreamRef.current.getTracks().includes(sender.track)) pc.removeTrack(sender);
        });
      });
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    if (realtimeChannel.current) {
      presencePayload.current.isScreenSharing = false;
      realtimeChannel.current.track(presencePayload.current).catch(() => {});
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

  const setParticipantVolume = useCallback((userId, volumePct) => {
    const audio = audioElements.current[userId];
    if (audio) audio.volume = Math.max(0, Math.min(2, volumePct / 100));
    localStorage.setItem(`vol_${userId}`, String(volumePct));
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
