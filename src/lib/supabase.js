import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Не найдены переменные окружения VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY.\n' +
    'Скопируй .env.example в .env и заполни данными из Supabase Dashboard.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
