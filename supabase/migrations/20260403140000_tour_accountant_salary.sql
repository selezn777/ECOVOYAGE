-- Зарплата гиду (фикс бухгалтера) и произвольная таблица (JSON) на карточке сводки
alter table public.tours
  add column if not exists accountant_guide_salary_vnd integer;

alter table public.tours
  add column if not exists accountant_salary_sheet_json text;

comment on column public.tours.accountant_guide_salary_vnd is 'Зарплата гиду по туру (₫), вносит бухгалтер';
comment on column public.tours.accountant_salary_sheet_json is 'JSON таблицы начислений (сетка для бухгалтера)';
