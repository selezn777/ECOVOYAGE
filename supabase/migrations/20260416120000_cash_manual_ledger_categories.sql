-- Справочник категорий для ручных операций кассы (настраивается бухгалтерией).
create table if not exists public.cash_manual_ledger_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now(),
  constraint cash_manual_ledger_categories_label_unique unique (label)
);

comment on table public.cash_manual_ledger_categories is 'Категории ручных операций кассы';

alter table public.cash_manual_ledger_entries
  add column if not exists category_id uuid references public.cash_manual_ledger_categories (id) on delete set null;

create index if not exists idx_cash_manual_ledger_category_id
  on public.cash_manual_ledger_entries (category_id)
  where category_id is not null;
