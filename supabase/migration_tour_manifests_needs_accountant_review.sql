-- Если сохранение учёта на туре падает с ошибкой про needs_accountant_review - выполните в SQL Editor Supabase:
alter table tour_manifests add column if not exists needs_accountant_review boolean not null default false;
