-- Турточка продаж, закреплённая за менеджером (назначают директор / главный менеджер).
alter table public.users
  add column if not exists rental_point_id uuid references public.rental_points (id) on delete set null;

create index if not exists idx_users_rental_point_id on public.users (rental_point_id)
  where rental_point_id is not null;

comment on column public.users.rental_point_id is
  'Точка продаж (аренда): только для manager/chief_manager; сводки по точкам видят директор и главный менеджер.';
