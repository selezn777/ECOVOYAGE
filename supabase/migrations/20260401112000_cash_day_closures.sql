create table if not exists cash_day_closures (
  id uuid primary key default gen_random_uuid(),
  day_ymd date not null unique,
  expected_vnd bigint not null,
  actual_vnd bigint not null,
  diff_vnd bigint not null,
  note text,
  closed_by uuid references users(id) on delete set null,
  closed_at timestamptz not null default now()
);

create index if not exists idx_cash_day_closures_closed_at on cash_day_closures(closed_at desc);
