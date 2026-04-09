-- ============================================================
-- Vibe: Настройка авто-удаления сообщений (14 дней)
-- Запусти этот SQL в Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Включаем расширение pg_cron (если еще не включено)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Создаем задачу на удаление старых сообщений в каналах
SELECT cron.schedule (
  'purge-old-channel-messages',
  '0 * * * *', -- Запуск каждый час для точности
  $$ 
     DELETE FROM public.messages 
     WHERE created_at < now() - interval '14 days';
  $$
);

-- 3. Создаем задачу на удаление старых личных сообщений
SELECT cron.schedule (
  'purge-old-direct-messages',
  '0 * * * *', -- Запуск каждый час
  $$ 
     DELETE FROM public.direct_messages 
     WHERE created_at < now() - interval '14 days';
  $$
);

-- Примечание: Файлы в Storage пока не удаляются автоматически этим скриптом.
-- Для полной очистки Storage рекомендуется использовать Edge Function или 
-- периодический скрипт-клиент, который находит "осиротевшие" файлы.
