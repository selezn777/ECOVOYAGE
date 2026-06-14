-- Оф. магазин: водитель от гида + подтверждение бухгалтером (офис/гид) до отражения в кассе.

alter table public.guide_salary_records
  add column if not exists shop_driver_paid_by_guide_vnd bigint,
  add column if not exists shop_accountant_guide_vnd bigint,
  add column if not exists shop_accountant_office_vnd bigint,
  add column if not exists shop_accountant_confirmed_at timestamptz;

comment on column public.guide_salary_records.shop_driver_paid_by_guide_vnd is
  'Оф. магазин, деньги у гида: сколько гид отдал водителю (0 - ок).';
comment on column public.guide_salary_records.shop_accountant_guide_vnd is
  'После сверки бухгалтером: итог гиду из суммы магазина.';
comment on column public.guide_salary_records.shop_accountant_office_vnd is
  'После сверки бухгалтером: прибыль офиса из суммы магазина (идёт в кассу при «деньги у гида»).';
comment on column public.guide_salary_records.shop_accountant_confirmed_at is
  'Бухгалтер зафиксировал разбивку; до этого строка оф. магазина в журнал кассы не попадает.';

-- Уже выплаченные магазины: не ломаем кассу, считаем подтверждёнными с датой выплаты.
update public.guide_salary_records
set shop_accountant_confirmed_at = coalesce(paid_at, created_at)
where kind = 'shop'
  and paid_at is not null
  and shop_accountant_confirmed_at is null;
