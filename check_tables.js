import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

try {
  const env = fs.readFileSync('.env', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

  const supabase = createClient(url, key);

  // Получаем список таблиц через RPC (если доступно) или просто пробуем селекты
  const tables = ['channels', 'messages', 'profiles', 'direct_messages', 'invite_codes', 'servers', 'server_members', 'message_reactions', 'channel_last_read'];
  
  console.log('--- Проверка наличия таблиц ---');
  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(0);
    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
    } else {
      console.log(`✅ ${table}: Присутствует`);
    }
  }
  process.exit(0);
} catch (err) {
  console.error('Ошибка:', err.message);
  process.exit(1);
}
