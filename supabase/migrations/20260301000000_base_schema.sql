-- EcoVoyage CRM core schema (MVP)
-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

do $$ begin
  create type app_role as enum (
    'director',
    'chief_manager',
    'manager',
    'chief_guide',
    'guide',
    'accountant',
    'dispatcher'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tour_status as enum ('active', 'completed', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum ('deposit', 'topup', 'refund', 'office_cash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_category as enum ('guide', 'bus', 'salary', 'other');
exception when duplicate_object then null; end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role app_role not null,
  login text unique,
  password text not null default 'admin',
  phone text,
  avatar_url text,
  manager_sales_commission_percent numeric(5,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists guide_days_off (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references users(id) on delete cascade,
  day_off date not null,
  created_at timestamptz not null default now(),
  unique (guide_id, day_off)
);

-- Planned days off for managers (informational; managers may still sell tours that day)
create table if not exists manager_days_off (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references users(id) on delete cascade,
  day_off date not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (manager_id, day_off)
);

create index if not exists idx_manager_days_off_day on manager_days_off(day_off);

create table if not exists employee_visa_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  staff_mode text not null check (staff_mode in ('manager', 'guide')),
  cycle_days int not null check (cycle_days in (45, 90)),
  day_from date not null,
  day_to date not null,
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  constraint employee_visa_runs_range_check check (day_to >= day_from)
);

create index if not exists idx_employee_visa_runs_user_mode_from on employee_visa_runs(user_id, staff_mode, day_from);

create table if not exists tour_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  /** Название “магазина” для доп. заработка гида (задаёт старший гид в шаблоне). */
  shop_label text,
  /** Текст для отправки туристу с квитанцией (время выезда, что взять) — задаёт старший гид в шаблоне. */
  tourist_send_copy text,
  default_price_vnd bigint not null default 0,
  pickup_mode text not null default 'range',
  pickup_from time,
  pickup_to time,
  locations jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists tours (
  id uuid primary key default gen_random_uuid(),
  human_id bigint generated always as identity unique,
  template_id uuid references tour_templates(id),
  name text not null,
  tour_type text not null check (tour_type in ('group','private')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity int not null default 0,
  default_offer_usd numeric(12,4),
  default_offer_rate_to_vnd numeric(12,4) not null default 26000,
  default_offer_vnd bigint not null default 0,
  status tour_status not null default 'active',
  created_by uuid references users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tour_guides (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  guide_id uuid not null references users(id),
  is_primary boolean not null default false,
  is_inspection boolean not null default false,
  unique (tour_id, guide_id)
);

create table if not exists bus_assignments (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  bus_number text not null,
  seats int,
  comment text,
  lang_note_en text,
  lang_note_vn text,
  assigned_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  manager_id uuid not null references users(id),
  hotel_name text not null,
  hotel_maps_url text,
  room text,
  customer_name text not null,
  phone_e164 text not null,
  phone_alt_e164 text,
  pickup_time time,
  adults int not null default 1 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  infants int not null default 0 check (infants >= 0),
  note text,
  dispatcher_booking_photo_url text,
  telegram_username text,
  /* Уникальный код онлайн-брони (ON000001 …), см. миграцию trg_bookings_set_online_code */
  online_code text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tour_booking_intents (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  manager_id uuid not null references users(id) on delete cascade,
  adults int not null default 0 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  infants int not null default 0 check (infants >= 0),
  /* при правке брони — дельта мест относительно этой брони */
  editing_booking_id uuid references bookings(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_tour_booking_intents_tour_manager on tour_booking_intents(tour_id, manager_id);
create index if not exists idx_tour_booking_intents_active on tour_booking_intents(tour_id, expires_at);
create index if not exists idx_tour_booking_intents_editing_booking on tour_booking_intents(editing_booking_id) where editing_booking_id is not null;

create index if not exists idx_bookings_tour on bookings(tour_id);
create index if not exists idx_bookings_manager on bookings(manager_id);

create table if not exists booking_prices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  person_label text,
  amount numeric(12,2) not null default 0,
  currency text not null check (currency in ('USD','VND')),
  rate_to_vnd numeric(12,4) not null default 1,
  amount_vnd bigint not null default 0
);

-- Сплит комиссии по брони: процент продаж уходит другому сотруднику (учёт в отчётах менеджеров).
create table if not exists booking_commission_shares (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  beneficiary_id uuid not null references users(id) on delete cascade,
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (booking_id, beneficiary_id)
);

create index if not exists idx_booking_commission_shares_beneficiary on booking_commission_shares(beneficiary_id);
create index if not exists idx_booking_commission_shares_booking on booking_commission_shares(booking_id);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

create table if not exists in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
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

create index if not exists idx_in_app_notifications_user_created on in_app_notifications(user_id, created_at desc);

create index if not exists idx_in_app_notifications_user_unread on in_app_notifications(user_id) where read_at is null;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null check (currency in ('USD','VND')),
  rate_to_vnd numeric(12,4) not null default 1,
  amount_vnd bigint not null,
  kind payment_kind not null,
  actor_id uuid references users(id),
  proof_file_url text,
  created_at timestamptz not null default now()
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  receipt_number text not null,
  pdf_url text,
  image_url text,
  status text not null check (status in ('paid','partial')),
  deposit_vnd bigint not null default 0,
  topup_vnd bigint not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_receipts_receipt_number on receipts(receipt_number);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  category expense_category not null,
  amount_vnd bigint not null check (amount_vnd >= 0),
  description text not null,
  created_by uuid references users(id),
  attachment_url text,
  /** Устар.: фоновая/авто-обработка; в UI - едва заметный статус «в обработке» */
  pending_accountant_review boolean not null default false,
  accountant_reviewed_at timestamptz,
  accountant_reviewed_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists guide_salary_templates (
  id uuid primary key default gen_random_uuid(),
  tour_template_id uuid references tour_templates(id),
  min_pax int not null default 0,
  max_pax int not null default 9999,
  amount_vnd bigint not null check (amount_vnd >= 0),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists guide_salary_records (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  guide_id uuid not null references users(id),
  amount_vnd bigint not null check (amount_vnd >= 0),
  /** Источник начисления для приватного показа гиду/офису. */
  kind text not null default 'salary',
  status text not null check (status in ('pending','paid')) default 'pending',
  paid_at timestamptz,
  paid_by uuid references users(id),
  /** Калькулятор “доп. заработков” (магазин/покупки и т.п.). */
  note text,
  /** Фото/скан для бухгалтерии (data URL или URL - как в текущем коде expenses). */
  attachment_url text,
  /** Для режима “вне магазина”: базовая сумма и % водителя (чтобы можно было редактировать). */
  outside_total_vnd bigint,
  outside_driver_percent int,
  /** Для режима “вне магазина”: фиксированная сумма водителю (если выбран фикс). */
  outside_driver_fixed_vnd bigint,
  created_at timestamptz not null default now()
);

create table if not exists ticket_templates (
  id uuid primary key default gen_random_uuid(),
  ticket_type text not null check (ticket_type in ('vinwonders','teatro_do')),
  name text not null,
  sale_price_vnd bigint not null default 0,
  office_profit_mode text not null check (office_profit_mode in ('fixed','percent')),
  office_profit_value numeric(10,2) not null default 0,
  manager_profit_mode text not null check (manager_profit_mode in ('fixed','percent')),
  manager_profit_value numeric(10,2) not null default 0,
  active boolean not null default true
);

create table if not exists ticket_sales (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references ticket_templates(id),
  manager_id uuid not null references users(id),
  qty int not null check (qty > 0),
  sale_total_vnd bigint not null default 0,
  office_profit_vnd bigint not null default 0,
  manager_profit_vnd bigint not null default 0,
  sold_at timestamptz not null default now()
);

create table if not exists currency_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD',
  quote_currency text not null default 'VND',
  rate numeric(12,4) not null,
  active boolean not null default true,
  set_by uuid references users(id),
  set_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  entity text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists deleted_items (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id text not null,
  payload jsonb not null,
  deleted_by uuid references users(id),
  restore_until timestamptz not null,
  created_at timestamptz not null default now()
);

/** Утренний отчёт гида: люди + со склада (для бухгалтерии). */
create table if not exists tour_manifests (
  tour_id uuid primary key references tours(id) on delete cascade,
  actual_pax int not null check (actual_pax >= 0),
  submitted_by uuid references users(id),
  submitted_at timestamptz not null default now(),
  comment text,
  rum_bottles int not null default 0 check (rum_bottles >= 0),
  cola_bottles int not null default 0 check (cola_bottles >= 0),
  water_bottles int not null default 0 check (water_bottles >= 0),
  raincoats_qty int not null default 0 check (raincoats_qty >= 0),
  needs_accountant_review boolean not null default false
);

/** Невыход по карточке брони: кто не поехал, отель виден по booking_id; возврат не требуется - отдельный флаг. */
create table if not exists tour_manifest_absences (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  absent_adults int not null default 0 check (absent_adults >= 0),
  absent_children int not null default 0 check (absent_children >= 0),
  absent_infants int not null default 0 check (absent_infants >= 0),
  refund_not_required boolean not null default false,
  note text,
  refund_execution_note text,
  created_at timestamptz not null default now(),
  unique (tour_id, booking_id)
);

create index if not exists idx_tour_manifest_absences_tour on tour_manifest_absences(tour_id);

-- -------- RLS --------
alter table users enable row level security;
alter table tours enable row level security;
alter table bookings enable row level security;
alter table receipts enable row level security;
alter table expenses enable row level security;
alter table ticket_sales enable row level security;
alter table audit_logs enable row level security;

create or replace function is_role(roles app_role[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from users u
    where u.id = auth.uid() and u.role = any(roles)
  );
$$;

drop policy if exists "users read own or privileged" on users;
create policy "users read own or privileged" on users
for select using (id = auth.uid() or is_role(array['director'::app_role, 'chief_manager'::app_role, 'accountant'::app_role]));

drop policy if exists "tours read all" on tours;
create policy "tours read all" on tours
for select using (auth.uid() is not null);

drop policy if exists "bookings read all" on bookings;
create policy "bookings read all" on bookings
for select using (auth.uid() is not null);

drop policy if exists "bookings modify own manager or elevated" on bookings;
create policy "bookings modify own manager or elevated" on bookings
for all using (
  manager_id = auth.uid()
  or is_role(array['director'::app_role, 'chief_manager'::app_role, 'chief_guide'::app_role])
);

drop policy if exists "receipts read privileged" on receipts;
create policy "receipts read privileged" on receipts
for select using (
  is_role(array['director'::app_role, 'chief_manager'::app_role, 'accountant'::app_role, 'manager'::app_role])
);

drop policy if exists "expenses read privileged and guide for own tours" on expenses;
create policy "expenses read privileged and guide for own tours" on expenses
for select using (
  is_role(array['director'::app_role, 'accountant'::app_role, 'chief_manager'::app_role, 'chief_guide'::app_role])
  or exists(select 1 from tour_guides tg where tg.tour_id = expenses.tour_id and tg.guide_id = auth.uid())
);

drop policy if exists "ticket sales read manager or privileged" on ticket_sales;
create policy "ticket sales read manager or privileged" on ticket_sales
for select using (
  manager_id = auth.uid()
  or is_role(array['director'::app_role, 'accountant'::app_role, 'chief_manager'::app_role])
);

drop policy if exists "audit logs only privileged" on audit_logs;
create policy "audit logs only privileged" on audit_logs
for select using (is_role(array['director'::app_role, 'accountant'::app_role]));

create table if not exists cash_manual_ledger_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists cash_manual_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  amount_vnd bigint not null check (amount_vnd > 0),
  title text not null,
  note text,
  attachment_url text,
  tour_id uuid references tours(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  category_id uuid references cash_manual_ledger_categories(id) on delete set null,
  currency_code text not null default 'VND',
  amount_foreign numeric(18, 6),
  fx_rate_to_vnd numeric(24, 8),
  payment_kind text not null default 'cash' check (payment_kind in ('cash', 'bank_transfer')),
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null
);

create index if not exists idx_cash_manual_ledger_tour_id on cash_manual_ledger_entries (tour_id) where tour_id is not null;
create index if not exists idx_cash_manual_ledger_booking_id on cash_manual_ledger_entries (booking_id) where booking_id is not null;
create index if not exists idx_cash_manual_ledger_category_id on cash_manual_ledger_entries (category_id) where category_id is not null;

create table if not exists office_cash_handover_channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  label text not null,
  sort_order int not null default 0,
  is_system boolean not null default false,
  expects_usd_amount boolean not null default false,
  created_at timestamptz not null default now(),
  constraint office_cash_handover_channels_label_unique unique (label)
);

insert into office_cash_handover_channels (slug, label, sort_order, is_system, expects_usd_amount)
values
  ('kz_bank', 'Перевод на банк Казахстана', 10, true, false),
  ('ru_bank', 'Перевод на банк РФ', 20, true, false),
  ('vn_bank', 'Перевод на вьетнамский банк', 30, true, false),
  ('cash_vnd', 'Наличные донги', 40, true, false),
  ('cash_usd', 'Наличные доллары США', 50, true, true)
on conflict (slug) do nothing;

create table if not exists tour_office_cash_handovers (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  holder_role text not null check (holder_role in ('manager', 'guide')),
  employee_id uuid not null references users(id) on delete restrict,
  amount_vnd bigint not null check (amount_vnd > 0),
  channel_id uuid references office_cash_handover_channels(id) on delete set null,
  amount_usd numeric(14, 4),
  note text,
  received_at timestamptz not null default now(),
  recorded_by uuid references users(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null
);

create index if not exists idx_tour_office_cash_handovers_tour on tour_office_cash_handovers(tour_id, received_at desc);
create index if not exists idx_tour_office_cash_handovers_channel_id on tour_office_cash_handovers (channel_id) where channel_id is not null;
create index if not exists idx_tour_office_cash_handovers_booking_id on tour_office_cash_handovers (booking_id) where booking_id is not null;
