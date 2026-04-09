-- ============================================================
-- Vibe — Private DM Attachments
-- Применяй этот SQL к уже существующей базе Vibe.
-- Он создаёт приватный storage bucket для вложений ЛС
-- и политики доступа только для участников диалога.
-- ============================================================

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
