-- Выполните в SQL Editor Supabase, если ваша таблица users старее текущего schema.sql.
alter table users add column if not exists avatar_url text;
