-- Шаблон оперативной заметки диспетчера для тура.
-- Для многодневных и sleep-bus туров — преполняет поле заметки при первом открытии.
alter table public.tour_templates
  add column if not exists dispatcher_note_template text null;
