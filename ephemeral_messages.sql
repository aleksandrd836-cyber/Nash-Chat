-- ============================================================
-- Vibe: automatic message cleanup (14 days)
-- Run this SQL in Supabase Dashboard -> SQL Editor
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

-- Note:
-- Storage files are not deleted by this cron job.
-- If full attachment cleanup is needed, add a separate Edge Function
-- or scheduled cleanup script for orphaned files in Storage.
