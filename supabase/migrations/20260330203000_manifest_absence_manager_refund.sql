-- Условия возврата по неявке: менеджер подтверждает «без возврата» или сумму в ₫
alter table tour_manifest_absences
  add column if not exists refund_vnd bigint not null default 0 check (refund_vnd >= 0);

alter table tour_manifest_absences
  add column if not exists manager_refund_acknowledged_at timestamptz;

comment on column tour_manifest_absences.refund_vnd is 'Сумма возврата туристу в ₫ после подтверждения менеджером; пересчёт booking_prices + платёж refund';
comment on column tour_manifest_absences.manager_refund_acknowledged_at is 'Менеджер обработал неявку (нет возврата или указана сумма)';
