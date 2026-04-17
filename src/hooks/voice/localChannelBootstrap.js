export function setupLocalVoiceChannel({
  supabaseClient,
  channelId,
  user,
  realtimeChannelRef,
  syncParticipants,
  mutateRealtimeParticipants,
  updateParticipantSpeakingMap,
  createOfferBroadcastHandler,
  createAnswerBroadcastHandler,
  createIceBroadcastHandler,
  createUserLeftBroadcastHandler,
  createRequestStreamBroadcastHandler,
  handleAdminVoiceStateBroadcast,
  createLocalVoiceChannelStatusHandler,
  createPeerConnection,
  removeSessionFromParticipantMap,
  closePeer,
  peerConnsRef,
  makingOfferRef,
  ignoreOfferRef,
  screenStreamRef,
  isSilent,
  isLeavingRef,
  isSwitchingRef,
  activeChannelIdRef,
  reconnectAttemptsRef,
  reconnectTimerRef,
  lastStableChannelIdRef,
  presencePayloadRef,
  globalPresenceRef,
  currentUserRef,
  setServerStatus,
  setVoiceError,
  setIsConnecting,
  setConnectingChannelId,
  setActiveChannelId,
  updatePresenceStatus,
  upsertVoiceSession,
  refreshVoiceSessions,
  appendParticipantToChannel,
  flushPendingStreamRequests,
  scheduleManagedTimeout,
  clearManagedTimeout,
  resolveStableVoiceChannelId,
  resolveReconnectDelayMs,
  joinVoiceChannel,
  notifications,
  RECONNECT_DELAY_MS,
}) {
  const channel = supabaseClient.channel(`voice:${channelId}`);
  realtimeChannelRef.current = channel;

  channel.on('broadcast', { event: 'speaking-update' }, ({ payload }) => {
    mutateRealtimeParticipants((prev) => (
      updateParticipantSpeakingMap(prev, payload.userId, payload.isSpeaking)
    ));
  });

  channel.on('broadcast', { event: 'offer' }, createOfferBroadcastHandler({
    userId: user.id,
    channel,
    peerConnsRef,
    createPeerConnection,
    makingOfferRef,
    ignoreOfferRef,
  }));

  channel.on('broadcast', { event: 'answer' }, createAnswerBroadcastHandler({
    userId: user.id,
    peerConnsRef,
  }));

  channel.on('broadcast', { event: 'ice' }, createIceBroadcastHandler({
    userId: user.id,
    peerConnsRef,
  }));

  channel.on('broadcast', { event: 'user-left' }, createUserLeftBroadcastHandler({
    mutateRealtimeParticipants,
    removeSessionFromParticipantMap,
    closePeer,
  }));

  channel.on('broadcast', { event: 'request-stream' }, createRequestStreamBroadcastHandler({
    userId: user.id,
    screenStreamRef,
    peerConnsRef,
  }));

  channel.on('broadcast', { event: 'admin-voice-state' }, ({ payload }) => {
    handleAdminVoiceStateBroadcast?.(payload);
  });

  channel.subscribe(createLocalVoiceChannelStatusHandler({
    channel,
    channelId,
    isSilent,
    user,
    realtimeChannelRef,
    isLeavingRef,
    isSwitchingRef,
    activeChannelIdRef,
    reconnectAttemptsRef,
    reconnectTimerRef,
    lastStableChannelIdRef,
    presencePayloadRef,
    globalPresenceRef,
    currentUserRef,
    setServerStatus,
    setVoiceError,
    setIsConnecting,
    setConnectingChannelId,
    setActiveChannelId,
    updatePresenceStatus,
    upsertVoiceSession,
    refreshVoiceSessions,
    syncParticipants,
    mutateRealtimeParticipants,
    appendParticipantToChannel,
    flushPendingStreamRequests,
    scheduleManagedTimeout,
    clearManagedTimeout,
    resolveStableVoiceChannelId,
    resolveReconnectDelayMs,
    joinVoiceChannel,
    notifications,
    RECONNECT_DELAY_MS,
    removeSupabaseChannel: supabaseClient.removeChannel.bind(supabaseClient),
  }));

  return channel;
}
