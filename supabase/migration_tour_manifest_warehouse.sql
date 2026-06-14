-- Учёт со склада в утреннем отчёте гида (ром, кола, вода, дождевики).
-- Выполнить в Supabase SQL Editor, если таблица tour_manifests уже есть без этих полей.

alter table tour_manifests add column if not exists rum_bottles int not null default 0;
alter table tour_manifests add column if not exists cola_bottles int not null default 0;
alter table tour_manifests add column if not exists water_bottles int not null default 0;
alter table tour_manifests add column if not exists raincoats_qty int not null default 0;
