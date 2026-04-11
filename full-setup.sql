-- ============================================================
-- Vibe вЂ” FULL Supabase Schema & Initialization
-- Р—Р°РїСѓСЃС‚Рё СЌС‚РѕС‚ SQL С†РµР»РёРєРѕРј РІ Supabase Dashboard в†’ SQL Editor
-- ============================================================

-- 0. РџР Р•Р”Р’РђР РРўР•Р›Р¬РќРђРЇ РћР§РРЎРўРљРђ (РµСЃР»Рё РЅСѓР¶РЅРѕ РѕР±РЅРѕРІРёС‚СЊ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ)
-- DROP TABLE IF EXISTS invite_codes CASCADE;
-- DROP TABLE IF EXISTS server_members CASCADE;
-- DROP TABLE IF EXISTS servers CASCADE;

-- 1. РЎР•Р Р’Р•Р Р«
CREATE TABLE IF NOT EXISTS servers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  icon_url    TEXT,
  invite_code TEXT UNIQUE DEFAULT UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. РљРђРќРђР›Р« (РґРѕР±Р°РІР»СЏРµРј СЃРІСЏР·СЊ СЃ СЃРµСЂРІРµСЂРѕРј)
CREATE TABLE IF NOT EXISTS channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text', 'voice')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. РЈР§РђРЎРўРќРРљР РЎР•Р Р’Р•Р РћР’
CREATE TABLE IF NOT EXISTS server_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

-- 4. РљРћР”Р« РџР РР“Р›РђРЁР•РќРРЇ (Р”Р›РЇ Р Р•Р“РРЎРўР РђР¦РР)
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

-- 5. РџР РћР¤РР›Р
CREATE TABLE IF NOT EXISTS profiles (
  id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  color    TEXT,
  status   TEXT DEFAULT 'online',
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- 6. РЎРћРћР‘Р©Р•РќРРЇ (РљРђРќРђР›Р«)
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

-- 7. Р›РР§РќР«Р• РЎРћРћР‘Р©Р•РќРРЇ
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

-- 8. Р Р•РђРљР¦РР
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

-- Р¤СѓРЅРєС†РёСЏ РїСЂРёСЃРѕРµРґРёРЅРµРЅРёСЏ Рє СЃРµСЂРІРµСЂСѓ РїРѕ РёРЅРІР°Р№С‚Сѓ
DROP FUNCTION IF EXISTS join_server_by_invite(TEXT);
CREATE OR REPLACE FUNCTION join_server_by_invite(p_invite_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_server_record RECORD;
  v_membership    RECORD;
  v_normalized_code TEXT := REGEXP_REPLACE(UPPER(BTRIM(p_invite_code)), '[^A-Z0-9]', '', 'g');
BEGIN
  -- 1. РС‰РµРј СЃРµСЂРІРµСЂ
  SELECT *
    INTO v_server_record
    FROM servers
   WHERE REGEXP_REPLACE(UPPER(COALESCE(invite_code, '')), '[^A-Z0-9]', '', 'g') = v_normalized_code;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- 2. РџСЂРѕРІРµСЂСЏРµРј, РЅРµ СЏРІР»СЏРµС‚СЃСЏ Р»Рё СѓР¶Рµ СѓС‡Р°СЃС‚РЅРёРєРѕРј
  SELECT * INTO v_membership FROM server_members 
  WHERE server_id = v_server_record.id AND user_id = auth.uid();

  IF FOUND THEN
    RETURN jsonb_build_object('error', 'already_member');
  END IF;

  -- 3. Р”РѕР±Р°РІР»СЏРµРј СѓС‡Р°СЃС‚РЅРёРєР°
  INSERT INTO server_members (server_id, user_id, role)
  VALUES (v_server_record.id, auth.uid(), 'member');

  -- 4. Р’РѕР·РІСЂР°С‰Р°РµРј РґР°РЅРЅС‹Рµ СЃРµСЂРІРµСЂР°
  RETURN jsonb_build_object(
    'id', v_server_record.id,
    'name', v_server_record.name,
    'owner_id', v_server_record.owner_id,
    'icon_url', v_server_record.icon_url,
    'invite_code', v_server_record.invite_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION join_server_by_invite(TEXT) TO authenticated;

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

-- РўСЂРёРіРіРµСЂ РґР»СЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРіРѕ СЃРѕР·РґР°РЅРёСЏ РїСЂРѕС„РёР»СЏ

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

-- РЎРµСЂРІРµСЂС‹: РІРёРґРµС‚СЊ РјРѕРіСѓС‚ С‚РѕР»СЊРєРѕ СѓС‡Р°СЃС‚РЅРёРєРё
CREATE POLICY "РЈС‡Р°СЃС‚РЅРёРєРё РІРёРґСЏС‚ СЃРІРѕРё СЃРµСЂРІРµСЂС‹" ON servers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create their own servers" ON servers;
CREATE POLICY "Users can create their own servers" ON servers
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Server owners can update their servers" ON servers;
CREATE POLICY "Server owners can update their servers" ON servers
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Server owners can delete their servers" ON servers;
CREATE POLICY "Server owners can delete their servers" ON servers
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- РРЅРІР°Р№С‚-РєРѕРґС‹: С‡РёС‚Р°С‚СЊ РјРѕРіСѓС‚ РІСЃРµ (РґР»СЏ СЂРµРіРёСЃС‚СЂР°С†РёРё), РЅРѕ РјРµРЅСЏС‚СЊ вЂ” РЅРµС‚
CREATE POLICY "Р’СЃРµ РјРѕРіСѓС‚ РїСЂРѕРІРµСЂСЏС‚СЊ РёРЅРІР°Р№С‚С‹" ON invite_codes
  FOR SELECT USING (true);

-- РџСЂРѕС„РёР»Рё: РІРёРґРµС‚СЊ РјРѕРіСѓС‚ РІСЃРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅРЅС‹Рµ
CREATE POLICY "РђРІС‚РѕСЂРёР·РѕРІР°РЅРЅС‹Рµ РІРёРґСЏС‚ РІСЃРµ РїСЂРѕС„РёР»Рё" ON profiles
  FOR SELECT TO authenticated USING (true);

-- РЈС‡Р°СЃС‚РЅРёРєРё: РІРёРґРµС‚СЊ РјРѕРіСѓС‚ РІСЃРµ СѓС‡Р°СЃС‚РЅРёРєРё С‚РѕРіРѕ Р¶Рµ СЃРµСЂРІРµСЂР°
CREATE POLICY "РЈС‡Р°СЃС‚РЅРёРєРё РІРёРґСЏС‚ СЃРѕСЂР°С‚РЅРёРєРѕРІ РїРѕ СЃРµСЂРІРµСЂСѓ" ON server_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create owner membership for own server" ON server_members;
CREATE POLICY "Users can create owner membership for own server" ON server_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM servers s
      WHERE s.id = server_members.server_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Server owners can remove members" ON server_members;
CREATE POLICY "Server owners can remove members" ON server_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM servers s
      WHERE s.id = server_members.server_id
        AND s.owner_id = auth.uid()
    )
  );

-- РљР°РЅР°Р»С‹: РІРёРґРµС‚СЊ С‚РѕР»СЊРєРѕ СѓС‡Р°СЃС‚РЅРёРєР°Рј СЃРµСЂРІРµСЂР°
CREATE POLICY "РЈС‡Р°СЃС‚РЅРёРєРё РІРёРґСЏС‚ РєР°РЅР°Р»С‹ СЃРµСЂРІРµСЂР°" ON channels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM server_members WHERE server_id = channels.server_id AND user_id = auth.uid())
    OR server_id IS NULL -- Р“Р»РѕР±Р°Р»СЊРЅС‹Рµ РєР°РЅР°Р»С‹ (РµСЃР»Рё Р±СѓРґСѓС‚)
  );

