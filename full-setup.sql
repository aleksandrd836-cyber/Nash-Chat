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
  reserved_at      TIMESTAMPTZ,
  reserved_by_username TEXT,
  reservation_token TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS reserved_by_username TEXT;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS reservation_token TEXT;

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

CREATE OR REPLACE FUNCTION reserve_invite_code(p_code TEXT, p_username TEXT)
RETURNS JSONB AS $$
DECLARE
  v_invite invite_codes%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_username TEXT := NULLIF(BTRIM(p_username), '');
  v_token TEXT;
BEGIN
  SELECT *
    INTO v_invite
    FROM invite_codes
   WHERE UPPER(code) = UPPER(BTRIM(p_code))
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_invite.is_used THEN
    RETURN jsonb_build_object('error', 'already_used');
  END IF;

  IF v_invite.reservation_token IS NOT NULL
     AND v_invite.reserved_at IS NOT NULL
     AND v_invite.reserved_at > (v_now - INTERVAL '15 minutes') THEN
    IF v_invite.reserved_by_username IS NOT DISTINCT FROM v_username THEN
      RETURN jsonb_build_object(
        'reservation_token', v_invite.reservation_token,
        'expires_at', v_invite.reserved_at + INTERVAL '15 minutes'
      );
    END IF;

    RETURN jsonb_build_object('error', 'reserved');
  END IF;

  v_token := gen_random_uuid()::TEXT;

  UPDATE invite_codes
     SET reserved_at = v_now,
         reserved_by_username = v_username,
         reservation_token = v_token
   WHERE UPPER(code) = UPPER(BTRIM(p_code));

  RETURN jsonb_build_object(
    'reservation_token', v_token,
    'expires_at', v_now + INTERVAL '15 minutes'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION release_invite_code_reservation(p_code TEXT, p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_invite invite_codes%ROWTYPE;
BEGIN
  SELECT *
    INTO v_invite
    FROM invite_codes
   WHERE UPPER(code) = UPPER(BTRIM(p_code))
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_invite.is_used THEN
    RETURN jsonb_build_object('status', 'already_used');
  END IF;

  IF v_invite.reservation_token IS DISTINCT FROM NULLIF(BTRIM(p_token), '') THEN
    RETURN jsonb_build_object('error', 'token_mismatch');
  END IF;

  UPDATE invite_codes
     SET reserved_at = NULL,
         reserved_by_username = NULL,
         reservation_token = NULL
   WHERE UPPER(code) = UPPER(BTRIM(p_code));

  RETURN jsonb_build_object('status', 'released');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION finalize_invite_code_reservation(p_code TEXT, p_token TEXT, p_username TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_invite invite_codes%ROWTYPE;
  v_username TEXT := NULLIF(BTRIM(p_username), '');
BEGIN
  SELECT *
    INTO v_invite
    FROM invite_codes
   WHERE UPPER(code) = UPPER(BTRIM(p_code))
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_invite.is_used THEN
    RETURN jsonb_build_object('status', 'already_used');
  END IF;

  IF v_invite.reservation_token IS DISTINCT FROM NULLIF(BTRIM(p_token), '') THEN
    RETURN jsonb_build_object('error', 'token_mismatch');
  END IF;

  UPDATE invite_codes
     SET is_used = true,
         used_at = NOW(),
         used_by_username = COALESCE(v_username, v_invite.reserved_by_username),
         reserved_at = NULL,
         reserved_by_username = NULL,
         reservation_token = NULL
   WHERE UPPER(code) = UPPER(BTRIM(p_code));

  RETURN jsonb_build_object('status', 'finalized');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION reserve_invite_code(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION release_invite_code_reservation(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_invite_code_reservation(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Триггер для автоматического создания профиля

CREATE OR REPLACE FUNCTION update_current_user_profile(p_username TEXT, p_color TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_username TEXT := NULLIF(BTRIM(p_username), '');
  v_color TEXT := NULLIF(BTRIM(p_color), '');
  v_db_username TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'authentication_required');
  END IF;

  IF v_username IS NULL OR char_length(v_username) < 2 THEN
    RETURN jsonb_build_object('error', 'minimum_username_length');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM profiles
     WHERE LOWER(username) = LOWER(v_username)
       AND id <> v_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'username_taken');
  END IF;

  v_db_username := CASE
    WHEN v_color IS NOT NULL THEN v_username || '@@' || v_color
    ELSE v_username
  END;

  INSERT INTO profiles (id, username, color)
  VALUES (v_user_id, v_username, v_color)
  ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username,
        color = EXCLUDED.color;

  UPDATE messages
     SET username = v_db_username
   WHERE user_id = v_user_id;

  UPDATE direct_messages
     SET sender_username = v_username,
         sender_color = v_color
   WHERE sender_id = v_user_id;

  UPDATE auth.users
     SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object('username', v_username, 'user_color', v_color)
   WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'username', v_username,
    'color', v_color
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION update_current_user_profile(TEXT, TEXT) TO authenticated;
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


-- Private storage ��� �������� ��
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dm-attachments-private', 'dm-attachments-private', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "DM participants can view private attachments" ON storage.objects;
CREATE POLICY "DM participants can view private attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dm-attachments-private'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "DM participants can upload private attachments" ON storage.objects;
CREATE POLICY "DM participants can upload private attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dm-attachments-private'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "DM participants can delete private attachments" ON storage.objects;
CREATE POLICY "DM participants can delete private attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'dm-attachments-private'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );
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





