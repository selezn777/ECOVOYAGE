-- Сообщение гида туристу (утром: автобус, время, локации)
-- Редактирует: chief_guide / director
alter table public.tour_templates
  add column if not exists guide_tourist_message text null;

-- Сообщение-запрос отзыва после тура
-- Редактирует: chief_guide / director
alter table public.tour_templates
  add column if not exists review_message text null;

-- Флаг: приветственное сообщение туристу отправлено
-- Убирает prefill при повторных открытиях карточки
alter table public.bookings
  add column if not exists briefing_sent_at timestamptz null;
