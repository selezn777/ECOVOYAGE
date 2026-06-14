-- Чтобы офис не видел "левые" доплаты, а гид видел официальное сразу, а неофициальное по кнопке.
alter table guide_salary_records add column if not exists kind text not null default 'salary';

