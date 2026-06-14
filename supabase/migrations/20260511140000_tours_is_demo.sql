-- Флаг демо-контента: туры созданные демо-аккаунтом не видны реальным пользователям
alter table public.tours add column if not exists is_demo boolean not null default false;

create index if not exists tours_is_demo_idx on public.tours(is_demo);
