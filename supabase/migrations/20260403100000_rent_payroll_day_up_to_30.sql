-- Число оплаты аренды и выплаты ЗП: до 30 числа месяца

alter table public.rental_points drop constraint if exists rental_points_rent_due_day;
alter table public.rental_points
  add constraint rental_points_rent_due_day check (rent_due_day_of_month between 1 and 30);

alter table public.company_payroll_calendar drop constraint if exists company_payroll_calendar_day;
alter table public.company_payroll_calendar
  add constraint company_payroll_calendar_day check (manager_salary_payout_day between 1 and 30);
