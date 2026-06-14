-- Контекст назначения менеджера на день: детали промо/онлайн для аналитики.
alter table if exists public.manager_point_openings
  add column if not exists promo_place text;

alter table if exists public.manager_point_openings
  add column if not exists online_channel text;

alter table if exists public.manager_point_openings
  add column if not exists online_traffic_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manager_point_openings_online_traffic_source_check'
  ) then
    alter table public.manager_point_openings
      add constraint manager_point_openings_online_traffic_source_check
      check (online_traffic_source in ('own', 'office') or online_traffic_source is null);
  end if;
end$$;
