export async function cleanupVoiceSessionState({
  currentUserRef,
  sessionIdRef,
  isLeavingRef,
  mutateRealtimeParticipants,
  removeSessionFromParticipantMap,
  setParticipants,
  setActiveChannelId,
  activeChannelIdRef,
  lastStableChannelIdRef,
  setConnectingChannelId,
  setIsScreenSharing,
  setRemoteScreens,
  setVoiceError,
  setIsConnecting,
  removeVoiceSession,
  refreshVoiceSessions,
  reconnectTimerRef,
  presenceDebounceRef,
  fakeVADIntervalRef,
  heartbeatIntervalRef,
  ghostPeersRef,
  orphanedRemotePeerTimersRef,
  clearManagedTimeout,
  clearManagedInterval,
  clearManagedTimeoutMap,
  peerConnsRef,
  closePeer,
  localStreamRef,
  originalMicStreamRef,
  screenStreamRef,
  audioContextRef,
  rnnoiseNodeRef,
  gainNodesRef,
  remoteAnalysersRef,
  audioElementsRef,
  realtimeChannelRef,
  globalPresenceRef,
  presencePayloadRef,
  supabaseClient,
}) {
  console.log('[useVoice] cleanupAll started (EXIT button clicked)');

  isLeavingRef.current = true;
  const myId = currentUserRef.current?.id;

  setParticipants([]);
  setActiveChannelId(null);
  activeChannelIdRef.current = null;
  lastStableChannelIdRef.current = null;
  setConnectingChannelId(null);
  setIsConnecting(false);
  setIsScreenSharing(false);
  setRemoteScreens({});
  setVoiceError(null);

  mutateRealtimeParticipants((prev) =>
    removeSessionFromParticipantMap(prev, {
      userId: myId,
      sessionId: sessionIdRef.current,
    })
  );

  clearManagedTimeout(reconnectTimerRef, '[useVoice] Clearing background reconnect timer');
  clearManagedTimeout(presenceDebounceRef);
  clearManagedInterval(fakeVADIntervalRef);
  clearManagedInterval(heartbeatIntervalRef);
  clearManagedTimeoutMap(ghostPeersRef);
  clearManagedTimeoutMap(orphanedRemotePeerTimersRef);

  const currentRealtimeChannel = realtimeChannelRef.current;
  const broadcastPayload = {
    type: 'broadcast',
    event: 'user-left',
    payload: { userId: myId, sessionId: sessionIdRef.current },
  };

  await Promise.allSettled([
    globalPresenceRef.current?.state === 'joined'
      ? globalPresenceRef.current.send(broadcastPayload)
      : Promise.resolve(),
    currentRealtimeChannel?.state === 'joined'
      ? currentRealtimeChannel.send(broadcastPayload)
      : Promise.resolve(),
  ]);

  if (globalPresenceRef.current?.state === 'joined') {
    await globalPresenceRef.current.track({
      ...presencePayloadRef.current,
      channelId: null,
      joined_at: presencePayloadRef.current.joined_at || Date.now(),
    }).catch(() => {});

    await globalPresenceRef.current.untrack().catch(() => {});
  }

  await new Promise((resolve) => setTimeout(resolve, 150));
  await removeVoiceSession(sessionIdRef.current).catch(() => {});
  await refreshVoiceSessions();

  console.log('[useVoice] Closing peer connections...');
  Object.keys(peerConnsRef.current).forEach((id) => closePeer(id, true));

  localStreamRef.current?.getTracks().forEach((track) => track.stop());
  localStreamRef.current = null;

  originalMicStreamRef.current?.getTracks().forEach((track) => track.stop());
  originalMicStreamRef.current = null;

  screenStreamRef.current?.getTracks().forEach((track) => track.stop());
  screenStreamRef.current = null;

  Object.values(gainNodesRef.current).forEach((node) => {
    try { node.disconnect(); } catch {}
  });
  gainNodesRef.current = {};
  remoteAnalysersRef.current = {};

  Object.keys(audioElementsRef.current).forEach((userId) => {
    const element = audioElementsRef.current[userId];
    if (!element) return;
    element.srcObject = null;
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });
  audioElementsRef.current = {};

  if (rnnoiseNodeRef.current) {
    try { rnnoiseNodeRef.current.disconnect(); } catch {}
    rnnoiseNodeRef.current = null;
  }

  if (audioContextRef.current) {
    audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
  }

  if (currentRealtimeChannel) {
    realtimeChannelRef.current = null;
    console.log('[useVoice] Removing Realtime channel...');
    await supabaseClient.removeChannel(currentRealtimeChannel).catch(() => {});
  }

  if (globalPresenceRef.current) {
    console.log('[useVoice] Updating global presence (EXIT)...');
  }

  mutateRealtimeParticipants((prev) =>
    removeSessionFromParticipantMap(prev, {
      userId: myId,
      sessionId: sessionIdRef.current,
    })
  );
}
