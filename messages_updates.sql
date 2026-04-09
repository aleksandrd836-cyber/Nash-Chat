-- Добавление поддержки редактирования сообщений
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Политики RLS для редактирования и удаления (только авторы)

-- Сообщения в каналах
DO $$ BEGIN
    CREATE POLICY "Авторы могут редактировать свои сообщения" ON messages
        FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Авторы могут удалять свои сообщения" ON messages
        FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Личные сообщения
DO $$ BEGIN
    CREATE POLICY "Авторы могут редактировать свои ЛС" ON direct_messages
        FOR UPDATE USING (auth.uid() = sender_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Авторы могут удалять свои ЛС" ON direct_messages
        FOR DELETE USING (auth.uid() = sender_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
