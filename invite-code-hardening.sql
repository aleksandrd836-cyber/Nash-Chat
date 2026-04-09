-- ============================================================
-- Vibe — Invite Code Hardening Migration
-- Применяй этот SQL к уже существующей базе Vibe.
-- Он делает регистрацию безопаснее:
-- 1) код сначала резервируется,
-- 2) потом пользователь создаётся,
-- 3) затем резервирование финализируется.
-- ============================================================

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS reserved_by_username TEXT;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS reservation_token TEXT;

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
