-- Ручные доходы/расходы кассы (бухгалтерия): канцтовары, внесение владельца и т.д.
create table if not exists public.cash_manual_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  amount_vnd bigint not null check (amount_vnd > 0),
  title text not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null
);

create index if not exists idx_cash_manual_ledger_created_at
  on public.cash_manual_ledger_entries (created_at desc);

comment on table public.cash_manual_ledger_entries is 'Нестандартные операции кассы, вносит бухгалтер';
