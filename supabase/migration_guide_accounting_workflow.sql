-- Опционально: очередь проверки утреннего отчёта / склада для бухгалтерии.
alter table tour_manifests add column if not exists needs_accountant_review boolean not null default false;

-- Распознавание чеков в приложении сохраняет фото в expenses.attachment_url (или в Storage).
-- Колонки receipt_photo_* в bookings текущим кодом OCR не используются - только если вы сами добавите логику.

-- Если расходы без флага «на проверке бухгалтером»:
alter table expenses add column if not exists pending_accountant_review boolean not null default false;
alter table expenses add column if not exists accountant_reviewed_at timestamptz;
alter table expenses add column if not exists accountant_reviewed_by uuid references users(id);
