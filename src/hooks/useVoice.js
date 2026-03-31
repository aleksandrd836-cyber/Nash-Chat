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
  const gainNodesRef = useRef({}); // Узлы усиления для каждого участника
  const makingOfferRef = useRef({}); // Флаги "я шлю оффер" для каждого участника
  const ignoreOfferRef = useRef({}); // Флаги игнорирования входящих офферов
  // Таймеры на удаление "призраков" (чтобы не рвать WebRTC при мерцании Presence)
  const ghostPeersRef = useRef({});

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

  const createPeerConnection = useCallback((remoteUserId, signalingChannel) => {
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
        makingOfferRef.current[remoteUserId] = true;
        // Используем современный способ: setLocalDescription() сам создаст и применит оффер
        await pc.setLocalDescription();
        
        const offerPayload = { 
          type: 'broadcast', event: 'offer', 
          payload: { from: currentUserRef.current.id, to: remoteUserId, sdp: pc.localDescription } 
        };
        
        if (realtimeChannel.current) {
          realtimeChannel.current.send(offerPayload);
        } else if (signalingChannel) {
          signalingChannel.send(offerPayload);
        }
      } catch (err) {
        console.error(`[WebRTC] onnegotiationneeded error:`, err);
        setVoiceError(`[Negotiation] ${err.message || 'Ошибка создания предложения'}`);
        makingOfferRef.current[remoteUserId] = false;
      }
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
          if (savedVol !== null) audio.volume = Math.min(1, Number(savedVol) / 100);
          audio.style.display = 'none';
          // ВАЖНО: Мы будем использовать GainNode для звука, поэтому сам Audio элемент
          // оставляем беззвучным (volume=0), чтобы не было эха/дублирования.
          audio.volume = 0; 
          document.body.appendChild(audio);
          audioElements.current[remoteUserId] = audio;
        }

        // Подключаем Web Audio GainNode для усиления (до 200% и выше)
        if (!gainNodesRef.current[remoteUserId] && audioContextRef.current) {
          try {
            console.log(`[Voice] Создаю GainNode для ${remoteUserId}`);
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const gainNode = audioContextRef.current.createGain();
            
            // Берем громкость из локального хранилища
            const savedVol = localStorage.getItem(`vol_${remoteUserId}`);
            const initialVol = savedVol !== null ? Number(savedVol) / 100 : 1.0;
            gainNode.gain.value = initialVol;
            
            source.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
            gainNodesRef.current[remoteUserId] = gainNode;
          } catch (e) {
            console.warn(`[Voice] Ошибка создания GainNode для ${remoteUserId}:`, e);
          }
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
          if (a) {
            console.log(`[Voice] track.onunmute от ${remoteUserId} — перезапуск`);
            a.play().catch(() => {});
          }
          // Resume AudioContext if suspended (browser policy)
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
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
        const icePayload = { type: 'broadcast', event: 'ice', payload: { from: currentUserRef.current.id, to: remoteUserId, candidate } };
        if (realtimeChannel.current) {
          realtimeChannel.current.send(icePayload);
        } else if (signalingChannel) {
          signalingChannel.send(icePayload);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE (${remoteUserId}): ${state}`);

      if (state === 'failed' || state === 'closed') {
        // Соединение окончательно упало — сразу закрываем
        closePeer(remoteUserId, true);
      } else if (state === 'disconnected') {
        console.warn(`[WebRTC] Связь с ${remoteUserId} потеряна. Пробую ICE Restart...`);
        setVoiceError(`[Network] Попытка восстановления связи с ${remoteUserId}...`);
        
        try {
          pc.restartIce();
        } catch (err) {
          console.error(`[WebRTC] Ошибка ICE Restart:`, err);
        }

        // Если за 5 секунд связь не восстановилась — рубим и пусть Self-healing создаст заново
        if (iceDisconnectTimers.current[remoteUserId]) clearTimeout(iceDisconnectTimers.current[remoteUserId]);
        iceDisconnectTimers.current[remoteUserId] = setTimeout(() => {
          if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            console.log(`[WebRTC] Восстановление ${remoteUserId} не удалось. Пересоздаю...`);
            setVoiceError(`[Network] Связь потеряна. Переподключение...`);
            closePeer(remoteUserId, true);
          }
          delete iceDisconnectTimers.current[remoteUserId];
        }, 5000);

      } else if (state === 'connected' || state === 'completed') {
        if (iceDisconnectTimers.current[remoteUserId]) {
          clearTimeout(iceDisconnectTimers.current[remoteUserId]);
          delete iceDisconnectTimers.current[remoteUserId];
        }
        setVoiceError(null); // Ошибка исправлена сама собой
      } else if (state === 'failed') {
        setVoiceError(`[Connection] Критическая ошибка связи с ${remoteUserId}. Попробуйте перезайти.`);
      }
    };

    peerConns.current[remoteUserId] = pc;
    return pc;
  }, []);

  const closePeer = useCallback((userId, force = false) => {
    // Если не force, проверяем, не запланировано ли уже удаление
    if (!force && ghostPeersRef.current[userId]) return;

    if (peerConns.current[userId]) {
      console.log(`[WebRTC] Закрываю соединение с ${userId}`);
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
    // Удаляем GainNode участника
    if (gainNodesRef.current[userId]) {
      try {
        gainNodesRef.current[userId].disconnect();
        delete gainNodesRef.current[userId];
      } catch {}
    }
  }, []);

  const cleanupAll = useCallback(async () => {
    // Очистка призраков
    Object.values(ghostPeersRef.current).forEach(t => clearTimeout(t));
    ghostPeersRef.current = {};

    Object.keys(peerConns.current).forEach(id => closePeer(id, true));
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
    gainNodesRef.current = {};

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
      
      // ── САМОВОССТАНОВЛЕНИЕ (Self-Healing) ──
      // Если пользователя видим, но соединения нет (и это не я)
      if (p.userId !== currentUserRef.current?.id && !peerConns.current[p.userId]) {
        // Если он еще в списке "призраков", значит он только что мигнул
        if (!ghostPeersRef.current[p.userId]) {
          console.log(`[Self-Healing] Обнаружен участник ${p.userId} без связи. Восстанавливаю...`);
          createPeerConnection(p.userId, channel);
        }
      }
    });

    // ── УДАЛЕНИЕ ПО НАСТОЯЩЕМУ ТАЙМАУТУ ──
    // Если участника больше нет в списке Presence, начинаем долгий отсчет (60 сек)
    Object.keys(peerConns.current).forEach(uid => {
      if (!seen.has(uid)) {
        if (!ghostPeersRef.current[uid]) {
          console.log(`[Presence] Участник ${uid} пропал из списков. Запуск 60с буфера...`);
          ghostPeersRef.current[uid] = setTimeout(() => {
            console.log(`[Presence] Окончательное удаление ${uid} (отсутствует 60с)`);
            closePeer(uid, true);
            delete ghostPeersRef.current[uid];
          }, 60000);
        }
      } else {
        if (ghostPeersRef.current[uid]) {
          console.log(`[Presence] Участник ${uid} снова в списках (отмена Ghost буфера)`);
          clearTimeout(ghostPeersRef.current[uid]);
          delete ghostPeersRef.current[uid];
        }
      }
    });

    setParticipants(Array.from(seen.values()));
  }, [createPeerConnection, activeChannelId]);

  const joinVoiceChannel = useCallback(async (channelId, user, username, color) => {
    if (activeChannelId) await leaveVoiceChannel();
    setIsConnecting(true);
    setVoiceError(null);

    // 1. Получаем поток микрофона (с учетом выбранного девайса, если есть)
    let stream;
    try {
      const selectedMic = localStorage.getItem('micDeviceId');
      const constraints = {
        audio: selectedMic
          ? { deviceId: { exact: selectedMic }, echoCancellation: false, noiseSuppression: false, autoGainControl: true }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
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
          if (ghostPeersRef.current[p.userId]) {
            console.log(`[Presence] Пользователь ${p.userId} вернулся (отмена удаления)`);
            clearTimeout(ghostPeersRef.current[p.userId]);
            delete ghostPeersRef.current[p.userId];
          } else {
            console.log(`[Presence] Новый участник: ${p.userId}. Создаю соединение.`);
            createPeerConnection(p.userId, channel);
          }
        }
      });
      syncParticipants(channel);
    });

    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      // Мы больше не удаляем соединение по событию leave!
      // Обработка удаления теперь полностью в syncParticipants (через 60с буфер).
      leftPresences.forEach(p => {
        console.log(`[Presence] Получен сигнал leave для ${p.userId}. Игнорируем (ждем sync буфер)`);
      });
    });

    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const remoteId = payload.from;
      const pc = createPeerConnection(remoteId, channel);
      if (!pc) return;

      try {
        const description = new RTCSessionDescription(payload.sdp);
        
        // ── Perfect Negotiation Logic ──
        const polite = user.id < remoteId; // Вежливый тот, чей ID меньше
        const offerCollision = (pc.signalingState !== 'stable' || makingOfferRef.current[remoteId]);
        
        ignoreOfferRef.current[remoteId] = !polite && offerCollision;
        if (ignoreOfferRef.current[remoteId]) {
          console.warn(`[WebRTC] Игнорирую Offer от ${remoteId} (я главный и мы в коллизии)`);
          return;
        }

        // Если коллизия, но мы вежливы — откатываем свой оффер
        if (offerCollision) {
          console.log(`[WebRTC] Откатываю свой Offer для ${remoteId} (я вежлив)`);
          await pc.setLocalDescription({ type: 'rollback' });
        }
        
        await pc.setRemoteDescription(description);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        const answerPayload = { 
          type: 'broadcast', event: 'answer', 
          payload: { from: user.id, to: remoteId, sdp: pc.localDescription } 
        };
        channel.send(answerPayload);
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
        setVoiceError(`[Signaling] Ошибка приема предложения от ${remoteId}: ${err.message}`);
      }
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const remoteId = payload.from;
      const pc = peerConns.current[remoteId];
      if (pc) {
        try {
          // Если мы игнорируем оффер от этого пользователя, то ответ нам тоже не нужен (мы в коллизии)
          if (ignoreOfferRef.current[remoteId]) return;
          
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } catch (err) {
          console.error('[WebRTC] Error handling answer:', err);
          setVoiceError(`[Signaling] Ошибка приема ответа от ${remoteId}: ${err.message}`);
        }
      }
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
        
        notifications.play('self_join');
        
        // Первый track сразу после подписки
        channel.track(payload).catch(() => {});
        if (globalPresence.current) {
          globalPresence.current.track({ ...payload, channelId }).catch(() => {});
        }
        setActiveChannelId(channelId);
        setIsConnecting(false);
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
    
    // 1. Глушим всех локально (и элементы, и GainNodes)
    Object.values(audioElements.current).forEach(audio => { if (audio) audio.muted = next; });
    Object.values(gainNodesRef.current).forEach(gain => {
      if (gain) {
        gain.gain.setTargetAtTime(next ? 0 : (localStorage.getItem(`vol_default`) || 1), audioContextRef.current?.currentTime || 0, 0.1);
      }
    });
    
    // ВАЖНО: Нам нужно восстановить реальную громкость каждого участника при разглушении
    if (!next) {
      Object.keys(gainNodesRef.current).forEach(uid => {
        const savedVol = localStorage.getItem(`vol_${uid}`);
        const vol = savedVol !== null ? Number(savedVol) / 100 : 1.0;
        gainNodesRef.current[uid].gain.setTargetAtTime(vol, audioContextRef.current.currentTime, 0.1);
      });
    }
    
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
          if (audio) {
            audio.play().catch(() => {});
          }
        });
        // Resume AudioContext
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
        }
        
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
    // 1. Обновляем усиление через GainNode (основной способ)
    const gainNode = gainNodesRef.current[userId];
    if (gainNode) {
      gainNode.gain.setTargetAtTime(volumePct / 100, audioContextRef.current.currentTime, 0.1);
    }
    
    // 2. Также сохраняем в localStorage
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
      console.log('[WebRTC] Остановка трансляции экрана. Очистка соединений...');
      const tracks = screenStreamRef.current.getTracks();
      
      // 1. Сначала удаляем треки из всех RTCPeerConnection (провоцирует renegotiation)
      Object.values(peerConns.current).forEach(pc => {
        pc.getSenders().forEach(sender => {
          if (sender.track && tracks.some(t => t.id === sender.track.id)) {
            try {
              pc.removeTrack(sender);
            } catch (e) {
              console.warn('[WebRTC] Ошибка при удалении трека:', e);
            }
          }
        });
      });

      // 2. Затем останавливаем сами треки физически
      tracks.forEach(t => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      
      // Даем WebRTC 300мс на завершение переговоров перед обновлением Presence
      setTimeout(() => {
        updatePresenceStatus({ isScreenSharing: false });
        notifications.play('stream_stop');
      }, 300);
    }
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
    isMuted, isDeafened, isConnecting, isSpeaking, isScreenSharing, remoteScreens, voiceError,
    joinVoiceChannel, leaveVoiceChannel,
    toggleMute, toggleDeafen, setParticipantVolume,
    startScreenShare, stopScreenShare, requestScreenView,
    clearVoiceError: () => setVoiceError(null)
  };
}
