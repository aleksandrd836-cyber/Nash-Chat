-- ============================================================
-- Vibe — FULL Supabase Schema & Initialization
-- Запусти этот SQL целиком в Supabase Dashboard → SQL Editor
-- ============================================================

-- 0. ПРЕДВАРИТЕЛЬНАЯ ОЧИСТКА (если нужно обновить существующие)
-- DROP TABLE IF EXISTS invite_codes CASCADE;
-- DROP TABLE IF EXISTS server_members CASCADE;
-- DROP TABLE IF EXISTS servers CASCADE;

-- 1. СЕРВЕРЫ
CREATE TABLE IF NOT EXISTS servers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  icon_url    TEXT,
  invite_code TEXT UNIQUE DEFAULT UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. КАНАЛЫ (добавляем связь с сервером)
CREATE TABLE IF NOT EXISTS channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text', 'voice')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. УЧАСТНИКИ СЕРВЕРОВ
CREATE TABLE IF NOT EXISTS server_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

-- 4. КОДЫ ПРИГЛАШЕНИЯ (ДЛЯ РЕГИСТРАЦИИ)
CREATE TABLE IF NOT EXISTS invite_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  is_used          BOOLEAN NOT NULL DEFAULT false,
  used_at          TIMESTAMPTZ,
  used_by_username TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ПРОФИЛИ
CREATE TABLE IF NOT EXISTS profiles (
  id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  color    TEXT,
  status   TEXT DEFAULT 'online',
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- 6. СООБЩЕНИЯ (КАНАЛЫ)
CREATE TABLE IF NOT EXISTS messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  image_url  TEXT,
  file_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. ЛИЧНЫЕ СООБЩЕНИЯ
CREATE TABLE IF NOT EXISTS direct_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_username TEXT        NOT NULL,
  sender_color    TEXT,
  content         TEXT        NOT NULL,
  is_read         BOOLEAN     NOT NULL DEFAULT false,
  image_url       TEXT,
  file_name       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. РЕАКЦИИ
CREATE TABLE IF NOT EXISTS message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE TABLE IF NOT EXISTS direct_message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- ============================================================
-- FUNCTIONS & RPC
-- ============================================================

-- Функция присоединения к серверу по инвайту
CREATE OR REPLACE FUNCTION join_server_by_invite(p_invite_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_server_record RECORD;
  v_membership    RECORD;
BEGIN
  -- 1. Ищем сервер
  SELECT * INTO v_server_record FROM servers WHERE UPPER(invite_code) = UPPER(p_invite_code);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- 2. Проверяем, не является ли уже участником
  SELECT * INTO v_membership FROM server_members 
  WHERE server_id = v_server_record.id AND user_id = auth.uid();

  IF FOUND THEN
    RETURN jsonb_build_object('error', 'already_member');
  END IF;

  -- 3. Добавляем участника
  INSERT INTO server_members (server_id, user_id, role)
  VALUES (v_server_record.id, auth.uid(), 'member');

  -- 4. Возвращаем данные сервера
  RETURN jsonb_build_object(
    'id', v_server_record.id,
    'name', v_server_record.name,
    'owner_id', v_server_record.owner_id,
    'icon_url', v_server_record.icon_url,
    'invite_code', v_server_record.invite_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер для автоматического создания профиля
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Серверы: видеть могут только участники
CREATE POLICY "Участники видят свои серверы" ON servers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = id AND user_id = auth.uid())
  );

-- Инвайт-коды: читать могут все (для регистрации), но менять — нет
CREATE POLICY "Все могут проверять инвайты" ON invite_codes
  FOR SELECT USING (true);

-- Профили: видеть могут все авторизованные
CREATE POLICY "Авторизованные видят все профили" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Участники: видеть могут все участники того же сервера
CREATE POLICY "Участники видят соратников по серверу" ON server_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid())
  );

-- Каналы: видеть только участникам сервера
CREATE POLICY "Участники видят каналы сервера" ON channels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = channels.server_id AND user_id = auth.uid())
    OR server_id IS NULL -- Глобальные каналы (если будут)
  );

-- Сообщения: видеть только участникам канала
CREATE POLICY "Участники видят сообщения" ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM channels c JOIN server_members sm ON c.server_id = sm.server_id WHERE c.id = messages.channel_id AND sm.user_id = auth.uid())
  );

-- ЛС: только отправитель и получатель
CREATE POLICY "Участники читают свои ЛС" ON direct_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ============================================================
-- REALTIME
-- ============================================================
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE messages, profiles, direct_messages, servers, server_members, channels;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Добавляем тестовый инвайт-код для регистрации
INSERT INTO invite_codes (code) VALUES ('VIBE-2026-STAR') ON CONFLICT (code) DO NOTHING;

-- Добавляем один глобальный сервер (по желанию) или оставляем пустым для создания пользователем.
