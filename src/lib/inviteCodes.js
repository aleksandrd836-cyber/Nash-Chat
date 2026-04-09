import { supabase } from './supabase';

const PENDING_INVITE_KEY = 'vibe_pending_invite_claim';
const INVITE_RESERVATION_TTL_MS = 15 * 60 * 1000;

const normalizeInviteCode = (code) => code?.trim().toUpperCase() ?? '';
const normalizeUsername = (username) => username?.trim() ?? '';

const isMissingRpcError = (error) => {
  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return error?.code === 'PGRST202'
    || errorText.includes('could not find the function')
    || errorText.includes('does not exist');
};

const readPendingInviteClaim = () => {
  try {
    const raw = localStorage.getItem(PENDING_INVITE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.code || !parsed?.token) {
      localStorage.removeItem(PENDING_INVITE_KEY);
      return null;
    }

    if (parsed.savedAt && (Date.now() - parsed.savedAt > INVITE_RESERVATION_TTL_MS)) {
      localStorage.removeItem(PENDING_INVITE_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(PENDING_INVITE_KEY);
    return null;
  }
};

const writePendingInviteClaim = (claim) => {
  localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({
    ...claim,
    savedAt: Date.now(),
  }));
};

const clearPendingInviteClaim = () => {
  localStorage.removeItem(PENDING_INVITE_KEY);
};

const mapInviteError = (error) => {
  switch (error) {
    case 'not_found':
      return 'Неверный код приглашения';
    case 'already_used':
      return 'Этот код уже был использован';
    case 'reserved':
      return 'Этот код сейчас подтверждается другим пользователем. Попробуй ещё раз через пару минут';
    default:
      return 'Не удалось проверить код приглашения. Попробуй ещё раз';
  }
};

const runLegacyInviteCheck = async (inviteCode) => {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('code, is_used')
    .eq('code', inviteCode)
    .single();

  if (error || !data) {
    return { ok: false, mode: 'legacy', message: mapInviteError('not_found') };
  }

  if (data.is_used) {
    return { ok: false, mode: 'legacy', message: mapInviteError('already_used') };
  }

  return { ok: true, mode: 'legacy', code: inviteCode };
};

export async function reserveInviteCode(inviteCode, username) {
  const normalizedCode = normalizeInviteCode(inviteCode);
  const normalizedUsername = normalizeUsername(username);

  try {
    const { data, error } = await supabase.rpc('reserve_invite_code', {
      p_code: normalizedCode,
      p_username: normalizedUsername,
    });

    if (error) {
      if (isMissingRpcError(error)) {
        return runLegacyInviteCheck(normalizedCode);
      }
      return { ok: false, mode: 'secure', message: mapInviteError() };
    }

    if (data?.error) {
      return { ok: false, mode: 'secure', message: mapInviteError(data.error) };
    }

    if (!data?.reservation_token) {
      return { ok: false, mode: 'secure', message: mapInviteError() };
    }

    const reservation = {
      code: normalizedCode,
      username: normalizedUsername,
      token: data.reservation_token,
      expiresAt: data.expires_at ?? null,
    };

    writePendingInviteClaim(reservation);

    return {
      ok: true,
      mode: 'secure',
      code: normalizedCode,
      reservation,
    };
  } catch {
    return { ok: false, mode: 'secure', message: mapInviteError() };
  }
}

export async function releaseInviteReservation(inviteCode, token) {
  clearPendingInviteClaim();

  if (!inviteCode || !token) return;

  try {
    const { error } = await supabase.rpc('release_invite_code_reservation', {
      p_code: normalizeInviteCode(inviteCode),
      p_token: token,
    });

    if (error && !isMissingRpcError(error)) {
      console.warn('[inviteCodes] Не удалось освободить зарезервированный код:', error.message);
    }
  } catch (error) {
    console.warn('[inviteCodes] Ошибка освобождения invite-кода:', error?.message ?? error);
  }
}

export async function finalizeInviteReservation(usernameOverride = null) {
  const pendingClaim = readPendingInviteClaim();
  if (!pendingClaim) {
    return { status: 'none' };
  }

  try {
    const { data, error } = await supabase.rpc('finalize_invite_code_reservation', {
      p_code: pendingClaim.code,
      p_token: pendingClaim.token,
      p_username: normalizeUsername(usernameOverride || pendingClaim.username),
    });

    if (error) {
      if (isMissingRpcError(error)) {
        clearPendingInviteClaim();
        return { status: 'missing_rpc' };
      }

      return { status: 'retry', error };
    }

    if (data?.status === 'finalized' || data?.status === 'already_used') {
      clearPendingInviteClaim();
      return { status: data.status };
    }

    if (data?.error === 'already_used' || data?.error === 'not_found') {
      clearPendingInviteClaim();
      return { status: data.error };
    }

    return { status: 'retry', error: data?.error ?? 'unknown' };
  } catch (error) {
    return { status: 'retry', error };
  }
}

export async function markInviteCodeAsUsedLegacy(inviteCode, username) {
  const normalizedCode = normalizeInviteCode(inviteCode);
  const normalizedUsername = normalizeUsername(username);

  const { data, error } = await supabase
    .from('invite_codes')
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
      used_by_username: normalizedUsername,
    })
    .eq('code', normalizedCode)
    .eq('is_used', false)
    .select('id');

  if (error) {
    return { ok: false, error };
  }

  return { ok: Boolean(data?.length) };
}
