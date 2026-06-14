-- Комментарий бухгалтера к блоку «водитель / диспетчер / букинг» на сводке тура
alter table tours
  add column if not exists accountant_dispatch_expenses_note text;

comment on column tours.accountant_dispatch_expenses_note is 'Бухгалтер: заметка по расходам водителя/диспетчера/букинга';
