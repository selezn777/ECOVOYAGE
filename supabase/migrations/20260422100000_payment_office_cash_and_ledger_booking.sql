-- Оплата онлайн-брони, принятая в кассе офиса (не у менеджера): отдельный kind платежа.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'payment_kind'
      and e.enumlabel = 'office_cash'
  ) then
    alter type payment_kind add value 'office_cash';
  end if;
end $$;

alter table public.cash_manual_ledger_entries
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

create index if not exists idx_cash_manual_ledger_booking_id
  on public.cash_manual_ledger_entries (booking_id)
  where booking_id is not null;

comment on column public.cash_manual_ledger_entries.booking_id is
  'При привязке к брони: оплата внесена в кассу офиса по этой брони (см. payments.kind = office_cash)';
