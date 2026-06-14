create table if not exists tour_advances (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours(id) on delete cascade,
  employee_id uuid not null references users(id) on delete restrict,
  created_by uuid references users(id) on delete set null,
  kind text not null check (kind in ('issue', 'return')),
  amount_vnd bigint not null check (amount_vnd > 0),
  currency text not null default 'VND' check (currency in ('VND', 'USD')),
  fx_rate_to_vnd numeric(14,4) not null default 1 check (fx_rate_to_vnd > 0),
  status text not null default 'approved' check (status in ('created', 'pending', 'approved', 'paid', 'rejected')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tour_advances_tour_created_at on tour_advances(tour_id, created_at desc);
create index if not exists idx_tour_advances_employee_created_at on tour_advances(employee_id, created_at desc);
