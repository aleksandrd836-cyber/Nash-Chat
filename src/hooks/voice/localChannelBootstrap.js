export function setupLocalVoiceChannel({
  supabaseClient,
  channelId,
  user,
  realtimeChannelRef,
  syncParticipants,
  syncLocalChannelParticipantsToUi,
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
  joinVoiceChannel,
  notifications,
  RECONNECT_DELAY_MS,
}) {
  const channel = supabaseClient.channel(`voice:${channelId}`, { config: { presence: { key: user.id } } });
  realtimeChannelRef.current = channel;

  const handleLocalPresenceSync = () => {
    syncParticipants(channel);
    syncLocalChannelParticipantsToUi?.(channel);
  };

  channel.on('presence', { event: 'sync' }, handleLocalPresenceSync);
  channel.on('presence', { event: 'join' }, handleLocalPresenceSync);
  channel.on('presence', { event: 'leave' }, handleLocalPresenceSync);

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
    mutateRealtimeParticipants,
    appendParticipantToChannel,
    flushPendingStreamRequests,
    scheduleManagedTimeout,
    clearManagedTimeout,
    resolveStableVoiceChannelId,
    joinVoiceChannel,
    notifications,
    RECONNECT_DELAY_MS,
    removeSupabaseChannel: supabaseClient.removeChannel.bind(supabaseClient),
  }));

  return channel;
}
