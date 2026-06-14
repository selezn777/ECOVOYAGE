-- Ростер: скрытые сотрудники, приватный телефон; зарплатный календарь; взносы/МРОТ; аренда турточек

alter table public.users
  add column if not exists hidden_from_roster boolean not null default false;
alter table public.users
  add column if not exists roster_contact_private boolean not null default false;

comment on column public.users.hidden_from_roster is 'Не показывать в списке «Команда» для обычных ролей; видят директор, главный менеджер, главный диспетчер, бухгалтер.';
comment on column public.users.roster_contact_private is 'Не показывать телефон/WhatsApp в общем списке (кроме руководства и бухгалтерии).';

alter table public.users
  add column if not exists payroll_contribution_base_vnd bigint;
alter table public.users
  add column if not exists payroll_personal_income_tax_percent numeric(6, 2);
alter table public.users
  add column if not exists payroll_pension_extra_percent numeric(6, 2);
alter table public.users
  add column if not exists payroll_social_employee_percent numeric(6, 2) default 10.5;
alter table public.users
  add column if not exists payroll_social_employer_percent numeric(6, 2) default 21.5;
alter table public.users
  add column if not exists vietnam_mrot_zone text;

alter table public.users drop constraint if exists users_vietnam_mrot_zone_check;
alter table public.users
  add constraint users_vietnam_mrot_zone_check
  check (vietnam_mrot_zone is null or vietnam_mrot_zone in ('I', 'II', 'III', 'IV'));

comment on column public.users.payroll_contribution_base_vnd is 'Официальная база для взносов BHXH/BHYT/BHTN и подсказок (может быть ниже фактической выплаты).';
comment on column public.users.payroll_pension_extra_percent is 'Дополнительный % пенсионных/страховых отчислений (сверх стандартного работодательского пакета), опционально.';

create table if not exists public.company_payroll_calendar (
  id smallint primary key default 1,
  manager_salary_payout_day smallint not null default 5,
  updated_at timestamptz not null default now(),
  constraint company_payroll_calendar_singleton check (id = 1),
  constraint company_payroll_calendar_day check (manager_salary_payout_day between 1 and 28)
);

comment on table public.company_payroll_calendar is 'Календарь: число месяца выплаты % менеджерам (настраивает руководство).';
insert into public.company_payroll_calendar (id, manager_salary_payout_day)
values (1, 5)
on conflict (id) do nothing;

create table if not exists public.rental_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_note text,
  photo_url text,
  monthly_rent_vnd bigint not null default 0,
  rent_due_day_of_month smallint not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_points_rent_due_day check (rent_due_day_of_month between 1 and 28)
);

comment on table public.rental_points is 'Турточки / аренда: карточка для бухгалтера и главного диспетчера.';

create table if not exists public.rental_point_expenses (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.rental_points (id) on delete cascade,
  amount_vnd bigint not null,
  title text not null default '',
  expense_date date not null default (current_date),
  note text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rental_point_expenses_point on public.rental_point_expenses (point_id, expense_date desc);

create table if not exists public.rental_point_closed_days (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.rental_points (id) on delete cascade,
  closed_date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (point_id, closed_date)
);

create index if not exists idx_rental_point_closed_days_point on public.rental_point_closed_days (point_id, closed_date desc);
