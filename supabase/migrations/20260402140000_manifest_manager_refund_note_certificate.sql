alter table tour_manifest_absences add column if not exists manager_refund_note text;
alter table tour_manifest_absences add column if not exists manager_refund_certificate_url text;

comment on column tour_manifest_absences.manager_refund_note is 'Комментарий менеджера при подтверждении возврата по неявке';
comment on column tour_manifest_absences.manager_refund_certificate_url is 'Справка от туриста (фото), если приложена';
