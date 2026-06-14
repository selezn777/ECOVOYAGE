-- Премии сотрудникам: начисление в карточке, выплата - расход в кассе с привязкой к сотруднику.
alter table public.cash_manual_ledger_entries
  add column if not exists employee_id uuid references public.users (id) on delete set null;

create index if not exists idx_cash_manual_ledger_employee_id
  on public.cash_manual_ledger_entries (employee_id)
  where employee_id is not null;

comment on column public.cash_manual_ledger_entries.employee_id is
  'Сотрудник, к которому относится операция (премия, разовый расход и т.д.)';

create table if not exists public.employee_bonus_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users (id) on delete cascade,
  amount_vnd bigint not null check (amount_vnd > 0),
  note text,
  accrued_at timestamptz not null default now(),
  planned_pay_date date,
  paid_at timestamptz,
  cash_manual_ledger_entry_id uuid references public.cash_manual_ledger_entries (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_bonus_paid_pair check (
    (paid_at is null and cash_manual_ledger_entry_id is null)
    or (paid_at is not null and cash_manual_ledger_entry_id is not null)
  )
);

create index if not exists idx_employee_bonus_records_employee_id
  on public.employee_bonus_records (employee_id, accrued_at desc);

comment on table public.employee_bonus_records is
  'Премия: начислено в карточке сотрудника; факт дохода - при выплате из кассы';
