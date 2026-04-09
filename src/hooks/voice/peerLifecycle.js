export function attachExistingPeerStreams(pc, localStream, screenStream, remoteUserId) {
  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  if (screenStream) {
    console.log(`[WebRTC] Adding existing screen stream for new peer ${remoteUserId}`);
    screenStream.getTracks().forEach((track) => pc.addTrack(track, screenStream));
  }
}

export function createNegotiationNeededHandler({
  pc,
  remoteUserId,
  makingOfferRef,
  currentUserRef,
  realtimeChannelRef,
  signalingChannel,
}) {
  return async () => {
    try {
      if (makingOfferRef.current[remoteUserId]) return;
      makingOfferRef.current[remoteUserId] = true;

      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;

      await pc.setLocalDescription(offer);

      const myId = currentUserRef.current?.id;
      if (!myId) return;

      const payload = {
        type: 'broadcast',
        event: 'offer',
        payload: { from: myId, to: remoteUserId, sdp: pc.localDescription },
      };

      const channel = realtimeChannelRef.current || signalingChannel;
      if (channel && channel.state === 'joined') {
        channel.send(payload);
      }
    } catch (error) {
      console.warn(`[WebRTC] Negotiation error with ${remoteUserId}:`, error);
    } finally {
      makingOfferRef.current[remoteUserId] = false;
    }
  };
}

export function createIceCandidateHandler({
  remoteUserId,
  currentUserRef,
  realtimeChannelRef,
  signalingChannel,
}) {
  return ({ candidate }) => {
    if (!candidate || !currentUserRef.current?.id) return;

    const payload = {
      type: 'broadcast',
      event: 'ice',
      payload: { from: currentUserRef.current.id, to: remoteUserId, candidate },
    };

    const channel = realtimeChannelRef.current || signalingChannel;
    if (channel && channel.state === 'joined') {
      channel.send(payload);
    }
  };
}

export function createIceConnectionStateHandler({
  pc,
  remoteUserId,
  isLeavingRef,
  closePeer,
  iceDisconnectTimersRef,
  realtimeChannelRef,
  syncParticipants,
  setVoiceError,
  ignoreOfferRef,
}) {
  return () => {
    const state = pc.iceConnectionState;

    if (state === 'failed') {
      closePeer(remoteUserId, true);
      return;
    }

    if (state === 'disconnected') {
      if (isLeavingRef.current) return;

      console.log(`[WebRTC] Connection disconnected with ${remoteUserId}, attempting recovery...`);
      try {
        pc.restartIce();
      } catch (error) {
        console.warn('[WebRTC] restartIce error:', error);
      }

      iceDisconnectTimersRef.current[remoteUserId] = setTimeout(() => {
        if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
          console.log(`[WebRTC] Watchdog trigger for ${remoteUserId}`);
          closePeer(remoteUserId, true);
          if (realtimeChannelRef.current) {
            syncParticipants(realtimeChannelRef.current);
          }
        }
      }, 8000);

      return;
    }

    if (state === 'connected' || state === 'completed') {
      setVoiceError(null);
      ignoreOfferRef.current[remoteUserId] = false;

      if (iceDisconnectTimersRef.current[remoteUserId]) {
        clearTimeout(iceDisconnectTimersRef.current[remoteUserId]);
        delete iceDisconnectTimersRef.current[remoteUserId];
      }
    }
  };
}
