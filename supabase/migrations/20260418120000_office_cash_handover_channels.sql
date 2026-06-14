-- Справочник каналов сдачи (валюта / форма поступления). Системные строки нельзя удалить через API.
-- tour_office_cash_handovers: вместо enum channel - ссылка channel_id.

create table if not exists public.office_cash_handover_channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  label text not null,
  sort_order int not null default 0,
  is_system boolean not null default false,
  expects_usd_amount boolean not null default false,
  created_at timestamptz not null default now(),
  constraint office_cash_handover_channels_label_unique unique (label)
);

comment on table public.office_cash_handover_channels is 'Каналы сдачи с туров в кассу (валюта, банк); пополняется из страницы Касса';

insert into public.office_cash_handover_channels (slug, label, sort_order, is_system, expects_usd_amount)
values
  ('kz_bank', 'Перевод на банк Казахстана', 10, true, false),
  ('ru_bank', 'Перевод на банк РФ', 20, true, false),
  ('vn_bank', 'Перевод на вьетнамский банк', 30, true, false),
  ('cash_vnd', 'Наличные донги', 40, true, false),
  ('cash_usd', 'Наличные доллары США', 50, true, true)
on conflict (slug) do nothing;

alter table public.tour_office_cash_handovers
  add column if not exists channel_id uuid references public.office_cash_handover_channels (id) on delete set null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tour_office_cash_handovers'
      and column_name = 'channel'
  ) then
    update public.tour_office_cash_handovers h
    set channel_id = c.id
    from public.office_cash_handover_channels c
    where h.channel_id is null
      and c.slug = h.channel;

    update public.tour_office_cash_handovers
    set channel_id = (select id from public.office_cash_handover_channels where slug = 'cash_vnd' limit 1)
    where channel_id is null;

    alter table public.tour_office_cash_handovers drop constraint if exists tour_office_cash_handovers_channel_check;
    alter table public.tour_office_cash_handovers drop column channel;
  end if;
end $$;

create index if not exists idx_tour_office_cash_handovers_channel_id
  on public.tour_office_cash_handovers (channel_id)
  where channel_id is not null;
