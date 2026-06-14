alter table public.tour_office_cash_handovers
  add column if not exists channel text not null default 'cash_vnd';

alter table public.tour_office_cash_handovers
  drop constraint if exists tour_office_cash_handovers_channel_check;

alter table public.tour_office_cash_handovers
  add constraint tour_office_cash_handovers_channel_check
  check (channel in ('kz_bank', 'ru_bank', 'vn_bank', 'cash_vnd', 'cash_usd'));

alter table public.tour_office_cash_handovers
  add column if not exists amount_usd numeric(14, 4);

comment on column public.tour_office_cash_handovers.channel is 'Форма поступления: банки KZ/RU/VN или наличные VND/USD';
comment on column public.tour_office_cash_handovers.amount_usd is 'При channel=cash_usd - фактическая сумма в USD (справочно для пересчёта налички)';
