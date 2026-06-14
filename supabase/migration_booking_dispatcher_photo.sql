-- Фото брони с объекта (диспетчер), видно курсоводу/гидам на карточке тура.
alter table bookings add column if not exists dispatcher_booking_photo_url text;
