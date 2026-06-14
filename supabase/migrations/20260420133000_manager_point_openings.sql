-- Менеджер подтверждает, что открыл закреплённую точку продаж в конкретный день.
create table if not exists public.manager_point_openings (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.users (id) on delete cascade,
  point_id uuid not null references public.rental_points (id) on delete cascade,
  opened_on date not null,
  confirmed_at timestamptz not null default now(),
  unique (manager_id, point_id, opened_on)
);

create index if not exists idx_manager_point_openings_manager_day
  on public.manager_point_openings (manager_id, opened_on);

create index if not exists idx_manager_point_openings_point_day
  on public.manager_point_openings (point_id, opened_on);
