export function createGlobalParticipantsUpdater({
  channel,
  currentUserRef,
  isLeavingRef,
  buildParticipantMapFromPresenceState,
  mutateRealtimeParticipants,
}) {
  return () => {
    if (channel.state !== 'joined' || isLeavingRef.current) return;

    const nextParticipants = buildParticipantMapFromPresenceState(channel.presenceState(), {
      currentUserId: currentUserRef.current?.id,
      isLeaving: isLeavingRef.current,
      now: Date.now(),
    });

    mutateRealtimeParticipants(() => nextParticipants);
  };
}

export function createGlobalPresenceLeaveHandler({
  mutateRealtimeParticipants,
  removeSessionFromParticipantMap,
  updateAllParticipants,
}) {
  return ({ leftPresences, key }) => {
    const leavingSessions = (
      leftPresences && leftPresences.length > 0 ? leftPresences : [{ userId: key }]
    ).map((presence) => ({
      userId: presence.userId || key,
      sessionId: presence.sessionId,
    }));

    mutateRealtimeParticipants((prev) =>
      leavingSessions.reduce(
        (items, leavingPresence) => removeSessionFromParticipantMap(items, leavingPresence),
        prev
      )
    );

    updateAllParticipants();
  };
}

export function createGlobalPresenceStatusHandler({
  channel,
  cancelledRef,
  globalPresenceRef,
  currentUserRef,
  activeChannelIdRef,
  presencePayloadRef,
  sessionIdRef,
  isLeavingRef,
  RECONNECT_DELAY_MS,
  scheduleRecovery,
}) {
  return async (status) => {
    if (channel !== globalPresenceRef.current) return;

    console.log(`[useVoice] Global channel status: ${status}`);
    if (status === 'SUBSCRIBED') {
      if (currentUserRef.current?.id && activeChannelIdRef.current) {
        await channel.track({
          ...presencePayloadRef.current,
          channelId: activeChannelIdRef.current,
          joined_at: presencePayloadRef.current.joined_at || Date.now(),
          sessionId: sessionIdRef.current,
          last_seen: Date.now(),
        }).catch(() => {});
      }
      return;
    }

    if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
      if (!cancelledRef.current && !isLeavingRef.current) {
        console.log('[useVoice] Global channel actually lost, recovering in 4s...');
        scheduleRecovery(RECONNECT_DELAY_MS, () => {
          if (
            !cancelledRef.current &&
            !isLeavingRef.current &&
            globalPresenceRef.current === channel
          ) {
            return true;
          }
          return false;
        });
      }
    }
  };
}
