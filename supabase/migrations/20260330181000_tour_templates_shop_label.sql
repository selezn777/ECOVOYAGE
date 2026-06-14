-- Название “магазина” в доп. заработке гида (задаёт старший гид в шаблоне).
alter table tour_templates add column if not exists shop_label text;

