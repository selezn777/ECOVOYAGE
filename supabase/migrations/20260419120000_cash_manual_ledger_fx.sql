-- Ручная касса: валюта факта, сумма в валюте, курс к VND, способ (наличные / банк).
-- Баланс кассы по-прежнему только amount_vnd.

alter table public.cash_manual_ledger_entries
  add column if not exists currency_code text not null default 'VND';

alter table public.cash_manual_ledger_entries
  add column if not exists amount_foreign numeric(18, 6);

alter table public.cash_manual_ledger_entries
  add column if not exists fx_rate_to_vnd numeric(24, 8);

alter table public.cash_manual_ledger_entries
  add column if not exists payment_kind text not null default 'cash';

alter table public.cash_manual_ledger_entries
  drop constraint if exists cash_manual_ledger_entries_payment_kind_check;

alter table public.cash_manual_ledger_entries
  add constraint cash_manual_ledger_entries_payment_kind_check
  check (payment_kind in ('cash', 'bank_transfer'));

comment on column public.cash_manual_ledger_entries.currency_code is 'ISO 4217: валюта, в которой фактически учтена сумма (если не VND - см. amount_foreign и fx_rate_to_vnd)';
comment on column public.cash_manual_ledger_entries.amount_foreign is 'Сумма в currency_code; для чисто-VND операций null';
comment on column public.cash_manual_ledger_entries.fx_rate_to_vnd is 'Сколько VND за 1 единицу currency_code на дату операции (снимок для отчётов)';
comment on column public.cash_manual_ledger_entries.payment_kind is 'cash - наличные; bank_transfer - банковский перевод';
