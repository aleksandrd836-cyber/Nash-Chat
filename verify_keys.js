import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

try {
  const env = fs.readFileSync('.env', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

  if (!url || !key) {
    console.error('❌ Ошибка: Не удалось прочитать VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY из .env');
    process.exit(1);
  }

  console.log('Проверка подключения к:', url);

  const supabase = createClient(url, key);

  const { data, error } = await supabase.from('channels').select('*').limit(1);

  if (error) {
    console.error('❌ Подключение не удалось:', error.message);
    process.exit(1);
  } else {
    console.log('✅ Подключение успешно! База данных доступна.');
    console.log('Данные каналов получены:', data);
    process.exit(0);
  }
} catch (err) {
  console.error('❌ Ошибка выполнения скрипта:', err.message);
  process.exit(1);
}
