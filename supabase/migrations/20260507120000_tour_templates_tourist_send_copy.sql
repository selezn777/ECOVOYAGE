-- Текст для менеджера: что отправить туристу вместе с квитанцией (время выезда, что взять и т.д.).
alter table public.tour_templates
  add column if not exists tourist_send_copy text;

comment on column public.tour_templates.tourist_send_copy is
  'Шаблонное сообщение для туриста (WhatsApp): время выезда, что взять с собой — копируется кнопкой «Инфо» на карточке брони.';
