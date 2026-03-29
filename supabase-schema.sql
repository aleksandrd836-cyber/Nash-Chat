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

-- 3. ПРОФИЛИ (связаны с auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  color    TEXT
);

-- Триггер для автоматического создания профиля после регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, color)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'user_color'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Привязка триггера
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Заполняем профили для уже существующих пользователей
INSERT INTO public.profiles (id, username, color)
SELECT id, COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1)), raw_user_meta_data->>'user_color'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 4. ЛИЧНЫЕ СООБЩЕНИЯ (DIRECT MESSAGES)
CREATE TABLE IF NOT EXISTS direct_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_username TEXT        NOT NULL,
  sender_color    TEXT,
  content         TEXT        NOT NULL,
  is_read         BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индекс для вывода диалога между двумя пользователями
CREATE INDEX IF NOT EXISTS dm_participants_idx ON direct_messages(sender_id, receiver_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Каналы: читать могут все авторизованные
DROP POLICY IF EXISTS "Авторизованные читают каналы" ON channels;
CREATE POLICY "Авторизованные читают каналы"
  ON channels FOR SELECT
  TO authenticated
  USING (true);

-- Сообщения: читать могут все авторизованные
DROP POLICY IF EXISTS "Авторизованные читают сообщения" ON messages;
CREATE POLICY "Авторизованные читают сообщения"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

-- Сообщения: писать только от своего имени
DROP POLICY IF EXISTS "Авторизованные пишут сообщения" ON messages;
CREATE POLICY "Авторизованные пишут сообщения"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Профили: читать могут все
DROP POLICY IF EXISTS "Авторизованные читают профили" ON profiles;
CREATE POLICY "Авторизованные читают профили"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Профили: редактировать может владелец
DROP POLICY IF EXISTS "Владельцы меняют свой профиль" ON profiles;
CREATE POLICY "Владельцы меняют свой профиль"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ЛС: читать могут только участники (получатель или отправитель)
DROP POLICY IF EXISTS "Участники читают свои ЛС" ON direct_messages;
CREATE POLICY "Участники читают свои ЛС"
  ON direct_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ЛС: писать могут только от своего имени (отправители)
DROP POLICY IF EXISTS "Отправители пишут ЛС" ON direct_messages;
CREATE POLICY "Отправители пишут ЛС"
  ON direct_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- ЛС: получатели могут помечать прочитанным (обновлять)
DROP POLICY IF EXISTS "Получатели обновляют свои ЛС" ON direct_messages;
CREATE POLICY "Получатели обновляют свои ЛС"
  ON direct_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- ============================================================
-- Включить Realtime
-- ============================================================
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE messages, profiles, direct_messages;

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
