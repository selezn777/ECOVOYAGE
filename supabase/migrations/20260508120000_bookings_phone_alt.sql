-- Дополнительный контактный номер (запасной WhatsApp).
alter table public.bookings
  add column if not exists phone_alt_e164 text;

comment on column public.bookings.phone_alt_e164 is 'Второй номер туриста (E.164), опционально.';
