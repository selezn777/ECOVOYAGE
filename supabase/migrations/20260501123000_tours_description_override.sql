-- Текст описания/локаций для конкретного выезда (перекрывает шаблон при просмотре тура).
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS description_override text;

COMMENT ON COLUMN public.tours.description_override IS 'Полное описание тура для этого выезда (включая блок локаций AMX). Если NULL — используется описание из tour_templates.';
