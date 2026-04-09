import { supabase } from './supabase';

function mapProfileUpdateError(error) {
  const message = error?.message?.toLowerCase?.() ?? '';

  if (message.includes('username_taken')) {
    return 'Этот ник уже занят';
  }

  if (message.includes('minimum_username_length')) {
    return 'Минимум 2 символа';
  }

  if (message.includes('authentication')) {
    return 'Нужно заново войти в аккаунт';
  }

  return error?.message || 'Не удалось сохранить профиль';
}

async function updateProfileLegacy(userId, username, color) {
  const cleanColor = color || null;
  const dbUsername = cleanColor ? `${username}@@${cleanColor}` : username;

  const { error: authError } = await supabase.auth.updateUser({
    data: { username, user_color: cleanColor },
  });

  if (authError) {
    throw authError;
  }

  const [messagesResult, profilesResult, directMessagesResult] = await Promise.all([
    supabase.from('messages').update({ username: dbUsername }).eq('user_id', userId),
    supabase.from('profiles').upsert({ id: userId, username, color: cleanColor }),
    supabase.from('direct_messages').update({ sender_username: username, sender_color: cleanColor }).eq('sender_id', userId),
  ]);

  const updateError = messagesResult.error || profilesResult.error || directMessagesResult.error;
  if (updateError) {
    throw updateError;
  }

  return {
    username,
    color: cleanColor,
  };
}

export async function updateCurrentUserProfile(userId, username, color) {
  const cleanUsername = username?.trim();
  const cleanColor = color || null;

  const { data, error } = await supabase.rpc('update_current_user_profile', {
    p_username: cleanUsername,
    p_color: cleanColor,
  });

  if (!error) {
    if (data?.error) {
      return {
        ok: false,
        message: mapProfileUpdateError({ message: data.error }),
        code: data.error,
      };
    }

    return {
      ok: true,
      profile: {
        username: data?.username ?? cleanUsername,
        color: data?.color ?? cleanColor,
      },
      mode: 'secure',
    };
  }

  const isMissingRpc =
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.message?.toLowerCase?.().includes('update_current_user_profile');

  if (!isMissingRpc) {
    return {
      ok: false,
      message: mapProfileUpdateError(error),
      code: error.code,
    };
  }

  try {
    const profile = await updateProfileLegacy(userId, cleanUsername, cleanColor);
    return {
      ok: true,
      profile,
      mode: 'legacy',
    };
  } catch (legacyError) {
    return {
      ok: false,
      message: mapProfileUpdateError(legacyError),
      code: legacyError?.code,
    };
  }
}
