-- Фото/скан для бухгалтерии: когда есть доля офиса (магазин и т.п.).
alter table guide_salary_records add column if not exists attachment_url text;

