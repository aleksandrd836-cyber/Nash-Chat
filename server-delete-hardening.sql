DROP FUNCTION IF EXISTS public.delete_owned_server(UUID);

CREATE OR REPLACE FUNCTION public.delete_owned_server(p_server_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server RECORD;
BEGIN
  SELECT *
    INTO v_server
    FROM public.servers
   WHERE id = p_server_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'server_not_found');
  END IF;

  IF v_server.owner_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  DELETE FROM public.channel_last_read
   WHERE channel_id IN (
     SELECT id
       FROM public.channels
      WHERE server_id = p_server_id
   );

  DELETE FROM public.message_reactions
   WHERE message_id IN (
     SELECT id
       FROM public.messages
      WHERE channel_id IN (
        SELECT id
          FROM public.channels
         WHERE server_id = p_server_id
      )
   );

  DELETE FROM public.messages
   WHERE channel_id IN (
     SELECT id
       FROM public.channels
      WHERE server_id = p_server_id
   );

  DELETE FROM public.channels
   WHERE server_id = p_server_id;

  DELETE FROM public.server_members
   WHERE server_id = p_server_id;

  DELETE FROM public.servers
   WHERE id = p_server_id
     AND owner_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_owned_server(UUID) TO authenticated;
