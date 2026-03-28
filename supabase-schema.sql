-- ============================================================
-- FriendChat — Supabase Schema
-- Запусти этот SQL в Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. КАНАЛЫ (заранее созданные, не редактируются пользователями)
CREATE TABLE IF NOT EXISTS channels (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('text', 'voice')),
  position INTEGER NOT NULL DEFAULT 0
);

-- 2. СООБЩЕНИЯ
CREATE TABLE IF NOT EXISTS messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индекс для быстрой выборки сообщений канала по времени
CREATE INDEX IF NOT EXISTS messages_channel_created ON messages(channel_id, created_at);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Каналы: читать могут все авторизованные
CREATE POLICY "Авторизованные читают каналы"
  ON channels FOR SELECT
  TO authenticated
  USING (true);

-- Сообщения: читать могут все авторизованные
CREATE POLICY "Авторизованные читают сообщения"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

-- Сообщения: писать только от своего имени
CREATE POLICY "Авторизованные пишут сообщения"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Включить Realtime для таблицы messages
-- (нужно также включить в Supabase Dashboard → Database → Replication)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- Seed: стартовые каналы
-- ============================================================
INSERT INTO channels (name, type, position) VALUES
  ('общий',      'text',  1),
  ('игры',       'text',  2),
  ('мемы',       'text',  3),
  ('оффтоп',     'text',  4),
  ('голосовой-1','voice', 5),
  ('голосовой-2','voice', 6),
  ('игровой',    'voice', 7)
ON CONFLICT DO NOTHING;
