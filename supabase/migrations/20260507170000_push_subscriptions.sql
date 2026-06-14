-- Web Push subscriptions for PWA notifications.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

create or replace function public.push_subscriptions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row
execute procedure public.push_subscriptions_set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions select own" on public.push_subscriptions;
create policy "push subscriptions select own" on public.push_subscriptions
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "push subscriptions insert own" on public.push_subscriptions;
create policy "push subscriptions insert own" on public.push_subscriptions
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "push subscriptions update own" on public.push_subscriptions;
create policy "push subscriptions update own" on public.push_subscriptions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "push subscriptions delete own" on public.push_subscriptions;
create policy "push subscriptions delete own" on public.push_subscriptions
for delete to authenticated
using (user_id = auth.uid());

