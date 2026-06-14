-- Опциональный ник в Telegram (без @), для связи вместо/вместе с WhatsApp по телефону.
alter table public.bookings
  add column if not exists telegram_username text;

comment on column public.bookings.telegram_username is 'Username в Telegram без префикса @ (латиница, цифры, _), опционально';
