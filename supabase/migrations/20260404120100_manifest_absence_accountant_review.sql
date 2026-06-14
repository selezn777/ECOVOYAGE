-- Проверка неявок бухгалтером: решение, факт поехавших, комментарий
alter table public.tour_manifest_absences
  add column if not exists accountant_absence_decision text;

alter table public.tour_manifest_absences
  add column if not exists accountant_absence_comment text;

alter table public.tour_manifest_absences
  add column if not exists accountant_traveled_adults int;

alter table public.tour_manifest_absences
  add column if not exists accountant_traveled_children int;

alter table public.tour_manifest_absences
  add column if not exists accountant_traveled_infants int;

alter table public.tour_manifest_absences
  add column if not exists accountant_absence_reviewed_at timestamptz;

alter table public.tour_manifest_absences
  add column if not exists accountant_absence_reviewed_by uuid references public.users(id);

comment on column public.tour_manifest_absences.accountant_absence_decision is 'approved | rejected - решение бухгалтера по строке неявки';
comment on column public.tour_manifest_absences.accountant_absence_comment is 'Комментарий бухгалтера после проверки';
comment on column public.tour_manifest_absences.accountant_traveled_adults is 'Фактически поехало взрослых (ручной ввод бухгалтера)';
comment on column public.tour_manifest_absences.accountant_traveled_children is 'Фактически поехало детей';
comment on column public.tour_manifest_absences.accountant_traveled_infants is 'Фактически поехало младенцев';
comment on column public.tour_manifest_absences.accountant_absence_reviewed_at is 'Проверка бухгалтером завершена';
