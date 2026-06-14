alter table public.cash_manual_ledger_entries
  add column if not exists attachment_url text;

comment on column public.cash_manual_ledger_entries.attachment_url is 'Фото чека / подтверждения (публичный URL в Storage)';
