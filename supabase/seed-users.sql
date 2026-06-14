-- Тестовые пользователи (фиксированные id для дев-сессий и документации).
-- По смыслу компании: director - директор; chief_manager и chief_guide - два разных заместителя
-- (офис/продажи и гиды); в продукте заложено по одному такому аккаунту. Остальные - рабочие роли.
-- Пароль в сиде: 'admin'. Запуск в Supabase после schema.sql.

insert into users (id, full_name, role, login, password, is_active) values
  ('a0000001-0000-4000-8000-000000000001', 'Директор', 'director', 'director', 'admin', true),
  ('a0000001-0000-4000-8000-000000000002', 'Главный менеджер', 'chief_manager', 'chief_manager', 'admin', true),
  ('a0000001-0000-4000-8000-000000000003', 'Менеджер', 'manager', 'manager', 'admin', true),
  ('a0000001-0000-4000-8000-000000000004', 'Главный гид', 'chief_guide', 'chief_guide', 'admin', true),
  ('a0000001-0000-4000-8000-000000000005', 'Гид', 'guide', 'guide', 'admin', true),
  ('a0000001-0000-4000-8000-000000000006', 'Бухгалтер', 'accountant', 'accountant', 'admin', true),
  ('a0000001-0000-4000-8000-000000000007', 'Диспетчер', 'dispatcher', 'dispatcher', 'admin', true)
on conflict (login) do nothing;
