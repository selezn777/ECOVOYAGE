-- Привязка сдачи в центральную кассу к брони (турист): синхронизация с payments.remitted_to_cash_*.
alter table public.tour_office_cash_handovers
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

create index if not exists idx_tour_office_cash_handovers_booking_id
  on public.tour_office_cash_handovers (booking_id)
  where booking_id is not null;

comment on column public.tour_office_cash_handovers.booking_id is
  'Если задано - сумма распределяется по доплатам брони (remitted_to_cash) и закрывает долг в кассе.';
