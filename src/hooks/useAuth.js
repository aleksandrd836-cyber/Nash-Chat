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

  /** Принудительно обновить данные пользователя (например, после смены user_metadata) */
  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) setUser({ ...session.user });
  }, []);

  /** Отображаемое имя пользователя */
  const getUsername = (u) => u?.user_metadata?.username ?? u?.email?.split('@')[0] ?? 'Unknown';

  /** Регистрация: username + password + inviteCode */
  const signUp = useCallback(async (username, password, inviteCode, rememberMe = true) => {
    setError(null);

    if (!inviteCode || inviteCode.trim().length < 4) {
      setError('Введи пригласительный код');
      return { error: true };
    }

    if (!username || username.trim().length < 2) {
      setError('Логин должен быть не короче 2 символов');
      return { error: true };
    }
    if (!password || password.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return { error: true };
    }

    // 1. Проверяем код в базе данных
    const { data: codeData, error: codeErr } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', inviteCode.trim())
      .single();

    if (codeErr || !codeData) {
      setError('Неверный код приглашения');
      return { error: true };
    }

    if (codeData.is_used) {
      setError('Этот код уже был использован');
      return { error: true };
    }

    // Создаем "внутренний" email из логина
    const fakeEmail = `${username.trim().toLowerCase()}@vibe.app`;

    // Сохраняем предпочтение перед входом
    localStorage.setItem('vibe_remember_me', rememberMe ? 'true' : 'false');

    // 2. Создаем пользователя
    const { error: err } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: { data: { username: username.trim() } },
    });

    if (err) {
      if (err.message.includes('already registered')) {
        setError('Этот логин уже занят. Выбери другой!');
      } else {
        setError(err.message);
      }
      return { error: true };
    }

    // 3. Помечаем код как использованный
    await supabase
      .from('invite_codes')
      .update({ 
        is_used: true, 
        used_at: new Date().toISOString(), 
        used_by_username: username.trim() 
      })
      .eq('code', inviteCode.trim());

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
