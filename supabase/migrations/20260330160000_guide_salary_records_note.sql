-- Калькулятор доп. заработков: чтобы гид мог написать "где/за что".
alter table guide_salary_records add column if not exists note text;

