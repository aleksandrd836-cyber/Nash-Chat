import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  /** Отображаемое имя пользователя */
  const getUsername = (u) => u?.user_metadata?.username ?? u?.email?.split('@')[0] ?? 'Unknown';

  /** Регистрация: email + username + password */
  const signUp = useCallback(async (email, username, password) => {
    setError(null);

    if (!email || !email.includes('@')) {
      setError('Введи корректный email');
      return { error: true };
    }
    if (!username || username.trim().length < 2) {
      setError('Имя пользователя должно быть не короче 2 символов');
      return { error: true };
    }
    if (!password || password.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return { error: true };
    }

    const { error: err } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { username: username.trim() } },
    });

    if (err) {
      if (err.message.includes('already registered') || err.message.includes('already exists')) {
        setError('Этот email уже зарегистрирован');
      } else if (
        err.message.toLowerCase().includes('rate limit') ||
        err.message.toLowerCase().includes('email rate') ||
        err.message.toLowerCase().includes('over_email_send_rate_limit')
      ) {
        setError('Превышен лимит писем Supabase. Открой Supabase Dashboard → Authentication → Providers → Email → выключи "Confirm email" → сохрани. После этого регистрация заработает без писем.');
      } else {
        setError(err.message);
      }
      return { error: true };
    }
    return { error: null };
  }, []);

  /** Вход: email + password */
  const signIn = useCallback(async (email, password) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (err) {
      setError('Неверный email или пароль');
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
  };
}
