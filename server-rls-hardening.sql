-- Vibe — server management and join-code hardening
-- Apply this in Supabase SQL Editor if server creation fails with 42501
-- or server join codes are not found even when they look correct.

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own servers" ON public.servers;
CREATE POLICY "Users can create their own servers"
  ON public.servers
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Server owners can update their servers" ON public.servers;
CREATE POLICY "Server owners can update their servers"
  ON public.servers
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Server owners can delete their servers" ON public.servers;
CREATE POLICY "Server owners can delete their servers"
  ON public.servers
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can create owner membership for own server" ON public.server_members;
CREATE POLICY "Users can create owner membership for own server"
  ON public.server_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = public.server_members.server_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Server owners can remove members" ON public.server_members;
CREATE POLICY "Server owners can remove members"
  ON public.server_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = public.server_members.server_id
        AND s.owner_id = auth.uid()
    )
  );

DROP FUNCTION IF EXISTS public.join_server_by_invite(TEXT);

CREATE OR REPLACE FUNCTION public.join_server_by_invite(p_invite_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_server_record RECORD;
  v_membership RECORD;
  v_normalized_code TEXT := REGEXP_REPLACE(UPPER(BTRIM(p_invite_code)), '[^A-Z0-9]', '', 'g');
BEGIN
  SELECT *
    INTO v_server_record
    FROM public.servers
   WHERE REGEXP_REPLACE(UPPER(COALESCE(invite_code, '')), '[^A-Z0-9]', '', 'g') = v_normalized_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT *
    INTO v_membership
    FROM public.server_members
   WHERE server_id = v_server_record.id
     AND user_id = auth.uid();

  IF FOUND THEN
    RETURN jsonb_build_object('error', 'already_member');
  END IF;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_record.id, auth.uid(), 'member');

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

GRANT EXECUTE ON FUNCTION public.join_server_by_invite(TEXT) TO authenticated;
