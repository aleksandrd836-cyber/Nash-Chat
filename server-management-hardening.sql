DROP FUNCTION IF EXISTS public.create_owned_server(TEXT);
DROP FUNCTION IF EXISTS public.update_owned_server(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.regenerate_server_invite_code(UUID);
DROP FUNCTION IF EXISTS public.remove_server_member(UUID, UUID);

CREATE OR REPLACE FUNCTION public.create_owned_server(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server public.servers%ROWTYPE;
  v_clean_name TEXT := BTRIM(COALESCE(p_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF v_clean_name = '' THEN
    RETURN jsonb_build_object('error', 'empty_name');
  END IF;

  INSERT INTO public.servers (name, owner_id)
  VALUES (v_clean_name, auth.uid())
  RETURNING * INTO v_server;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server.id, auth.uid(), 'owner')
  ON CONFLICT (server_id, user_id) DO UPDATE SET role = 'owner';

  RETURN to_jsonb(v_server);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_owned_server(
  p_server_id UUID,
  p_name TEXT DEFAULT NULL,
  p_icon_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server public.servers%ROWTYPE;
  v_clean_name TEXT := NULLIF(BTRIM(COALESCE(p_name, '')), '');
  v_clean_icon_url TEXT := NULLIF(BTRIM(COALESCE(p_icon_url, '')), '');
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

  UPDATE public.servers
     SET name = COALESCE(v_clean_name, name),
         icon_url = CASE
           WHEN p_icon_url IS NULL THEN icon_url
           ELSE v_clean_icon_url
         END
   WHERE id = p_server_id
   RETURNING * INTO v_server;

  RETURN to_jsonb(v_server);
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_server_invite_code(p_server_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server public.servers%ROWTYPE;
  v_new_code TEXT;
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

  LOOP
    v_new_code := UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1
        FROM public.servers
       WHERE invite_code = v_new_code
         AND id <> p_server_id
    );
  END LOOP;

  UPDATE public.servers
     SET invite_code = v_new_code
   WHERE id = p_server_id
   RETURNING * INTO v_server;

  RETURN to_jsonb(v_server);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_server_member(p_server_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server public.servers%ROWTYPE;
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

  IF p_user_id = v_server.owner_id THEN
    RETURN jsonb_build_object('error', 'cannot_remove_owner');
  END IF;

  DELETE FROM public.server_members
   WHERE server_id = p_server_id
     AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_owned_server(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_owned_server(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_server_invite_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_server_member(UUID, UUID) TO authenticated;
