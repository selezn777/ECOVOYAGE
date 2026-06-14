-- Прайс тура при создании (USD + курс → VND), для броней без шаблона и как снимок
alter table tours add column if not exists default_offer_usd numeric(12,4);
alter table tours add column if not exists default_offer_rate_to_vnd numeric(12,4) not null default 26000;
alter table tours add column if not exists default_offer_vnd bigint not null default 0;

comment on column tours.default_offer_usd is 'Прайс тура в USD на момент создания';
comment on column tours.default_offer_rate_to_vnd is 'Курс USD→VND при создании тура';
comment on column tours.default_offer_vnd is 'Прайс в VND (округление от USD×курс)';
