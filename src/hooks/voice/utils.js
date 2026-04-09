export function getParticipantSessionKey(participant) {
  return participant?.sessionId ? `${participant.userId}:${participant.sessionId}` : participant?.userId;
}

export function removeParticipantSession(items, payload = {}) {
  const exactSessionKey = payload.userId && payload.sessionId
    ? `${payload.userId}:${payload.sessionId}`
    : null;

  return items.filter((participant) => {
    const participantKey = getParticipantSessionKey(participant);
    if (exactSessionKey) {
      return participantKey !== exactSessionKey;
    }
    return participant.userId !== payload.userId;
  });
}

export function normalizeRealtimeTopic(value) {
  if (!value) return '';
  return value.startsWith('realtime:') ? value.slice('realtime:'.length) : value;
}

export function isSameRealtimeTopic(channel, topic) {
  return normalizeRealtimeTopic(channel?.topic) === normalizeRealtimeTopic(topic);
}

export function resolveStableVoiceChannelId(lastStableChannelId, activeChannelId, payloadChannelId) {
  return lastStableChannelId || activeChannelId || payloadChannelId || null;
}
