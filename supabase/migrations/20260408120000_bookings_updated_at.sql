-- Время последнего изменения карточки брони (для квитанций и аудита)
alter table public.bookings
  add column if not exists updated_at timestamptz;

update public.bookings
set updated_at = created_at
where updated_at is null;

alter table public.bookings
  alter column updated_at set default now();

alter table public.bookings
  alter column updated_at set not null;

create or replace function public.set_bookings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row
execute procedure public.set_bookings_updated_at();

create or replace function public.touch_booking_updated_at_from_payment()
returns trigger
language plpgsql
as $$
begin
  update public.bookings
  set updated_at = now()
  where id = coalesce(new.booking_id, old.booking_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_payments_touch_booking_updated_at on public.payments;
create trigger trg_payments_touch_booking_updated_at
after insert or update or delete on public.payments
for each row
execute procedure public.touch_booking_updated_at_from_payment();

create or replace function public.touch_booking_updated_at_from_booking_price()
returns trigger
language plpgsql
as $$
begin
  update public.bookings
  set updated_at = now()
  where id = coalesce(new.booking_id, old.booking_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_booking_prices_touch_booking_updated_at on public.booking_prices;
create trigger trg_booking_prices_touch_booking_updated_at
after insert or update or delete on public.booking_prices
for each row
execute procedure public.touch_booking_updated_at_from_booking_price();
