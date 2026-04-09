import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

try {
  const env = fs.readFileSync('.env', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

  const supabase = createClient(url, key);

  console.log('--- Проверка данных ---');
  
  const { data: codes } = await supabase.from('invite_codes').select('code, is_used');
  console.log('Коды приглашения:', codes);

  const { data: channels } = await supabase.from('channels').select('name');
  console.log('Каналы:', channels);

  const { data: servers } = await supabase.from('servers').select('name');
  console.log('Серверы:', servers);

  // Проверка RPC
  const { error: rpcError } = await supabase.rpc('join_server_by_invite', { p_invite_code: 'TEST' });
  if (rpcError && rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
    console.log('❌ RPC join_server_by_invite: Отсутствует');
  } else {
    console.log('✅ RPC join_server_by_invite: Присутствует (или другая ошибка)');
  }

  process.exit(0);
} catch (err) {
  console.error('Ошибка:', err.message);
  process.exit(1);
}
