-- Классификация строк ручного журнала для отчётности (бухгалтер фиксирует «контур»).
alter table public.cash_manual_ledger_entries
  add column if not exists ledger_bucket text not null default 'standard'
    check (ledger_bucket in ('standard', 'instrumented'));

alter table public.cash_manual_ledger_entries
  add column if not exists ledger_bucket_ok_at timestamptz;

alter table public.cash_manual_ledger_entries
  add column if not exists ledger_bucket_ok_by uuid references public.users (id) on delete set null;

comment on column public.cash_manual_ledger_entries.ledger_bucket is
  'Служебно: standard - основной журнал; instrumented - операции с банковским следом (отчёт по переводам).';
comment on column public.cash_manual_ledger_entries.ledger_bucket_ok_at is
  'Бухгалтер зафиксировал классификацию (до отметки новые банковские строки не в «банковском» контуре отчёта).';
comment on column public.cash_manual_ledger_entries.ledger_bucket_ok_by is
  'Кто подтвердил классификацию.';

-- payment_kind вводится в 20260419120000_cash_manual_ledger_fx.sql; если её ещё не было,
-- backfill ниже падает - добавляем колонку здесь идемпотентно.
alter table public.cash_manual_ledger_entries
  add column if not exists payment_kind text not null default 'cash';

alter table public.cash_manual_ledger_entries
  drop constraint if exists cash_manual_ledger_entries_payment_kind_check;

alter table public.cash_manual_ledger_entries
  add constraint cash_manual_ledger_entries_payment_kind_check
  check (payment_kind in ('cash', 'bank_transfer'));

comment on column public.cash_manual_ledger_entries.payment_kind is
  'cash - наличные; bank_transfer - банковский перевод';

-- Исторические строки: считаем уже согласованными, чтобы не блокировать отчёты.
update public.cash_manual_ledger_entries
set
  ledger_bucket = 'standard',
  ledger_bucket_ok_at = coalesce(ledger_bucket_ok_at, created_at),
  ledger_bucket_ok_by = coalesce(ledger_bucket_ok_by, created_by)
where coalesce(payment_kind, 'cash') <> 'bank_transfer';

update public.cash_manual_ledger_entries
set
  ledger_bucket = 'instrumented',
  ledger_bucket_ok_at = coalesce(ledger_bucket_ok_at, created_at),
  ledger_bucket_ok_by = coalesce(ledger_bucket_ok_by, created_by)
where payment_kind = 'bank_transfer';
