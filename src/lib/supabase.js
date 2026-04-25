import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to .env and fill the values from Supabase Dashboard.'
  );
}

if (localStorage.getItem('vibe_remember_me') === null) {
  localStorage.setItem('vibe_remember_me', 'true');
}

const customStorage = {
  getItem: (key) => {
    const useLocal = localStorage.getItem('vibe_remember_me') !== 'false';
    if (useLocal) {
      return localStorage.getItem(key);
    }

    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  },
  setItem: (key, value) => {
    const useLocal = localStorage.getItem('vibe_remember_me') !== 'false';
    if (useLocal) {
      localStorage.setItem(key, value);
    } else {
      sessionStorage.setItem(key, value);
    }
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    worker: typeof window !== 'undefined' && typeof window.Worker !== 'undefined',
  },
});
