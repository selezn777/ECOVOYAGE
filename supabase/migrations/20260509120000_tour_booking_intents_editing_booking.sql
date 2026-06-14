-- При правке брони черновик мест учитывается как дельта к уже занятым этой бронью,
-- чтобы не было двойного учёта в загрузке тура.

alter table public.tour_booking_intents
  add column if not exists editing_booking_id uuid references public.bookings(id) on delete cascade;

create index if not exists idx_tour_booking_intents_editing_booking
  on public.tour_booking_intents(editing_booking_id)
  where editing_booking_id is not null;

comment on column public.tour_booking_intents.editing_booking_id is
  'Если задано — места intent считаются относительно текущего состава этой брони (дельта), а не как новые места.';
