-- Режим работы менеджера на день: точка / промоутер / онлайн.
-- Используем существующую таблицу manager_point_openings как дневной маркер активности.

alter table if exists public.manager_point_openings
  add column if not exists work_mode text not null default 'point';

alter table if exists public.manager_point_openings
  alter column point_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manager_point_openings_work_mode_check'
  ) then
    alter table public.manager_point_openings
      add constraint manager_point_openings_work_mode_check
      check (work_mode in ('point', 'promo', 'online'));
  end if;
end$$;

-- Старый UNIQUE (manager_id, point_id, opened_on): индекс нельзя снять через DROP INDEX —
-- это ограничение таблицы (иначе SQLSTATE 2BP01).
alter table public.manager_point_openings
  drop constraint if exists manager_point_openings_manager_id_point_id_opened_on_key;

-- На одну пару (менеджер, день) может остаться несколько строк с разными point_id;
-- для нового уникального индекса оставляем строку с наименьшим id.
delete from public.manager_point_openings o
where exists (
  select 1
  from public.manager_point_openings x
  where x.manager_id = o.manager_id
    and x.opened_on = o.opened_on
    and x.id < o.id
);

-- Ранее был обычный индекс с тем же именем — заменяем на UNIQUE (manager_id, opened_on).
drop index if exists public.idx_manager_point_openings_unique;
drop index if exists public.idx_manager_point_openings_manager_day;

create unique index idx_manager_point_openings_manager_day
  on public.manager_point_openings (manager_id, opened_on);
