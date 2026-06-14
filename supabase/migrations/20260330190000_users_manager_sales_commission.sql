-- Процент от суммы по прайсу для расчёта заработка менеджера (задаёт бухгалтер; по умолчанию в приложении 12%).
alter table users add column if not exists manager_sales_commission_percent numeric(5,2);

comment on column users.manager_sales_commission_percent is
  'Процент от суммы по прайсу (брони) для «Мои продажи»; null = 12% по умолчанию';
