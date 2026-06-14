-- Фото паспортов туристов по брони (массив URL; сжатие на клиенте перед загрузкой)
alter table public.bookings
  add column if not exists passport_photo_urls jsonb not null default '[]'::jsonb;

comment on column public.bookings.passport_photo_urls is 'Массив URL изображений паспортов (публичное хранилище)';
