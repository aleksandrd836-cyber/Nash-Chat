export function createLocalVoiceChannelStatusHandler({
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
  resolveStableVoiceChannelId,
  joinVoiceChannel,
  notifications,
  RECONNECT_DELAY_MS,
  removeSupabaseChannel,
}) {
  return async (status) => {
    console.log(`[useVoice] Channel status: ${status} for instance:`, channel.topic);

    if (status === 'SUBSCRIBED') {
      if (
        isLeavingRef.current ||
        activeChannelIdRef.current !== channelId ||
        channel !== realtimeChannelRef.current
      ) {
        console.warn('[useVoice] Late subscription aborted to prevent ghosting.');
        if (channel !== realtimeChannelRef.current) {
          removeSupabaseChannel(channel).catch(() => {});
        }
        setIsConnecting(false);
        setConnectingChannelId(null);
        return;
      }

      isSwitchingRef.current = false;
      reconnectAttemptsRef.current = 0;
      setServerStatus('online');
      setVoiceError(null);
      lastStableChannelIdRef.current = channelId;

      await updatePresenceStatus({}, true);
      await upsertVoiceSession({ ...presencePayloadRef.current, channelId }).catch(() => {});
      await refreshVoiceSessions();
      await flushPendingStreamRequests?.();

      if (!isSilent) {
        notifications.play('self_join');
      }

      if (globalPresenceRef.current) {
        mutateRealtimeParticipants((prev) =>
          appendParticipantToChannel(prev, channelId, {
            ...presencePayloadRef.current,
            channelId,
          })
        );
      }

      setActiveChannelId(channelId);
      activeChannelIdRef.current = channelId;
      setIsConnecting(false);
      setConnectingChannelId(null);
      return;
    }

    if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
      if (channel !== realtimeChannelRef.current || isLeavingRef.current || isSwitchingRef.current) {
        return;
      }

      reconnectAttemptsRef.current++;
      console.warn(`[useVoice] Realtime lost (${status}). Attempt ${reconnectAttemptsRef.current}/5`);
      setServerStatus('reconnecting');

      if (reconnectAttemptsRef.current > 5) {
        setServerStatus('offline');
        setVoiceError('[Server] Соединение полностью потеряно');
        setIsConnecting(false);
        setConnectingChannelId(null);
        return;
      }

      scheduleManagedTimeout(reconnectTimerRef, () => {
        const reconnectChannelId = resolveStableVoiceChannelId(
          lastStableChannelIdRef.current,
          activeChannelIdRef.current,
          presencePayloadRef.current.channelId
        );

        if (reconnectChannelId && !isLeavingRef.current && realtimeChannelRef.current === channel) {
          console.log('[useVoice] Attempting background reconnect...');
          joinVoiceChannel(
            reconnectChannelId,
            currentUserRef.current,
            currentUserRef.current.username,
            presencePayloadRef.current.color,
            true
          );
        }
      }, RECONNECT_DELAY_MS);
    }
  };
}
