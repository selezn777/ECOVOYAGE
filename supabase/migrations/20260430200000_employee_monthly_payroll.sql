-- Ежемесячная зарплата (офис / штат): ведомость по месяцам, дата расчёта, налоги и взносы.
alter table public.users
  add column if not exists monthly_payroll_tracking_enabled boolean not null default false;

comment on column public.users.monthly_payroll_tracking_enabled is
  'В карточке сотрудника показывать подраздел «Ежемесячная зарплата» (начисления по месяцам).';

create table if not exists public.employee_monthly_payroll_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users (id) on delete cascade,
  period_ym text not null check (period_ym ~ '^\d{4}-\d{2}$'),
  /** Дата расчёта / закрытия ведомости */
  calculation_date date,
  /** Начислено «грязными» (до удержаний) */
  gross_salary_vnd bigint not null default 0 check (gross_salary_vnd >= 0),
  /** НДФЛ удержанный с сотрудника */
  personal_income_tax_vnd bigint not null default 0 check (personal_income_tax_vnd >= 0),
  /** BHXH/BHYT/BHTN (часть сотрудника) */
  social_insurance_employee_vnd bigint not null default 0 check (social_insurance_employee_vnd >= 0),
  /** Взносы работодателя (нагрузка компании) */
  social_insurance_employer_vnd bigint not null default 0 check (social_insurance_employer_vnd >= 0),
  /** К выплате на руки */
  net_salary_vnd bigint not null default 0 check (net_salary_vnd >= 0),
  /** Фактическая дата выплаты (если уже известна) */
  paid_date date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint employee_monthly_payroll_unique_period unique (employee_id, period_ym)
);

create index if not exists idx_employee_monthly_payroll_employee
  on public.employee_monthly_payroll_records (employee_id, period_ym desc);

comment on table public.employee_monthly_payroll_records is
  'Регистр зарплаты по месяцам: начисления, удержания, взносы работодателя, на руки.';
