alter table public.users
  add column if not exists payroll_income_tax_withheld_at timestamptz,
  add column if not exists payroll_tax_declaration_filed_at timestamptz;

comment on column public.users.payroll_income_tax_withheld_at is
  'Дата/время фиксации: удержанный НДФЛ отражён в учёте (отдельно от указания % в карточке).';
comment on column public.users.payroll_tax_declaration_filed_at is
  'Дата/время фиксации: по сотруднику подана налоговая декларация.';
