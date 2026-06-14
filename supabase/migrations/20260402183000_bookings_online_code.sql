-- Код ON (онлайн-номер брони): автоматически при INSERT, уникален в системе.

alter table public.bookings add column if not exists online_code text;

-- Существующие брони: последовательные ON000001 …
update public.bookings b
set online_code = src.code
from (
  select
    id,
    'ON' || lpad(row_number() over (order by created_at asc, id asc)::text, 6, '0') as code
  from public.bookings
  where online_code is null or btrim(online_code) = ''
) as src
where b.id = src.id;

create unique index if not exists uq_bookings_online_code
  on public.bookings (online_code)
  where online_code is not null;

create sequence if not exists public.booking_online_code_seq;

select setval(
  'public.booking_online_code_seq',
  greatest(
    1,
    coalesce(
      (
        select max(substring(online_code from 3)::bigint)
        from public.bookings
        where online_code ~ '^ON[0-9]{1,}$'
      ),
      0
    )
  ),
  true
);

create or replace function public.bookings_set_online_code()
returns trigger
language plpgsql
as $$
begin
  if new.online_code is null or btrim(new.online_code) = '' then
    new.online_code := 'ON' || lpad(nextval('public.booking_online_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_set_online_code on public.bookings;

create trigger trg_bookings_set_online_code
before insert on public.bookings
for each row
execute procedure public.bookings_set_online_code();
