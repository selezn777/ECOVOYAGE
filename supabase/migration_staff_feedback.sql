-- Отзывы руководства о гидах и менеджерах + внутренний рейтинг тура.
-- Выполните в Supabase SQL Editor после основной схемы.

create table if not exists guide_reviews (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references users(id) on delete cascade,
  author_id uuid not null references users(id),
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  comment text,
  attachment_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_guide_reviews_guide on guide_reviews(guide_id);
create index if not exists idx_guide_reviews_created on guide_reviews(created_at desc);

create table if not exists manager_reviews (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references users(id) on delete cascade,
  author_id uuid not null references users(id),
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  comment text,
  attachment_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_manager_reviews_manager on manager_reviews(manager_id);
create index if not exists idx_manager_reviews_created on manager_reviews(created_at desc);

alter table tours add column if not exists internal_rating numeric(2,1)
  check (internal_rating is null or (internal_rating >= 1 and internal_rating <= 5));
alter table tours add column if not exists internal_rating_note text;
