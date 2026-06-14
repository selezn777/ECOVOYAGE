-- Для режима “вне магазина”: фикс водителю (когда гид хочет указать сумму, а не %).
alter table guide_salary_records add column if not exists outside_driver_fixed_vnd bigint;

