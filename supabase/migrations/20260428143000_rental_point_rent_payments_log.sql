alter table if exists public.rental_points
  add column if not exists next_rent_payment_date date;

create table if not exists public.rental_point_rent_payments (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.rental_points(id) on delete cascade,
  amount_vnd bigint not null check (amount_vnd > 0),
  paid_on date not null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists rental_point_rent_payments_point_id_paid_on_idx
  on public.rental_point_rent_payments(point_id, paid_on desc);
