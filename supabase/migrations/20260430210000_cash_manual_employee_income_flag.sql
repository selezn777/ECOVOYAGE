-- При привязке операции к сотруднику: учитывать ли в «доходе сотрудника» в CRM или только метка/расход.
alter table public.cash_manual_ledger_entries
  add column if not exists employee_income_included boolean;

comment on column public.cash_manual_ledger_entries.employee_income_included is
  'Если employee_id задан: true - отражать в доходе сотрудника; false - только привязка (например расход без начисления дохода).';
