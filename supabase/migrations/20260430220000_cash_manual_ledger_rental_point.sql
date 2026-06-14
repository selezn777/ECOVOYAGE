-- Привязка ручной операции кассы к арендной точке (отчёты по точке).

alter table public.cash_manual_ledger_entries
  add column if not exists rental_point_id uuid references public.rental_points (id) on delete set null;

create index if not exists idx_cash_manual_ledger_rental_point_id
  on public.cash_manual_ledger_entries (rental_point_id)
  where rental_point_id is not null;

comment on column public.cash_manual_ledger_entries.rental_point_id is
  'Опционально: турточка / аренда - для учёта доходов и расходов по точке вместе с журналом кассы.';
