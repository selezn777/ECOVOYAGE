alter table public.rental_point_expenses
  add column if not exists attachment_url text;

comment on column public.rental_point_expenses.attachment_url is 'Чек / фото расхода (публичный URL из Storage).';
