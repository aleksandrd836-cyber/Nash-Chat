CREATE TABLE IF NOT EXISTS voice_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  color TEXT,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_deafened BOOLEAN NOT NULL DEFAULT false,
  is_speaking BOOLEAN NOT NULL DEFAULT false,
  is_screen_sharing BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_channel_last_seen
  ON voice_sessions(channel_id, last_seen DESC);

ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read voice sessions" ON voice_sessions;
CREATE POLICY "Authenticated users can read voice sessions"
  ON voice_sessions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own voice sessions" ON voice_sessions;
CREATE POLICY "Users can insert their own voice sessions"
  ON voice_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own voice sessions" ON voice_sessions;
CREATE POLICY "Users can update their own voice sessions"
  ON voice_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own voice sessions" ON voice_sessions;
CREATE POLICY "Users can delete their own voice sessions"
  ON voice_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION cleanup_stale_voice_sessions(p_max_age_seconds INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  WITH deleted_rows AS (
    DELETE FROM voice_sessions
    WHERE last_seen < timezone('utc', now()) - make_interval(secs => GREATEST(p_max_age_seconds, 5))
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_count
  FROM deleted_rows;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION cleanup_stale_voice_sessions(INTEGER) TO authenticated;
