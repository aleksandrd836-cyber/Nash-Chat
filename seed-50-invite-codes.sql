-- ============================================================
-- Vibe — Seed 50 fresh invite codes
-- Запусти этот SQL в Supabase SQL Editor.
-- Он добавит ровно 50 новых неиспользованных invite-кодов.
-- ============================================================

DO $$
DECLARE
  v_code TEXT;
  v_inserted_count INTEGER := 0;
  v_row_count INTEGER := 0;
BEGIN
  WHILE v_inserted_count < 50 LOOP
    v_code := UPPER(
      SUBSTR(md5(random()::text || clock_timestamp()::text || v_inserted_count::text), 1, 4) || '-' ||
      SUBSTR(md5(clock_timestamp()::text || random()::text || (v_inserted_count + 137)::text), 1, 4) || '-' ||
      SUBSTR(md5((v_inserted_count + 911)::text || random()::text || clock_timestamp()::text), 1, 4)
    );

    INSERT INTO invite_codes (
      code,
      is_used,
      used_at,
      used_by_username,
      reserved_at,
      reserved_by_username,
      reservation_token
    )
    VALUES (
      v_code,
      FALSE,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (code) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 1 THEN
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;
END $$;

SELECT code, is_used
FROM invite_codes
WHERE is_used = FALSE
ORDER BY code
LIMIT 100;
