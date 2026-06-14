-- Один раз в Supabase SQL Editor после schema.sql (если ещё нет шаблонов билетов).

insert into ticket_templates (
  ticket_type, name, sale_price_vnd,
  office_profit_mode, office_profit_value,
  manager_profit_mode, manager_profit_value,
  active
)
select 'vinwonders', 'VinWonders - стандарт', 950000, 'percent', 10, 'percent', 5, true
where not exists (select 1 from ticket_templates where ticket_type = 'vinwonders');

insert into ticket_templates (
  ticket_type, name, sale_price_vnd,
  office_profit_mode, office_profit_value,
  manager_profit_mode, manager_profit_value,
  active
)
select 'vinwonders', 'VinWonders - пенсионный', 760000, 'percent', 10, 'percent', 5, true
where not exists (
  select 1 from ticket_templates where ticket_type = 'vinwonders' and lower(name) = lower('VinWonders - пенсионный')
);

insert into ticket_templates (
  ticket_type, name, sale_price_vnd,
  office_profit_mode, office_profit_value,
  manager_profit_mode, manager_profit_value,
  active
)
select 'teatro_do', 'Teatro Do - стандарт', 450000, 'fixed', 50000, 'percent', 3, true
where not exists (select 1 from ticket_templates where ticket_type = 'teatro_do');
