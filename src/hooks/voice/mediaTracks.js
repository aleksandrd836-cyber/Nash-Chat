export function attachRemoteVideoTrack(remoteUserId, event, setRemoteScreens) {
  const track = event.track;
  const stream = event.streams[0] || new MediaStream([track]);

  setRemoteScreens((prev) => ({ ...prev, [remoteUserId]: stream }));

  track.onended = () => {
    setRemoteScreens((prev) => {
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });
  };
}

export function ensureRemoteAudioElement(audioElementsRef, remoteUserId) {
  if (!audioElementsRef.current[remoteUserId]) {
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = true;
    audio.volume = 0;
    document.body.appendChild(audio);
    audioElementsRef.current[remoteUserId] = audio;
  }

  return audioElementsRef.current[remoteUserId];
}

export function attachRemoteAudioTrack({
  remoteUserId,
  event,
  audioElementsRef,
  gainNodesRef,
  audioContextRef,
  remoteAnalysersRef,
  isDeafenedRef,
}) {
  const stream = event.streams[0] || new MediaStream([event.track]);
  const audioElement = ensureRemoteAudioElement(audioElementsRef, remoteUserId);

  if (!gainNodesRef.current[remoteUserId] && audioContextRef.current) {
    try {
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      remoteAnalysersRef.current[remoteUserId] = {
        analyser,
        data: new Float32Array(analyser.fftSize),
      };

      const gain = audioContextRef.current.createGain();
      const savedVolume = localStorage.getItem(`vol_${remoteUserId}`);
      gain.gain.value = isDeafenedRef.current
        ? 0
        : (savedVolume !== null ? Number(savedVolume) / 100 : 1.0);

      source.connect(gain);
      gain.connect(audioContextRef.current.destination);
      gainNodesRef.current[remoteUserId] = gain;
    } catch {}
  }

  audioElement.srcObject = stream;
  audioElement.play().catch(() => {});
}
