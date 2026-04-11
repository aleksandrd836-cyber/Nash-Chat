-- Vibe — channel management RLS hardening
-- Apply this in Supabase SQL Editor if channel creation/rename/delete fails with code 42501.

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server owners can create channels" ON public.channels;
CREATE POLICY "Server owners can create channels"
  ON public.channels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    server_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = public.channels.server_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Server owners can update channels" ON public.channels;
CREATE POLICY "Server owners can update channels"
  ON public.channels
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = public.channels.server_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    server_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = public.channels.server_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Server owners can delete channels" ON public.channels;
CREATE POLICY "Server owners can delete channels"
  ON public.channels
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = public.channels.server_id
        AND s.owner_id = auth.uid()
    )
  );
