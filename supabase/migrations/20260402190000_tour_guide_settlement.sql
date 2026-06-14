-- Фиксация финального расчёта с гидом (бухгалтер): кто кому заплатил и подтверждение чеком/переводом.

alter table tours
  add column if not exists guide_settlement_guide_paid_office_at timestamptz,
  add column if not exists guide_settlement_guide_paid_office_proof_url text,
  add column if not exists guide_settlement_office_paid_guide_at timestamptz,
  add column if not exists guide_settlement_office_paid_guide_proof_url text;

comment on column tours.guide_settlement_guide_paid_office_at is 'Бухгалтер: доплаты/сдача от гида в офис приняты';
comment on column tours.guide_settlement_office_paid_guide_at is 'Бухгалтер: выплата гиду из офиса произведена';
