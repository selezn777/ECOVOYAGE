-- Если файлы в Storage загружаются, но по публичному URL картинка не открывается (403),
-- добавьте политику чтения для анонимов (выполните в Supabase SQL Editor).

-- create policy "crm_public_objects_select"
-- on storage.objects for select
-- to public
-- using (bucket_id = 'crm-public');

-- Имя bucket должно совпадать с crm-public или значением SUPABASE_PUBLIC_BUCKET в .env.
