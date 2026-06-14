-- Утренний отчёт гида: люди, склад, невыходы по карточкам.
-- Выполнить в Supabase SQL Editor, если схема уже развёрнута без этих таблиц.

create table if not exists tour_manifests (
  tour_id uuid primary key references tours(id) on delete cascade,
  actual_pax int not null check (actual_pax >= 0),
  submitted_by uuid references users(id),
  submitted_at timestamptz not null default now(),
  comment text,
  rum_bottles int not null default 0 check (rum_bottles >= 0),
  cola_bottles int not null default 0 check (cola_bottles >= 0),
  water_bottles int not null default 0 check (water_bottles >= 0),
  raincoats_qty int not null default 0 check (raincoats_qty >= 0)
);

create table if not exists tour_manifest_absences (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  absent_adults int not null default 0 check (absent_adults >= 0),
  absent_children int not null default 0 check (absent_children >= 0),
  absent_infants int not null default 0 check (absent_infants >= 0),
  refund_not_required boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (tour_id, booking_id)
);

create index if not exists idx_tour_manifest_absences_tour on tour_manifest_absences(tour_id);
