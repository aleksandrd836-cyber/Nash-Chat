-- ============================================================
-- Vibe — Profile Update Hardening
-- Применяй этот SQL к уже существующей базе Vibe.
-- Он делает смену ника и цвета атомарной на стороне базы:
-- profiles + messages + direct_messages + auth.users metadata.
-- ============================================================

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
