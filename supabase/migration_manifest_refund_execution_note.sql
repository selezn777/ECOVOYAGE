-- Комментарий бухгалтерии: как выполнен возврат по неявке (второй этап учёта на туре).
alter table tour_manifest_absences add column if not exists refund_execution_note text;
