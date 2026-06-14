create table if not exists public.employee_visa_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  staff_mode text not null check (staff_mode in ('manager', 'guide')),
  cycle_days int not null check (cycle_days in (45, 90)),
  day_from date not null,
  day_to date not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  constraint employee_visa_runs_range_check check (day_to >= day_from)
);

create index if not exists idx_employee_visa_runs_user_mode_from
  on public.employee_visa_runs(user_id, staff_mode, day_from);
