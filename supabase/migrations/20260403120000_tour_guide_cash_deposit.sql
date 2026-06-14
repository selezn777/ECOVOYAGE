-- Депозит из кассы гиду на тур (учёт бухгалтерии, предстоящие туры)
alter table public.tours
  add column if not exists guide_cash_deposit_vnd integer;

comment on column public.tours.guide_cash_deposit_vnd is 'Выдано гиду из кассы на расходы во время тура (₫), null/0 = не выдавалось';
