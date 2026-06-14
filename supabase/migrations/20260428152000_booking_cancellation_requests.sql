create table if not exists public.booking_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  tour_id uuid not null references public.tours(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid null references public.users(id) on delete set null,
  requested_role text not null,
  requested_note text null,
  requested_at timestamptz not null default now(),
  decided_by uuid null references public.users(id) on delete set null,
  decision_note text null,
  decided_at timestamptz null
);

create index if not exists booking_cancellation_requests_booking_id_idx
  on public.booking_cancellation_requests(booking_id, requested_at desc);

create unique index if not exists booking_cancellation_requests_pending_unique_idx
  on public.booking_cancellation_requests(booking_id)
  where status = 'pending';
