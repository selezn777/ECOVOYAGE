-- Личное сообщение менеджера/гида для конкретного тура (перекрывает шаблонное)
create table if not exists public.tour_message_overrides (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references public.tours(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null default 'tourist',  -- 'tourist' | 'guide' | 'review'
  text        text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (tour_id, user_id, type)
);

create index if not exists tour_message_overrides_tour_idx on public.tour_message_overrides(tour_id);
create index if not exists tour_message_overrides_user_idx on public.tour_message_overrides(user_id);
