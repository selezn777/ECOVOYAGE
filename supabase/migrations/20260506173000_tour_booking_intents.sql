-- Черновая фиксация мест до полного заполнения карточки туриста.
-- Нужна, чтобы менеджеры видели актуальную загрузку тура уже после шага "количество человек".

create table if not exists public.tour_booking_intents (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  manager_id uuid not null references public.users(id) on delete cascade,
  adults int not null default 0 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  infants int not null default 0 check (infants >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_tour_booking_intents_tour_manager
  on public.tour_booking_intents(tour_id, manager_id);

create index if not exists idx_tour_booking_intents_active
  on public.tour_booking_intents(tour_id, expires_at);

create or replace function public.tour_booking_intents_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tour_booking_intents_set_updated_at on public.tour_booking_intents;
create trigger trg_tour_booking_intents_set_updated_at
before update on public.tour_booking_intents
for each row
execute procedure public.tour_booking_intents_set_updated_at();

