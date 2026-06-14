-- Опциональная привязка ручной операции кассы к туру (расход/доход по конкретному туру).
alter table public.cash_manual_ledger_entries
  add column if not exists tour_id uuid references public.tours (id) on delete set null;

create index if not exists idx_cash_manual_ledger_tour_id
  on public.cash_manual_ledger_entries (tour_id)
  where tour_id is not null;

comment on column public.cash_manual_ledger_entries.tour_id is
  'Необязательно: тур, к которому относится ручная операция (контекст для отчётов и журнала)';
