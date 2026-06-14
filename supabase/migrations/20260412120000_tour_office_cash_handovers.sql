-- Сдача наличных с тура в центральную кассу (менеджер офиса / гид); запись ведёт бухгалтер.
create table if not exists public.tour_office_cash_handovers (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours (id) on delete cascade,
  holder_role text not null check (holder_role in ('manager', 'guide')),
  employee_id uuid not null references public.users (id) on delete restrict,
  amount_vnd bigint not null check (amount_vnd > 0),
  note text,
  received_at timestamptz not null default now(),
  recorded_by uuid references public.users (id) on delete set null
);

create index if not exists idx_tour_office_cash_handovers_tour
  on public.tour_office_cash_handovers (tour_id, received_at desc);

create index if not exists idx_tour_office_cash_handovers_received_at
  on public.tour_office_cash_handovers (received_at desc);

comment on table public.tour_office_cash_handovers is 'Приём наличных от менеджера/гида по туру в центральную кассу';
