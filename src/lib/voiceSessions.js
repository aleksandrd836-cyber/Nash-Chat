import { supabase } from './supabase';

export const VOICE_SESSION_STALE_MS = 90000;

const VOICE_SESSIONS_SELECT =
  'session_id, user_id, channel_id, username, color, is_muted, is_deafened, is_speaking, is_screen_sharing, last_seen, created_at';

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
      grouped[participant.channelId] = new Map();
    }

    const existing = grouped[participant.channelId].get(participant.userId);
    const existingSeenAt = Math.max(existing?.last_seen || 0, existing?.joined_at || 0);
    const participantSeenAt = Math.max(participant.last_seen || 0, participant.joined_at || 0);

    if (!existing || participantSeenAt >= existingSeenAt) {
      grouped[participant.channelId].set(participant.userId, participant);
    }
  });

  Object.keys(grouped).forEach((channelId) => {
    grouped[channelId] = Array.from(grouped[channelId].values())
      .sort((left, right) => left.joined_at - right.joined_at);
  });

  return grouped;
}

function normalizeProxyPath(path) {
  const trimmed = String(path || '').trim();
  if (!trimmed) return null;

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || null;
}

function resolveVoiceProxyBaseUrl() {
  if (typeof window === 'undefined') return null;

  const override = import.meta.env.VITE_SUPABASE_PROXY_URL;
  if (override) {
    return override.replace(/\/+$/, '');
  }

  const configuredProxyPath = import.meta.env.VITE_SUPABASE_PROXY_PATH;
  if (!configuredProxyPath) {
    return null;
  }

  const protocol = window.location?.protocol;
  const origin = window.location?.origin;
  if (!origin || origin === 'null' || (protocol !== 'http:' && protocol !== 'https:')) {
    return null;
  }

  const proxyPath = normalizeProxyPath(configuredProxyPath);
  if (!proxyPath) return null;

  return `${origin}${proxyPath}`;
}

async function getProxyAuthHeaders(extraHeaders = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    ...extraHeaders,
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return headers;
}

async function parseProxyResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (response.ok) {
    if (response.status === 204) return null;
    if (!contentType.includes('application/json')) return null;
    return response.json();
  }

  const rawBody = await response.text();
  let message = rawBody;

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawBody);
      message =
        parsed?.message ||
        parsed?.error_description ||
        parsed?.hint ||
        parsed?.error ||
        rawBody;
    } catch {}
  }

  const error = new Error(message || `Supabase proxy request failed (${response.status})`);
  error.status = response.status;
  error.responseBody = rawBody;
  throw error;
}

async function proxyVoiceRequest(path, { method = 'GET', headers = {}, body } = {}) {
  const proxyBaseUrl = resolveVoiceProxyBaseUrl();
  if (!proxyBaseUrl) {
    return null;
  }

  const response = await fetch(`${proxyBaseUrl}${path}`, {
    method,
    headers: await getProxyAuthHeaders(headers),
    body,
  });

  return parseProxyResponse(response);
}

export async function fetchActiveVoiceSessions() {
  const proxyBaseUrl = resolveVoiceProxyBaseUrl();
  if (!proxyBaseUrl) {
    const staleCutoffIso = new Date(Date.now() - VOICE_SESSION_STALE_MS).toISOString();
    const { data, error } = await supabase
      .from('voice_sessions')
      .select(VOICE_SESSIONS_SELECT)
      .gte('last_seen', staleCutoffIso);

    if (error) {
      throw error;
    }

    return buildVoiceParticipantsMap(data || []);
  }

  const staleCutoffIso = new Date(Date.now() - VOICE_SESSION_STALE_MS).toISOString();
  const query = new URLSearchParams({
    select: VOICE_SESSIONS_SELECT,
    last_seen: `gte.${staleCutoffIso}`,
  });

  const data = await proxyVoiceRequest(`/rest/v1/voice_sessions?${query.toString()}`);
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

  const proxyBaseUrl = resolveVoiceProxyBaseUrl();
  if (!proxyBaseUrl) {
    const { error } = await supabase
      .from('voice_sessions')
      .upsert(payload, { onConflict: 'session_id' });

    if (error) {
      throw error;
    }
    return;
  }

  await proxyVoiceRequest('/rest/v1/voice_sessions?on_conflict=session_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });
}

export async function removeVoiceSession(sessionId) {
  const proxyBaseUrl = resolveVoiceProxyBaseUrl();
  if (!proxyBaseUrl) {
    const { error } = await supabase
      .from('voice_sessions')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      throw error;
    }
    return;
  }

  const query = new URLSearchParams({
    session_id: `eq.${sessionId}`,
  });

  await proxyVoiceRequest(`/rest/v1/voice_sessions?${query.toString()}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });
}

export async function removeVoiceSessionsForUser(userId, excludeSessionId = null) {
  if (!userId) return;

  const proxyBaseUrl = resolveVoiceProxyBaseUrl();
  if (!proxyBaseUrl) {
    let query = supabase
      .from('voice_sessions')
      .delete()
      .eq('user_id', userId);

    if (excludeSessionId) {
      query = query.neq('session_id', excludeSessionId);
    }

    const { error } = await query;

    if (error) {
      throw error;
    }
    return;
  }

  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
  });

  if (excludeSessionId) {
    query.set('session_id', `neq.${excludeSessionId}`);
  }

  await proxyVoiceRequest(`/rest/v1/voice_sessions?${query.toString()}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });
}

export async function cleanupStaleVoiceSessions(maxAgeSeconds = 25) {
  const proxyBaseUrl = resolveVoiceProxyBaseUrl();
  if (!proxyBaseUrl) {
    const { error } = await supabase.rpc('cleanup_stale_voice_sessions', {
      p_max_age_seconds: maxAgeSeconds,
    });

    if (error) {
      throw error;
    }
    return;
  }

  await proxyVoiceRequest('/rest/v1/rpc/cleanup_stale_voice_sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_max_age_seconds: maxAgeSeconds,
    }),
  });
}
