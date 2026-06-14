-- Поток заявок расходов по точке: подтверждение бухгалтерии/директора и отметка выдачи.
alter table if exists public.rental_point_expenses
  add column if not exists approval_status text not null default 'pending';

alter table if exists public.rental_point_expenses
  add column if not exists approval_note text;

alter table if exists public.rental_point_expenses
  add column if not exists approved_at timestamptz;

alter table if exists public.rental_point_expenses
  add column if not exists approved_by uuid references public.users (id) on delete set null;

alter table if exists public.rental_point_expenses
  add column if not exists issued_at timestamptz;

alter table if exists public.rental_point_expenses
  add column if not exists issued_by uuid references public.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rental_point_expenses_approval_status_check'
  ) then
    alter table public.rental_point_expenses
      add constraint rental_point_expenses_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end$$;
