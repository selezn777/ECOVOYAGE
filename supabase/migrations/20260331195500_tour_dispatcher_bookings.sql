-- Комментарий/фото букинга на уровне тура (вносит диспетчер, видят гиды в интерфейсе).
create table if not exists public.tour_dispatcher_bookings (
  tour_id uuid primary key references public.tours(id) on delete cascade,
  note text null,
  photo_url text null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id) on delete set null
);

create index if not exists idx_tour_dispatcher_bookings_updated_at
  on public.tour_dispatcher_bookings(updated_at desc);
