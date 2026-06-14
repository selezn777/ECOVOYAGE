-- Для редактирования записей вне магазина (сумма и доля водителя).
alter table guide_salary_records add column if not exists outside_total_vnd bigint;
alter table guide_salary_records add column if not exists outside_driver_percent int;

