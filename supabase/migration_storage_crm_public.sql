-- Публичные загрузки CRM (аватар, фото брони диспетчера).
-- При первой загрузке приложение может создать этот bucket само (service role),
-- если в проекте ещё нет bucket с таким именем.
-- Ручная настройка (по желанию): Supabase Dashboard → Storage → New bucket:
--    Name: crm-public
--    Public bucket: ON
-- 2) Политики: загрузка только через service role (уже есть в приложении)  - 
--    анонимам можно только чтение, если bucket public.

-- Пример политики чтения для всех (если bucket не отмечен как Public в UI):
-- create policy "Public read crm-public"
-- on storage.objects for select
-- using (bucket_id = 'crm-public');

-- Загрузку оставляем через backend (SUPABASE_SERVICE_ROLE_KEY), без anon insert.
