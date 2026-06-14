-- Сплит комиссии по брони: часть процента продаж уходит другому сотруднику.
-- В отчётах «Мои продажи»/«Заработок» продажи по броням считаются с учётом долей.

create table if not exists public.booking_commission_shares (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  beneficiary_id uuid not null references public.users(id) on delete cascade,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (booking_id, beneficiary_id)
);

create index if not exists idx_booking_commission_shares_beneficiary
  on public.booking_commission_shares(beneficiary_id);

create index if not exists idx_booking_commission_shares_booking
  on public.booking_commission_shares(booking_id);

comment on table public.booking_commission_shares is
  'Доли комиссии/продаж по брони. Процент списывается из доли менеджера брони и начисляется beneficiary.';

