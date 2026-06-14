-- Ускорение поиска «владельца» номера при создании брони
create index if not exists idx_bookings_phone_e164_active
  on public.bookings (phone_e164)
  where deleted_at is null;
