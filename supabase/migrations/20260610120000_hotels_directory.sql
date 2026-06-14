-- Справочник отелей (для выбора при оформлении брони) и адрес отеля в брони.

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  maps_url text not null default '',
  city text not null default 'Nha Trang',
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists hotels_city_name_unique on public.hotels (city, lower(name));
create index if not exists hotels_active_idx on public.hotels (active);

alter table public.bookings add column if not exists hotel_address text;
