import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Хук голосового чата (V5.2 - Финальный: Стабильный звук + Экран + VAD)
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
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

  const isDeafenedRef    = useRef(false);
  const screenStreamRef  = useRef(null);

  const localStream      = useRef(null);
  const globalPresence   = useRef(null);
  const peerConns        = useRef({});   
  const audioElements    = useRef({});   
  const realtimeChannel   = useRef(null);
  const currentUserRef    = useRef(null);
  const isMutedRef        = useRef(false);
  const presencePayload   = useRef({});

  const audioContextRef  = useRef(null);
  const analyserRef      = useRef(null);
  const vadIntervalRef   = useRef(null);
  const lastSpeakTimeRef = useRef(0);
  const isSpeakingRef    = useRef(false); // Ref для доступа внутри setInterval без stale closure

  // Глобальный канал присутствия
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
          userId: p.userId, username: p.username, color: p.color, isScreenSharing: p.isScreenSharing 
        });
      });
      const finalAll = {};
      Object.keys(newAll).forEach(chId => { finalAll[chId] = Array.from(newAll[chId].values()); });
      setAllParticipants(finalAll);
    });
    channel.subscribe();
    globalPresence.current = channel;
    return () => { cleanupAll(); };
  }, []);

  const createPeerConnection = useCallback((remoteUserId) => {
    if (peerConns.current[remoteUserId]) return peerConns.current[remoteUserId];
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    console.log(`[WebRTC] Соединение с ${remoteUserId}`);
    
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current);
      });
    }

    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        realtimeChannel.current?.send({
          type: 'broadcast', event: 'offer',
          payload: { from: currentUserRef.current.id, to: remoteUserId, sdp: offer },
        });
      } catch (err) { console.error(`[WebRTC] Offer error ${remoteUserId}:`, err); }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const track = event.track;
      
      if (track.kind === 'video') {
        setRemoteScreens(prev => ({ ...prev, [remoteUserId]: stream }));
      } else if (track.kind === 'audio') {
        if (!audioElements.current[remoteUserId]) {
          const audio = new Audio();
          audio.autoplay = true;
          audio.muted = isDeafenedRef.current;
          audioElements.current[remoteUserId] = audio;
        }
        const audio = audioElements.current[remoteUserId];
        if (audio.srcObject?.id !== stream.id) audio.srcObject = stream;
        audio.play().catch(() => {
          const unlock = () => { audio.play().catch(()=>{}); document.removeEventListener('click', unlock); };
          document.addEventListener('click', unlock);
        });
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        realtimeChannel.current?.send({
          type: 'broadcast', event: 'ice',
          payload: { from: currentUserRef.current.id, to: remoteUserId, candidate },
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) closePeer(remoteUserId);
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
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    isSpeakingRef.current = false;
    if (audioContextRef.current) { audioContextRef.current.close().catch(()=>{}); audioContextRef.current = null; }
    setIsSpeaking(false);
    if (realtimeChannel.current) { 
      try { await realtimeChannel.current.untrack(); } catch {}
      await supabase.removeChannel(realtimeChannel.current); 
      realtimeChannel.current = null; 
    }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
    setIsScreenSharing(false);
    setRemoteScreens({});
    setActiveChannelId(null);
    setParticipants([]);
    setIsMuted(false);
    setIsDeafened(false);
    isDeafenedRef.current = false;
  }, [closePeer]);

  const syncParticipants = useCallback((channel) => {
    const state = channel.presenceState();
    const seen = new Map();
    Object.values(state).flat().forEach((p) => {
      seen.set(p.userId, { 
        userId: p.userId, username: p.username, color: p.color, 
        isScreenSharing: p.isScreenSharing, isSpeaking: p.isSpeaking 
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
      setIsConnecting(false);
      return;
    }
    
    localStream.current = stream;

    // VAD (Voice Activity Detection)
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const SPEAK_THRESHOLD = 20; 
      const SPEAK_HOLD_TIME = 450; 

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let maxFreq = 0;
        for (let i = 0; i < bufferLength; i++) { if (dataArray[i] > maxFreq) maxFreq = dataArray[i]; }

        const now = Date.now();
        const currentlySpeaking = maxFreq > SPEAK_THRESHOLD;
        const micTrack = stream.getAudioTracks()[0];
        if (!micTrack) return;
        
        if (currentlySpeaking) {
          lastSpeakTimeRef.current = now;
          // Используем ref вместо state — ref всегда актуален внутри setInterval
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            if (!isMutedRef.current) micTrack.enabled = true;
            setIsSpeaking(true);
            presencePayload.current.isSpeaking = true;
            realtimeChannel.current?.track(presencePayload.current).catch(()=>{});
          }
        } else if (now - lastSpeakTimeRef.current > SPEAK_HOLD_TIME) {
          if (isSpeakingRef.current) {
            isSpeakingRef.current = false;
            if (!isMutedRef.current) micTrack.enabled = false;
            setIsSpeaking(false);
            presencePayload.current.isSpeaking = false;
            realtimeChannel.current?.track(presencePayload.current).catch(()=>{});
          }
        }
      };

      stream.getAudioTracks()[0].enabled = false;
      vadIntervalRef.current = setInterval(checkVolume, 50);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    } catch (e) {
      console.error('VAD Error:', e);
      stream.getAudioTracks()[0].enabled = true;
    }

    currentUserRef.current = { id: user.id, username };
    presencePayload.current = { userId: user.id, username, color, isScreenSharing: false, isSpeaking: false };

    const channel = supabase.channel(`voice:${channelId}`, {
      config: { presence: { key: user.id }, broadcast: { self: false, ack: false } },
    });

    channel.on('presence', { event: 'sync' }, () => syncParticipants(channel));
    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      newPresences.forEach((p) => { if (p.userId !== user.id) createPeerConnection(p.userId); });
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
      channel.send({ type: 'broadcast', event: 'answer', payload: { from: user.id, to: payload.from, sdp: answer } });
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = peerConns.current[payload.from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });

    channel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = peerConns.current[payload.from];
      if (pc && payload.candidate) try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
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
          globalPresence.current.track({ channelId, userId: user.id, username, color, joined_at: Date.now() });
        }
        setActiveChannelId(channelId);
        setIsConnecting(false);
      }
    });

    realtimeChannel.current = channel;
  }, [activeChannelId, createPeerConnection, closePeer, syncParticipants]);

  const leaveVoiceChannel = useCallback(async () => { await cleanupAll(); }, [cleanupAll]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (localStream.current) localStream.current.getAudioTracks()[0].enabled = !next;
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

  /** Трансляция экрана */
  const startScreenShare = useCallback(async (quality = '720p', currentUser, sourceId = null, withAudio = false) => {
    try {
      const RESOLUTIONS = { '1080p': { w: 1920, h: 1080 }, '720p': { w: 1280, h: 720 }, '480p': { w: 854, h: 480 } };
      const res = RESOLUTIONS[quality] || RESOLUTIONS['720p'];
      let stream;
      
      if (sourceId && window.electronAPI) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, minWidth: res.w, maxWidth: res.w, minHeight: res.h, maxHeight: res.h } },
          audio: withAudio ? { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } } : false
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: res.w, height: res.h }, audio: true });
      }
      
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      presencePayload.current.isScreenSharing = true;
      realtimeChannel.current?.track(presencePayload.current).catch(()=>{});
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { console.error('Screen sharing error', err); }
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      const tracks = screenStreamRef.current.getTracks(); // Сохраняем до обнуления
      tracks.forEach(t => t.stop());
      Object.values(peerConns.current).forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track && tracks.includes(sender.track)) pc.removeTrack(sender);
        });
      });
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    presencePayload.current.isScreenSharing = false;
    realtimeChannel.current?.track(presencePayload.current).catch(()=>{});
  }, []);

  return {
    activeChannelId, participants, allParticipants, isMuted, isDeafened, isConnecting,
    isSpeaking, isScreenSharing, remoteScreens, joinVoiceChannel, leaveVoiceChannel,
    toggleMute, toggleDeafen, 
    setParticipantVolume: (userId, vol) => {
      if (audioElements.current[userId]) audioElements.current[userId].volume = vol / 100;
      localStorage.setItem(`vol_${userId}`, vol);
    },
    startScreenShare, stopScreenShare, 
    requestScreenView: (targetUserId) => {
      realtimeChannel.current?.send({ type: 'broadcast', event: 'request-stream', payload: { from: currentUserRef.current.id, to: targetUserId } });
    },
  };
}