DROP POLICY IF EXISTS "Server owners can create channels" ON channels;
CREATE POLICY "Server owners can create channels" ON channels
  FOR INSERT TO authenticated
  WITH CHECK (
    server_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM servers s
      WHERE s.id = channels.server_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Server owners can update channels" ON channels;
CREATE POLICY "Server owners can update channels" ON channels
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM servers s
      WHERE s.id = channels.server_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    server_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM servers s
      WHERE s.id = channels.server_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Server owners can delete channels" ON channels;
CREATE POLICY "Server owners can delete channels" ON channels
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM servers s
      WHERE s.id = channels.server_id
        AND s.owner_id = auth.uid()
    )
  );

-- РЎРѕРѕР±С‰РµРЅРёСЏ: РІРёРґРµС‚СЊ С‚РѕР»СЊРєРѕ СѓС‡Р°СЃС‚РЅРёРєР°Рј РєР°РЅР°Р»Р°
CREATE POLICY "РЈС‡Р°СЃС‚РЅРёРєРё РІРёРґСЏС‚ СЃРѕРѕР±С‰РµРЅРёСЏ" ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM channels c JOIN server_members sm ON c.server_id = sm.server_id WHERE c.id = messages.channel_id AND sm.user_id = auth.uid())
  );

-- Р›РЎ: С‚РѕР»СЊРєРѕ РѕС‚РїСЂР°РІРёС‚РµР»СЊ Рё РїРѕР»СѓС‡Р°С‚РµР»СЊ
CREATE POLICY "РЈС‡Р°СЃС‚РЅРёРєРё С‡РёС‚Р°СЋС‚ СЃРІРѕРё Р›РЎ" ON direct_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);


-- Private storage для вложений ЛС
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
-- Automatic message cleanup (14 days)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $cron$
DECLARE
  existing_job_id BIGINT;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('purge-old-channel-messages', 'purge-old-direct-messages')
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'purge-old-channel-messages',
    '0 * * * *',
    $$DELETE FROM public.messages WHERE created_at < now() - interval '14 days';$$
  );

  PERFORM cron.schedule(
    'purge-old-direct-messages',
    '0 * * * *',
    $$DELETE FROM public.direct_messages WHERE created_at < now() - interval '14 days';$$
  );
END
$cron$;
-- ============================================================
-- REALTIME
-- ============================================================
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE messages, profiles, direct_messages, servers, server_members, channels;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Р”РѕР±Р°РІР»СЏРµРј С‚РµСЃС‚РѕРІС‹Р№ РёРЅРІР°Р№С‚-РєРѕРґ РґР»СЏ СЂРµРіРёСЃС‚СЂР°С†РёРё
INSERT INTO invite_codes (code) VALUES ('VIBE-2026-STAR') ON CONFLICT (code) DO NOTHING;

-- Р”РѕР±Р°РІР»СЏРµРј РѕРґРёРЅ РіР»РѕР±Р°Р»СЊРЅС‹Р№ СЃРµСЂРІРµСЂ (РїРѕ Р¶РµР»Р°РЅРёСЋ) РёР»Рё РѕСЃС‚Р°РІР»СЏРµРј РїСѓСЃС‚С‹Рј РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј.






