-- Идемпотентно: создаёт cash_manual_ledger_entries, если её ещё нет, и все нужные колонки/индексы.
-- Можно выполнить одним скриптом в Supabase SQL Editor, если раньше не гонялись миграции 20260411120000 / 13120000 / 14120000.

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

alter table public.cash_manual_ledger_entries
  add column if not exists attachment_url text;

comment on column public.cash_manual_ledger_entries.attachment_url is
  'Фото чека / подтверждения (публичный URL в Storage)';

alter table public.cash_manual_ledger_entries
  add column if not exists tour_id uuid references public.tours (id) on delete set null;

create index if not exists idx_cash_manual_ledger_tour_id
  on public.cash_manual_ledger_entries (tour_id)
  where tour_id is not null;

comment on column public.cash_manual_ledger_entries.tour_id is
  'Необязательно: тур, к которому относится ручная операция (контекст для отчётов и журнала)';

create table if not exists public.cash_manual_ledger_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  created_at timestamptz not null default now(),
  constraint cash_manual_ledger_categories_label_unique unique (label)
);

alter table public.cash_manual_ledger_entries
  add column if not exists category_id uuid references public.cash_manual_ledger_categories (id) on delete set null;

create index if not exists idx_cash_manual_ledger_category_id
  on public.cash_manual_ledger_entries (category_id)
  where category_id is not null;
