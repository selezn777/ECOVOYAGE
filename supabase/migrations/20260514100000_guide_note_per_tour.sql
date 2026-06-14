-- Заметка гида для конкретного тура (отображается туристам в PDF)
alter table public.tour_guides
  add column if not exists note text null;
