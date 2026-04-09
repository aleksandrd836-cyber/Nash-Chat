export async function initializeLocalVoiceMedia({
  isMutedRef,
  isDeafenedRef,
  originalMicStreamRef,
  audioContextRef,
  rnnoiseNodeRef,
  localStreamRef,
  fakeVADIntervalRef,
  remoteAnalysersRef,
  currentUserRef,
  realtimeChannelRef,
  isSpeakingRef,
  setIsSpeaking,
  mutateRealtimeParticipants,
  updateParticipantSpeakingMap,
  updatePresenceStatus,
}) {
  const constraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
      sampleRate: 48000,
    },
    video: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  originalMicStreamRef.current = stream;
  stream.getAudioTracks().forEach((track) => {
    track.enabled = !(isMutedRef.current || isDeafenedRef.current);
  });

  const nsEnabled = localStorage.getItem('vibe_noise_suppression') === 'true';
  let finalStream = stream;

  const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  audioContextRef.current = audioContext;
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  if (nsEnabled) {
    try {
      console.log('[useVoice] Активация AI шумоподавления...');
      await audioContext.audioWorklet.addModule('/audio/rnnoise_processor.js');

      const source = audioContext.createMediaStreamSource(stream);
      const rnnoiseNode = new AudioWorkletNode(audioContext, 'rnnoise-processor');
      rnnoiseNodeRef.current = rnnoiseNode;

      const initialIntensity = parseInt(localStorage.getItem('vibe_noise_intensity') || '100', 10);
      rnnoiseNode.port.postMessage({ type: 'setIntensity', value: initialIntensity });

      const handleLiveIntensity = (event) => {
        if (rnnoiseNodeRef.current) {
          rnnoiseNodeRef.current.port.postMessage({ type: 'setIntensity', value: event.detail.value });
        }
      };
      window.addEventListener('vibe-update-ns-intensity', handleLiveIntensity);

      const destination = audioContext.createMediaStreamDestination();
      source.connect(rnnoiseNode).connect(destination);
      finalStream = destination.stream;

      console.log('[useVoice] AI шумоподавление запущено (Интенсивность:', initialIntensity, '%) 🛡️🎙️');
    } catch (error) {
      console.error('[useVoice] Ошибка шумодава (Safe Fallback):', error);
      finalStream = stream;
    }
  }

  localStreamRef.current = finalStream;

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  const vadSource = audioContext.createMediaStreamSource(finalStream.clone());
  vadSource.connect(analyser);

  let lastPresenceUpdate = 0;
  fakeVADIntervalRef.current = setInterval(() => {
    if (!localStreamRef.current || !localStreamRef.current.active) return;

    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sumSquares = 0.0;
    for (const amplitude of data) {
      sumSquares += amplitude * amplitude;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const speaking = rms > 0.015 && !isMutedRef.current;

    if (speaking !== isSpeakingRef.current) {
      setIsSpeaking(speaking);
      isSpeakingRef.current = speaking;

      const payload = { userId: currentUserRef.current.id, isSpeaking: speaking };
      if (realtimeChannelRef.current && realtimeChannelRef.current.state === 'joined') {
        realtimeChannelRef.current.send({ type: 'broadcast', event: 'speaking-update', payload });
      }

      const now = Date.now();
      if (now - lastPresenceUpdate > 500) {
        lastPresenceUpdate = now;
        updatePresenceStatus({ isSpeaking: speaking });
      }
    }

    Object.keys(remoteAnalysersRef.current).forEach((uid) => {
      const { analyser: remoteAnalyser, data: remoteData } = remoteAnalysersRef.current[uid];
      remoteAnalyser.getFloatTimeDomainData(remoteData);
      let remoteSum = 0;
      for (let index = 0; index < remoteData.length; index++) {
        remoteSum += remoteData[index] * remoteData[index];
      }
      const remoteRms = Math.sqrt(remoteSum / remoteData.length);
      const remoteSpeaking = remoteRms > 0.01;

      mutateRealtimeParticipants((all) => updateParticipantSpeakingMap(all, uid, remoteSpeaking));
    });
  }, 150);

  return finalStream;
}
