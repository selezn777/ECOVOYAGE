alter table if exists public.expenses
  add column if not exists accountant_review_state text;

alter table if exists public.expenses
  add column if not exists accountant_review_note text;

alter table if exists public.expenses
  add column if not exists accountant_reviewed_by uuid null references public.users(id) on delete set null;

update public.expenses
set accountant_review_state = case
  when accountant_reviewed_at is not null then 'approved'
  when pending_accountant_review is true then 'pending'
  else coalesce(accountant_review_state, 'pending')
end
where accountant_review_state is null;

alter table if exists public.expenses
  alter column accountant_review_state set default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_accountant_review_state_check'
  ) then
    alter table public.expenses
      add constraint expenses_accountant_review_state_check
      check (accountant_review_state in ('pending', 'approved', 'recheck'));
  end if;
end $$;
