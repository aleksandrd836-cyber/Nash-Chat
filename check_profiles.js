import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

try {
  const env = fs.readFileSync('.env', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

  const supabase = createClient(url, key);

  const { data: profiles, error } = await supabase.from('profiles').select('username');
  if (error) {
    console.error('Ошибка:', error.message);
  } else {
    console.log('Зарегистрированные пользователи (профили):', profiles);
  }
  process.exit(0);
} catch (err) {
  console.error('Ошибка:', err.message);
  process.exit(1);
}
