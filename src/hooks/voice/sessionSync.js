export function syncLocalVoiceParticipants({
  channel,
  isLeavingRef,
  currentUserRef,
  peerConnsRef,
  ghostPeersRef,
  createPeerConnection,
  closePeer,
  GHOST_PEER_GRACE_MS,
}) {
  if (channel.state !== 'joined' || isLeavingRef.current) return;

  const state = channel.presenceState();
  const myId = currentUserRef.current?.id;
  const seenUids = new Set();

  Object.values(state).flat().forEach((presence) => {
    if (!presence.userId || (isLeavingRef.current && presence.userId === myId)) return;

    seenUids.add(presence.userId);

    if (
      presence.userId !== myId &&
      !peerConnsRef.current[presence.userId] &&
      !ghostPeersRef.current[presence.userId]
    ) {
      createPeerConnection(presence.userId, channel);
    }
  });

  Object.keys(peerConnsRef.current).forEach((uid) => {
    if (!seenUids.has(uid) && !ghostPeersRef.current[uid]) {
      ghostPeersRef.current[uid] = setTimeout(() => {
        closePeer(uid, true);
        delete ghostPeersRef.current[uid];
      }, GHOST_PEER_GRACE_MS);
      return;
    }

    if (seenUids.has(uid) && ghostPeersRef.current[uid]) {
      clearTimeout(ghostPeersRef.current[uid]);
      delete ghostPeersRef.current[uid];
    }
  });
}
