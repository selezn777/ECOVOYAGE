-- Восстановление справочника каналов сдачи кассы — таблица была очищена системным сбросом
-- (api/admin/system-reset включает office_cash_handover_channels в план полной очистки без ресида),
-- из-за чего форма «Принять в кассу» переставала работать (нет каналов → нечего выбрать → кнопка неактивна).

insert into public.office_cash_handover_channels (slug, label, sort_order, is_system, expects_usd_amount)
values
  ('kz_bank', 'Перевод на банк Казахстана', 10, true, false),
  ('ru_bank', 'Перевод на банк РФ', 20, true, false),
  ('vn_bank', 'Перевод на вьетнамский банк', 30, true, false),
  ('cash_vnd', 'Наличные донги', 40, true, false),
  ('cash_usd', 'Наличные доллары США', 50, true, true)
on conflict (slug) do nothing;
