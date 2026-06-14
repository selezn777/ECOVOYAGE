-- Внутриигровые уведомления + объявления руководства (inbox в меню).
create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in (
    'announcement',
    'guide_assigned',
    'manager_point_assigned',
    'tour_created_dispatcher',
    'ticket_sale_vinwonders_dispatcher'
  )),
  title text not null,
  body text not null default '',
  link_url text,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_in_app_notifications_user_created
  on public.in_app_notifications(user_id, created_at desc);

create index if not exists idx_in_app_notifications_user_unread
  on public.in_app_notifications(user_id)
  where read_at is null;
