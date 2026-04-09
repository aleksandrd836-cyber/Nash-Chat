export function createOfferBroadcastHandler({
  userId,
  channel,
  peerConnsRef,
  createPeerConnection,
  makingOfferRef,
  ignoreOfferRef,
}) {
  return async ({ payload }) => {
    if (payload.to !== userId) return;
    console.log(`[WebRTC] Handle offer from ${payload.from}`);

    try {
      const pc = peerConnsRef.current[payload.from] || createPeerConnection(payload.from, channel);
      const offerCollision =
        payload.event === 'offer' &&
        (makingOfferRef.current[payload.from] || pc.signalingState !== 'stable');

      const isPolite = userId < payload.from;
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
          type: 'broadcast',
          event: 'answer',
          payload: { from: userId, to: payload.from, sdp: answer },
        });
      }
    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error);
    }
  };
}

export function createAnswerBroadcastHandler({ userId, peerConnsRef }) {
  return async ({ payload }) => {
    if (payload.to !== userId || !peerConnsRef.current[payload.from]) return;

    console.log(`[WebRTC] Handle answer from ${payload.from}`);
    try {
      const pc = peerConnsRef.current[payload.from];
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    } catch (error) {
      console.warn(`[Signaling] Answer handling failed for ${payload.from}: ${error.message}`);
    }
  };
}

export function createIceBroadcastHandler({ userId, peerConnsRef }) {
  return ({ payload }) => {
    if (payload.to !== userId || !peerConnsRef.current[payload.from]) return;

    peerConnsRef.current[payload.from]
      .addIceCandidate(new RTCIceCandidate(payload.candidate))
      .catch(() => {});
  };
}

export function createUserLeftBroadcastHandler({
  mutateRealtimeParticipants,
  removeSessionFromParticipantMap,
  closePeer,
}) {
  return ({ payload }) => {
    mutateRealtimeParticipants((prev) => removeSessionFromParticipantMap(prev, payload));
    closePeer(payload.userId, true);
  };
}

export function createRequestStreamBroadcastHandler({
  userId,
  screenStreamRef,
  peerConnsRef,
}) {
  return ({ payload }) => {
    if (payload.to !== userId || !screenStreamRef.current || !peerConnsRef.current[payload.from]) return;

    const pc = peerConnsRef.current[payload.from];
    const currentSenders = pc.getSenders();

    screenStreamRef.current.getTracks().forEach((track) => {
      const alreadyAdded = currentSenders.some((sender) => sender.track === track);
      if (!alreadyAdded) {
        console.log(`[WebRTC] Adding screen track for requester ${payload.from}`);
        pc.addTrack(track, screenStreamRef.current);
      }
    });
  };
}
