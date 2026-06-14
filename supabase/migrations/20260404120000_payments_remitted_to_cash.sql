-- Доплата от гида: до подтверждения бухгалтером не считается оплатой в кассу
alter table public.payments
  add column if not exists remitted_to_cash_at timestamptz;

alter table public.payments
  add column if not exists remitted_to_cash_by uuid references public.users(id);

comment on column public.payments.remitted_to_cash_at is 'Доплата принята в кассу (null у старых/офисных - см. backfill)';
comment on column public.payments.remitted_to_cash_by is 'Кто подтвердил приём в кассу';

-- Все уже существовавшие платежи считаем принятыми в кассу (поведение как раньше)
update public.payments
set remitted_to_cash_at = coalesce(remitted_to_cash_at, created_at)
where remitted_to_cash_at is null;
