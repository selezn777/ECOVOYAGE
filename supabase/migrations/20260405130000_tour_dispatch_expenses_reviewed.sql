-- Бухгалтер явно подтвердил проверку блока «водитель / диспетчер / букинг»
alter table tours
  add column if not exists accountant_dispatch_expenses_reviewed_at timestamptz;

comment on column tours.accountant_dispatch_expenses_reviewed_at is 'Бухгалтер отметил блок расходов водитель/диспетчер как проверенный';
