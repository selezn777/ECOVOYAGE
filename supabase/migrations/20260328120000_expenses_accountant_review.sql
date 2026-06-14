-- Расходы со спорным чеком: гид сохраняет, бухгалтер подтверждает вручную.
alter table expenses add column if not exists pending_accountant_review boolean not null default false;
alter table expenses add column if not exists accountant_reviewed_at timestamptz;
alter table expenses add column if not exists accountant_reviewed_by uuid references users(id);
