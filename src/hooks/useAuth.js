import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  finalizeInviteReservation,
  markInviteCodeAsUsedLegacy,
  releaseInviteReservation,
  reserveInviteCode,
} from '../lib/inviteCodes';

/**
 * Хук авторизации.
 * Регистрация: email + username (отображаемое имя) + password.
 * Вход: email + password.
 */
export function useAuth() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        finalizeInviteReservation(session.user.user_metadata?.username).catch((err) => {
          console.warn('[useAuth] Не удалось завершить отложенный invite-код:', err?.message ?? err);
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        finalizeInviteReservation(session.user.user_metadata?.username).catch((err) => {
          console.warn('[useAuth] Не удалось завершить invite-код после входа:', err?.message ?? err);
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /** Принудительно обновить данные пользователя (например, после смены user_metadata) */
  const refreshUser = useCallback(async () => {
    const { data: refreshData } = await supabase.auth.refreshSession();
    if (refreshData?.session?.user) {
      setUser({ ...refreshData.session.user });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser({ ...session.user });
    }
  }, []);

  /** Отображаемое имя пользователя */
  const getUsername = (u) => u?.user_metadata?.username ?? u?.email?.split('@')[0] ?? 'Unknown';

  const mapSignUpError = (err) => {
    if (!err?.message) return 'Не удалось создать аккаунт';

    const message = err.message.toLowerCase();
    if (message.includes('already registered') || message.includes('user already registered')) {
      return 'Этот логин уже занят. Выбери другой!';
    }
    if (message.includes('password')) {
      return 'Не удалось создать аккаунт: проверь пароль и попробуй ещё раз';
    }

    return err.message;
  };

  /** Регистрация: username + password + inviteCode */
  const signUp = useCallback(async (username, password, inviteCode, rememberMe = true) => {
    setError(null);

    const cleanUsername = username?.trim();
    const cleanInviteCode = inviteCode?.trim().toUpperCase();

    if (!cleanInviteCode || cleanInviteCode.length < 4) {
      setError('Введи пригласительный код');
      return { error: true };
    }

    if (!cleanUsername || cleanUsername.length < 2) {
      setError('Логин должен быть не короче 2 символов');
      return { error: true };
    }
    if (!password || password.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return { error: true };
    }

    const inviteReservation = await reserveInviteCode(cleanInviteCode, cleanUsername);
    if (!inviteReservation.ok) {
      setError(inviteReservation.message);
      return { error: true };
    }

    // Создаем "внутренний" email из логина
    const fakeEmail = `${cleanUsername.toLowerCase()}@vibe.app`;

    // Сохраняем предпочтение перед входом
    localStorage.setItem('vibe_remember_me', rememberMe ? 'true' : 'false');

    const { error: err } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: { data: { username: cleanUsername } },
    });

    if (err) {
      if (inviteReservation.mode === 'secure') {
        await releaseInviteReservation(cleanInviteCode, inviteReservation.reservation?.token);
      }

      setError(mapSignUpError(err));
      return { error: true };
    }

    if (inviteReservation.mode === 'secure') {
      const finalizeResult = await finalizeInviteReservation(cleanUsername);
      if (finalizeResult.status === 'retry') {
        console.warn('[useAuth] Invite-код зарезервирован, но финализация будет повторена позже');
      }
    } else {
      const legacyUpdate = await markInviteCodeAsUsedLegacy(cleanInviteCode, cleanUsername);
      if (!legacyUpdate.ok) {
        console.warn('[useAuth] Не удалось надежно пометить invite-код как использованный:', legacyUpdate.error?.message ?? 'no rows updated');
      }
    }

    return { error: null };
  }, []);

  /** Вход: username + password */
  const signIn = useCallback(async (username, password, rememberMe = true) => {
    setError(null);
    
    if (!username) {
      setError('Введи логин');
      return { error: true };
    }

    const fakeEmail = `${username.trim().toLowerCase()}@vibe.app`;
    
    // Сохраняем предпочтение перед входом
    localStorage.setItem('vibe_remember_me', rememberMe ? 'true' : 'false');

    const { error: err } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password,
    });
    if (err) {
      setError('Неверный логин или пароль');
      return { error: true };
    }
    return { error: null };
  }, []);

  /** Выход */
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    user,
    username: user ? getUsername(user) : null,
    loading,
    error,
    setError,
    signUp,
    signIn,
    signOut,
    refreshUser,
  };
}
