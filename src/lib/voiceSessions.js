import { supabase } from './supabase';

export const VOICE_SESSION_STALE_MS = 25000;

function mapVoiceSessionRow(row) {
  return {
    userId: row.user_id,
    username: row.username,
    color: row.color,
    isScreenSharing: !!row.is_screen_sharing,
    isSpeaking: !!row.is_speaking,
    isMuted: !!row.is_muted,
    isDeafened: !!row.is_deafened,
    joined_at: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    last_seen: row.last_seen ? new Date(row.last_seen).getTime() : Date.now(),
    sessionId: row.session_id,
    channelId: row.channel_id,
  };
}

export function buildVoiceParticipantsMap(rows = []) {
  const grouped = {};

  rows.forEach((row) => {
    const participant = mapVoiceSessionRow(row);
    if (!participant.channelId) return;

    if (!grouped[participant.channelId]) {
      grouped[participant.channelId] = [];
    }

    grouped[participant.channelId].push(participant);
  });

  Object.keys(grouped).forEach((channelId) => {
    grouped[channelId].sort((left, right) => left.joined_at - right.joined_at);
  });

  return grouped;
}

export async function fetchActiveVoiceSessions() {
  const staleCutoffIso = new Date(Date.now() - VOICE_SESSION_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from('voice_sessions')
    .select('session_id, user_id, channel_id, username, color, is_muted, is_deafened, is_speaking, is_screen_sharing, last_seen, created_at')
    .gte('last_seen', staleCutoffIso);

  if (error) {
    throw error;
  }

  return buildVoiceParticipantsMap(data || []);
}

export async function upsertVoiceSession(session) {
  const payload = {
    session_id: session.sessionId,
    user_id: session.userId,
    channel_id: session.channelId,
    username: session.username,
    color: session.color || null,
    is_muted: !!session.isMuted,
    is_deafened: !!session.isDeafened,
    is_speaking: !!session.isSpeaking,
    is_screen_sharing: !!session.isScreenSharing,
    last_seen: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('voice_sessions')
    .upsert(payload, { onConflict: 'session_id' });

  if (error) {
    throw error;
  }
}

export async function removeVoiceSession(sessionId) {
  const { error } = await supabase
    .from('voice_sessions')
    .delete()
    .eq('session_id', sessionId);

  if (error) {
    throw error;
  }
}

export async function cleanupStaleVoiceSessions(maxAgeSeconds = 25) {
  const { error } = await supabase.rpc('cleanup_stale_voice_sessions', {
    p_max_age_seconds: maxAgeSeconds,
  });

  if (error) {
    throw error;
  }
}
