-- Поля отмены брони с удержанием
alter table public.bookings
  add column if not exists cancellation_reason   text          null,
  add column if not exists retention_pct         smallint      null check (retention_pct between 0 and 100),
  add column if not exists retention_vnd         bigint        null,
  add column if not exists manager_shortfall_vnd bigint        null,
  add column if not exists cancelled_by          uuid          null references public.users(id);
