import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notifications } from '../lib/notifications';

/**
 * Хук голосового чата (V6 - Простой и надёжный)
 * Микрофон работает всегда. Никакого шумодава — только чистый стабильный звук.
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
  const fakeVADIntervalRef = useRef(null);
  const iceDisconnectTimers = useRef({}); // Таймеры для отложенного закрытия при disconnected
  const autoMutedByDeafenRef = useRef(false);

  // Web Audio API refs для VAD (не для отправки звука!)
  const audioContextRef = useRef(null);
  const originalMicStreamRef = useRef(null);

  // Глобальный канал присутствия (кто в каком канале)
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
            isScreenSharing: p.isScreenSharing,
            isSpeaking: !!p.isSpeaking,
            isMuted: !!p.isMuted,
            isDeafened: !!p.isDeafened
          });
        });
        const finalAll = {};
        Object.keys(newAll).forEach(chId => { finalAll[chId] = Array.from(newAll[chId].values()); });
        setAllParticipants(finalAll);
      });
      channel.subscribe();
      globalPresence.current = channel;
    });

    return () => {
      cancelled = true;
      // Только отписываемся от глобального канала — cleanupAll (голосовой) не трогаем здесь
      if (channel) {
        channel.untrack().catch(() => {});
        supabase.removeChannel(channel).catch(() => {});
      }
      globalPresence.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createPeerConnection = useCallback((remoteUserId) => {
    if (peerConns.current[remoteUserId]) return peerConns.current[remoteUserId];

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    console.log(`[WebRTC] Создаю соединение с ${remoteUserId}`);

    // Добавляем сырой поток микрофона — всегда стабильный
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
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
      } catch (err) { console.error(`[WebRTC] Offer error:`, err); }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const track = event.track;
      console.log(`[WebRTC] Получен трек от ${remoteUserId}: ${track.kind}`);

      if (track.kind === 'video') {
        setRemoteScreens(prev => ({ ...prev, [remoteUserId]: stream }));
      } else if (track.kind === 'audio') {
        if (!audioElements.current[remoteUserId]) {
          const audio = new Audio();
          audio.autoplay = true;
          audio.muted = isDeafenedRef.current;
          const savedVol = localStorage.getItem(`vol_${remoteUserId}`);
          if (savedVol !== null) audio.volume = Math.min(2, Number(savedVol) / 100);
          audio.style.display = 'none';
          document.body.appendChild(audio);
          audioElements.current[remoteUserId] = audio;
        }
        const audio = audioElements.current[remoteUserId];
        if (audio.srcObject?.id !== stream.id) {
          audio.srcObject = stream;
        }

        // ── Ключевое исправление: слушаем WebRTC-события трека ──
        // track.onunmute срабатывает ТОЧНО когда отправитель включает микрофон (t.enabled = true)
        // Это правильный триггер для перезапуска воспроизведения на стороне получателя.
        track.onunmute = () => {
          const a = audioElements.current[remoteUserId];
          if (a && !a.muted) {
            console.log(`[Voice] track.onunmute от ${remoteUserId} — перезапуск`);
            a.play().catch(() => {});
          }
        };
        // track.onmute — трек замолчал (отправитель нажал мут)
        // Ничего не делаем — браузер сам обработает тишину.
        track.onmute = () => {
          console.log(`[Voice] track.onmute от ${remoteUserId}`);
        };

        audio.play().catch(() => {
          const unlock = () => { audio.play().catch(() => {}); document.removeEventListener('click', unlock); };
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
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE (${remoteUserId}): ${state}`);

      if (state === 'failed' || state === 'closed') {
        // Соединение окончательно упало — сразу закрываем
        if (iceDisconnectTimers.current[remoteUserId]) {
          clearTimeout(iceDisconnectTimers.current[remoteUserId]);
          delete iceDisconnectTimers.current[remoteUserId];
        }
        closePeer(remoteUserId);
      } else if (state === 'disconnected') {
        // 'disconnected' — временное состояние, WebRTC сам восстанавливается.
        // Даём 8 секунд на самовосстановление, только потом закрываем.
        if (!iceDisconnectTimers.current[remoteUserId]) {
          iceDisconnectTimers.current[remoteUserId] = setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              console.warn(`[WebRTC] Соединение с ${remoteUserId} не восстановилось — закрываю.`);
              closePeer(remoteUserId);
            }
            delete iceDisconnectTimers.current[remoteUserId];
          }, 8000);
        }
      } else if (state === 'connected' || state === 'completed') {
        // Соединение восстановилось — отменяем таймер закрытия
        if (iceDisconnectTimers.current[remoteUserId]) {
          clearTimeout(iceDisconnectTimers.current[remoteUserId]);
          delete iceDisconnectTimers.current[remoteUserId];
        }
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
      // Удаляем элемент из DOM
      if (audioElements.current[userId].parentNode) {
        audioElements.current[userId].parentNode.removeChild(audioElements.current[userId]);
      }
      delete audioElements.current[userId];
    }
  }, []);

  const cleanupAll = useCallback(async () => {
    Object.keys(peerConns.current).forEach(id => closePeer(id));
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;

    if (originalMicStreamRef.current) {
      originalMicStreamRef.current.getTracks().forEach(t => t.stop());
      originalMicStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (fakeVADIntervalRef.current) { clearInterval(fakeVADIntervalRef.current); fakeVADIntervalRef.current = null; }
    isSpeakingRef.current = false;
    setIsSpeaking(false);

    if (realtimeChannel.current) {
      try { await realtimeChannel.current.untrack(); } catch {}
      await supabase.removeChannel(realtimeChannel.current);
      realtimeChannel.current = null;
    }
    if (globalPresence.current) {
      try { await globalPresence.current.untrack(); } catch {}
    }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }

    setIsScreenSharing(false);
    setRemoteScreens({});
    setActiveChannelId(null);
    setParticipants([]);
    setIsMuted(false);
    setIsDeafened(false);
    isDeafenedRef.current = false;
    isMutedRef.current = false;
    currentUserRef.current = null;
  }, [closePeer]);

  // Хелпер для синхронного обновления статуса в локальном и глобальном канале
  const updatePresenceStatus = useCallback(async (updates) => {
    // 1. Обновляем локальный стейт (реф)
    presencePayload.current = { ...presencePayload.current, ...updates };
    
    // 2. Трекаем в локальный канал голоса
    if (realtimeChannel.current) {
      await realtimeChannel.current.track(presencePayload.current).catch(() => {});
    }
    
    // 3. Трекаем в глобальный канал (для сайдбара)
    if (globalPresence.current && activeChannelId) {
      await globalPresence.current.track({
        ...presencePayload.current,
        channelId: activeChannelId,
        joined_at: Date.now() // для дедупликации если ключи не отработали
      }).catch(() => {});
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
    });
    setParticipants(Array.from(seen.values()));
  }, []);

  const joinVoiceChannel = useCallback(async (channelId, user, username, color) => {
    if (activeChannelId) await leaveVoiceChannel();
    setIsConnecting(true);

    // 1. Получаем поток микрофона (с учетом выбранного девайса, если есть)
    let stream;
    try {
      const selectedMic = localStorage.getItem('micDeviceId');
      const constraints = {
        audio: selectedMic
          ? { deviceId: { exact: selectedMic }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[Voice] Микрофон захвачен. Треки:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    } catch (err) {
      console.error('[Voice] Ошибка микрофона:', err);
      alert('Не удалось получить доступ к микрофону. Выбери другое устройство в настройках и проверь разрешения.');
      setIsConnecting(false);
      return;
    }

    // Сохраняем оригинальный поток для клонирования при размуте
    originalMicStreamRef.current = stream;
    
    // Устанавливаем начальное состояние микрофона согласно стейту
    const shouldBeMuted = isMutedRef.current || isDeafenedRef.current;
    stream.getAudioTracks().forEach(t => { t.enabled = !shouldBeMuted; });
    
    // Используем ОРИГИНАЛЬНЫЙ поток микрофона для WebRTC (не Web Audio destination!)
    localStream.current = stream;
    
    // AudioContext + AnalyserNode ТОЛЬКО для VAD (не в пути отправки!)
    // КРИТИЧНО: используем КЛОН потока! Если подключить AudioContext к тому же потоку,
    // что идёт в WebRTC, Chromium/Electron "перехватывает" обработку аудио,
    // и WebRTC получает тишину вместо голоса.
    const vadStream = stream.clone();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    audioContextRef.current = audioCtx;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const vadSource = audioCtx.createMediaStreamSource(vadStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    vadSource.connect(analyser);



    // VAD: определение голосовой активности
    // ВАЖНО: Supabase имеет rate-limit на presence обновления!
    // Если спамить track() слишком часто, broadcast (offer/answer/ice) отбрасывается.
    const VAD_THRESHOLD = 0.015;
    const analyserData = new Float32Array(analyser.fftSize);
    let lastPresenceUpdate = 0;
    const PRESENCE_THROTTLE = 2000; // Обновляем presence не чаще чем раз в 2 секунды

    fakeVADIntervalRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(analyserData);
      
      let sum = 0;
      for (let i = 0; i < analyserData.length; i++) {
        sum += analyserData[i] * analyserData[i];
      }
      const rms = Math.sqrt(sum / analyserData.length);
      const isActuallySpeaking = rms > VAD_THRESHOLD && !isMutedRef.current;
      
      // Обновляем ЛОКАЛЬНЫЙ стейт мгновенно (для плавной обводки)
      if (isActuallySpeaking !== isSpeakingRef.current) {
        isSpeakingRef.current = isActuallySpeaking;
        setIsSpeaking(isActuallySpeaking);
        presencePayload.current.isSpeaking = isActuallySpeaking;
        
        // Обновляем presence С ТРОТТЛИНГОМ — чтобы не убить канал сигнализации
        const now = Date.now();
        if (now - lastPresenceUpdate > PRESENCE_THROTTLE) {
          lastPresenceUpdate = now;
          realtimeChannel.current?.track(presencePayload.current).catch(() => {});
          if (globalPresence.current) {
            globalPresence.current.track({ ...presencePayload.current, channelId, joined_at: Date.now() }).catch(() => {});
          }
        }
      }
    }, 150);

    // 3. Инициализируем Supabase канал
    currentUserRef.current = { id: user.id, username };
    presencePayload.current = { 
      userId: user.id, 
      username, 
      color, 
      isScreenSharing: false, 
      isSpeaking: false,
      isMuted: isMutedRef.current,
      isDeafened: isDeafenedRef.current
    };

    const channel = supabase.channel(`voice:${channelId}`, {
      config: { presence: { key: user.id }, broadcast: { self: false, ack: false } },
    });

    channel.on('presence', { event: 'sync' }, () => syncParticipants(channel));
    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      newPresences.forEach(p => { 
        if (p.userId !== user.id) {
          createPeerConnection(p.userId);
          // Звук 'join' убран — Supabase иногда триггерит 'join' при обновлении presence (напр. мют),
          // что вызывало звон у всех участников при каждом мюте/анмюте.
        }
      });
      syncParticipants(channel);
    });
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach(p => {
        closePeer(p.userId);
        // Звук 'leave' убран по той же причине.
      });
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
      if (pc && payload.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
      }
    });

    channel.on('broadcast', { event: 'request-stream' }, async ({ payload }) => {
      if (payload.to !== user.id || !screenStreamRef.current) return;
      const pc = peerConns.current[payload.from];
      if (pc) {
        screenStreamRef.current.getTracks().forEach(track => {
          if (!pc.getSenders().some(s => s.track === track)) pc.addTrack(track, screenStreamRef.current);
        });
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const payload = { 
          ...presencePayload.current,
          isMuted: isMutedRef.current,
          isDeafened: isDeafenedRef.current,
          isScreenSharing: false,
          joined_at: Date.now()
        };
        await channel.track(payload);
        
        if (globalPresence.current) {
          globalPresence.current.track({ 
            ...payload,
            channelId
          }).catch(() => {});
        }
        setActiveChannelId(channelId);
        setIsConnecting(false);
        notifications.play('self_join');
      }
    });

    realtimeChannel.current = channel;
  }, [activeChannelId, createPeerConnection, closePeer, syncParticipants]);

  const leaveVoiceChannel = useCallback(async () => {
    const wasActive = !!activeChannelId;
    await cleanupAll();
    if (wasActive) notifications.play('self_leave');
  }, [cleanupAll, activeChannelId]);

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    
    if (next) {
      // МУТИМ: просто отключаем трек
      if (localStream.current) {
        localStream.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    } else {
      // РАЗМУТ: клонируем оригинальный трек и подменяем на всех соединениях.
      // Это КЛЮЧЕВОЕ исправление — replaceTrack() заставляет WebRTC
      // заново синхронизировать аудио, избегая бага с "мёртвым" треком.
      const origTrack = originalMicStreamRef.current?.getAudioTracks()[0];
      if (origTrack) {
        const freshTrack = origTrack.clone();
        freshTrack.enabled = true;
        
        // Подменяем трек на всех peer connections
        Object.values(peerConns.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
          if (sender) {
            sender.replaceTrack(freshTrack).catch(e => console.warn('[Voice] replaceTrack error:', e));
          }
        });
        
        // Обновляем localStream с новым треком
        const oldTracks = localStream.current?.getAudioTracks() || [];
        oldTracks.forEach(t => { if (t !== origTrack) t.stop(); });
        localStream.current = new MediaStream([freshTrack]);
      }
      
      // Принудительно play() у всех аудио-элементов
      Object.values(audioElements.current).forEach(audio => {
        if (audio && !audio.muted) {
          audio.play().catch(() => {});
        }
      });
    }

    const updates = { isMuted: next };

    // [ОСОБАЯ ЛОГИКА]: Если размучиваем микрофон, а наушники включены — размучиваем и их
    if (!next && isDeafenedRef.current) {
      setIsDeafened(false);
      isDeafenedRef.current = false;
      Object.values(audioElements.current).forEach(audio => { if (audio) audio.muted = false; });
      updates.isDeafened = false;
      notifications.play('undeafen');
    }

    if (next) {
      updates.isSpeaking = false;
    }
    
    // Обновляем стейты и рефы
    setIsMuted(next);
    isMutedRef.current = next;
    autoMutedByDeafenRef.current = false;

    notifications.play(next ? 'mute' : 'unmute');
    updatePresenceStatus(updates);
  }, [updatePresenceStatus]);


  const toggleDeafen = useCallback(() => {
    const next = !isDeafenedRef.current;
    
    // 1. Глушим всех локально
    Object.values(audioElements.current).forEach(audio => { if (audio) audio.muted = next; });
    
    const updates = { isDeafened: next };

    if (next) {
      // [Discord-style]: При нажатии на наушники (Deafen) — всегда включается микрофон (Mute)
      if (!isMutedRef.current) {
        setIsMuted(true);
        isMutedRef.current = true;
        autoMutedByDeafenRef.current = true; 
        if (localStream.current) {
          localStream.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        updates.isMuted = true;
        updates.isSpeaking = false;
        setIsSpeaking(false);
        isSpeakingRef.current = false;
      }
    } else {
      // При выключении наушников — возвращаем микрофон, только если мутили его автоматом
      if (autoMutedByDeafenRef.current) {
        setIsMuted(false);
        isMutedRef.current = false;
        autoMutedByDeafenRef.current = false;
        
        // replaceTrack с клоном — гарантированное восстановление аудио
        const origTrack = originalMicStreamRef.current?.getAudioTracks()[0];
        if (origTrack) {
          const freshTrack = origTrack.clone();
          freshTrack.enabled = true;
          Object.values(peerConns.current).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
            if (sender) {
              sender.replaceTrack(freshTrack).catch(e => console.warn('[Voice] replaceTrack error:', e));
            }
          });
          const oldTracks = localStream.current?.getAudioTracks() || [];
          oldTracks.forEach(t => { if (t !== origTrack) t.stop(); });
          localStream.current = new MediaStream([freshTrack]);
        }
        
        // Принудительно play() у всех аудио-элементов
        Object.values(audioElements.current).forEach(audio => {
          if (audio && !audio.muted) {
            audio.play().catch(() => {});
          }
        });
        
        updates.isMuted = false;
      }
    }

    // 2. Обновляем стейты
    setIsDeafened(next);
    isDeafenedRef.current = next;

    notifications.play(next ? 'deafen' : 'undeafen');
    
    // 3. Пушим статус
    updatePresenceStatus(updates);
  }, [updatePresenceStatus]);

  const setParticipantVolume = useCallback((userId, volumePct) => {
    const audio = audioElements.current[userId];
    if (audio) audio.volume = Math.max(0, Math.min(2, volumePct / 100));
    localStorage.setItem(`vol_${userId}`, String(volumePct));
    window.dispatchEvent(new CustomEvent('volumeChanged', { detail: { userId, volumePct } }));
  }, []);

  /** Трансляция экрана */
  const startScreenShare = useCallback(async (quality = '720p', currentUser, sourceId = null, withAudio = false) => {
    try {
      const RESOLUTIONS = { '1080p': { w: 1920, h: 1080 }, '720p': { w: 1280, h: 720 }, '480p': { w: 854, h: 480 }, '360p': { w: 640, h: 360 } };
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
      
      // Обновляем статус везде
      updatePresenceStatus({ isScreenSharing: true });
      
      notifications.play('self_stream');
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { console.error('Screen sharing error', err); }
  }, [updatePresenceStatus]);

  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      const tracks = screenStreamRef.current.getTracks();
      tracks.forEach(t => t.stop());
      Object.values(peerConns.current).forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track && tracks.includes(sender.track)) pc.removeTrack(sender);
        });
      });
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    
    // Обновляем статус везде
    updatePresenceStatus({ isScreenSharing: false });
    
    notifications.play('stream_stop');
  }, [updatePresenceStatus]);

  const requestScreenView = useCallback((targetUserId) => {
    if (realtimeChannel.current && currentUserRef.current) {
      realtimeChannel.current.send({
        type: 'broadcast', event: 'request-stream',
        payload: { from: currentUserRef.current.id, to: targetUserId },
      });
    }
  }, []);

  const [ping, setPing] = useState(null);

  // ── Мониторинг задержки (Ping) ──
  useEffect(() => {
    if (!activeChannelId) {
      setPing(null);
      return;
    }

    // Извлекаем базовый URL для пинга (без /rest/v1)
    const pingTarget = supabase.supabaseUrl;

    const measurePing = async () => {
      let rtts = [];
      
      // 1. Попытка получить P2P задержку (WebRTC Stats)
      for (const pc of Object.values(peerConns.current)) {
        try {
          const stats = await pc.getStats();
          stats.forEach(report => {
            // Ищем данные о задержке в паре кандидатов
            if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated || report.active)) {
              // Проверяем все возможные именования полей RTT
              const rtt = report.currentRoundTripTime || report.roundTripTime || report.totalRoundTripTime;
              if (typeof rtt === 'number' && rtt > 0) {
                // Если это totalRoundTripTime, делим на количество ответов (но обычно это секунды для current)
                const ms = rtt < 10 ? rtt * 1000 : rtt; 
                rtts.push(ms); 
              }
            }
          });
        } catch { /* ignore */ }
      }
      
      if (rtts.length > 0) {
        setPing(Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length));
      } else {
        // 2. Запасной вариант: Пинг до API Supabase (если мы одни или P2P не дает стат)
        const start = Date.now();
        try {
          // Используем пустой запрос к корню API
          await fetch(pingTarget, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
          const diff = Date.now() - start;
          setPing(diff > 0 ? diff : 5); // минимум 5мс для реалистичности
        } catch {
          // Если даже API не отвечает — пробуем замерить время до БД
          try {
            const dbStart = Date.now();
            await supabase.from('profiles').select('id').limit(1);
            setPing(Date.now() - dbStart);
          } catch {
            setPing(null);
          }
        }
      }
    };

    // Запускаем сразу и потом каждые 3 секунды
    const interval = setInterval(measurePing, 3000);
    measurePing();

    return () => clearInterval(interval);
  }, [activeChannelId]);

  return {
    activeChannelId, participants, allParticipants, ping,
    isMuted, isDeafened, isConnecting, isSpeaking, isScreenSharing, remoteScreens,
    joinVoiceChannel, leaveVoiceChannel,
    toggleMute, toggleDeafen, setParticipantVolume,
    startScreenShare, stopScreenShare, requestScreenView,
  };
}
