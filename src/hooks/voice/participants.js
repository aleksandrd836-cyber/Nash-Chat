import { removeParticipantSession } from './utils';

export const PARTICIPANT_STALE_MS = 60000;

export function updateParticipantSpeakingMap(prev, userId, isSpeaking) {
  const next = { ...prev };
  let changed = false;

  Object.keys(next).forEach((channelId) => {
    next[channelId] = next[channelId].map((participant) => {
      if (participant.userId === userId && participant.isSpeaking !== isSpeaking) {
        changed = true;
        return { ...participant, isSpeaking };
      }
      return participant;
    });
  });

  return changed ? next : prev;
}

export function removeSessionFromParticipantMap(prev, payload) {
  const next = { ...prev };
  let changed = false;

  Object.keys(next).forEach((channelId) => {
    const filtered = removeParticipantSession(next[channelId], payload);
    if (filtered.length !== next[channelId].length) {
      next[channelId] = filtered;
      if (next[channelId].length === 0) delete next[channelId];
      changed = true;
    }
  });

  return changed ? next : prev;
}

export function pruneStaleParticipantMap(prev, now = Date.now(), staleMs = PARTICIPANT_STALE_MS) {
  const next = { ...prev };
  let removedCount = 0;

  Object.keys(next).forEach((channelId) => {
    const before = next[channelId].length;
    next[channelId] = next[channelId].filter((participant) => (
      !participant.last_seen || (now - participant.last_seen < staleMs)
    ));
    removedCount += before - next[channelId].length;
    if (next[channelId].length === 0) delete next[channelId];
  });

  return removedCount > 0 ? next : prev;
}

export function appendParticipantToChannel(prev, channelId, participant) {
  const next = { ...prev };
  const currentInChannel = next[channelId] || [];
  const exists = currentInChannel.some((item) => (
    item.userId === participant.userId && item.sessionId === participant.sessionId
  ));

  if (exists) {
    return prev;
  }

  next[channelId] = [...currentInChannel, participant];
  return next;
}

export function buildParticipantMapFromPresenceState(state, {
  currentUserId = null,
  isLeaving = false,
  now = Date.now(),
  staleMs = PARTICIPANT_STALE_MS,
} = {}) {
  const latestUsers = new Map();

  Object.values(state).flat().forEach((presence) => {
    if (!presence.userId || !presence.username) return;
    if (isLeaving && presence.userId === currentUserId) return;
    if (presence.last_seen && (now - presence.last_seen > staleMs)) return;

    const existing = latestUsers.get(presence.userId);
    const existingSeenAt = Math.max(existing?.last_seen || 0, existing?.joined_at || 0);
    const presenceSeenAt = Math.max(presence.last_seen || 0, presence.joined_at || 0);

    if (!existing || presenceSeenAt >= existingSeenAt) {
      latestUsers.set(presence.userId, presence);
    }
  });

  const finalMap = {};
  latestUsers.forEach((presence) => {
    if (!presence.channelId) return;
    if (!finalMap[presence.channelId]) {
      finalMap[presence.channelId] = [];
    }

    finalMap[presence.channelId].push({
      userId: presence.userId,
      username: presence.username,
      color: presence.color,
      isScreenSharing: presence.isScreenSharing,
      isSpeaking: !!presence.isSpeaking,
      isMuted: !!presence.isMuted,
      isDeafened: !!presence.isDeafened,
      joined_at: presence.joined_at,
      last_seen: presence.last_seen,
      sessionId: presence.sessionId,
    });
  });

  Object.keys(finalMap).forEach((channelId) => {
    finalMap[channelId].sort((left, right) => left.joined_at - right.joined_at);
  });

  return finalMap;
}
