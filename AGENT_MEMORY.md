# AGENT MEMORY (Git + Supabase)

Этот файл — постоянная памятка для агента в этом проекте.

## 1) Где реальный git-репозиторий

- Рабочий репозиторий: `/Users/topzonevithanh/Downloads/666/crm-app`
- git-операции всегда из этой папки.

## 2) Правило перед commit/push

```bash
git status --short
git diff
git log -8 --oneline
```
Если изменений разного назначения — уточнить у пользователя что коммитить.

## 3) Supabase: миграции — ТОЛЬКО через CLI, никакого Dashboard

Команда: `npm run db:push:env`
- Пушит только НОВЫЕ миграции (не повторяет уже применённые).
- `npm run db:push:auto` использует `--include-all` → НЕ использовать для обычного пуша (только если явно нужно).

Если CLI говорит "found local migration files to be inserted before last remote" — значит миграция уже применена в БД, но не записана в history. Починить:
```bash
npx supabase migration repair --status applied <версия> --db-url "<pooler_url>"
```

Pooler URL: `postgresql://postgres.stqmwtwztkiqbtjrnent:<пароль>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`

### Переменные в `.env.local`
- `SUPABASE_PROJECT_REF=stqmwtwztkiqbtjrnent`
- `SUPABASE_POOLER_HOST=aws-1-us-east-1.pooler.supabase.com`
- `SUPABASE_POOLER_PORT=6543`
- `SUPABASE_DB_PASSWORD=<пароль>`

## 4) Что уже в БД (не трогать, не пытаться пересоздавать)

- `match_user_by_login_password(p_login, p_password)` — RPC для логина, использует pgcrypto
- `update_user_password(p_user_id, p_new_password)` — обновление пароля с хешем
- `hash_user_password()` — триггер BEFORE INSERT/UPDATE, автохеширует пароли через bcrypt
- `booking_dispatcher` — есть в enum `app_role`
- Миграция `20260509000000_hash_passwords` — применена, помечена в CLI history

## 5) Диагностика ошибок

- `no route to host` → неверный host, нужен pooler (не direct DB)
- `zsh: event not found` → `!` в пароле, использовать `npm run db:push:env`
- `password authentication failed` → неверный `SUPABASE_DB_PASSWORD`
- `prepared statement already exists` → pgbouncer конфликт, **НЕ использовать** `--include-all`; вместо этого `migration repair`

## 6) Роли сотрудников (текущая иерархия)

| Роль | Кто |
|------|-----|
| `director` | Эля (логин: `director`) |
| `chief_manager` | Ушмодина Александра |
| `manager` | 19 менеджеров (включая онлайн) |
| `chief_guide` | Верховодов Руслан |
| `guide` | 15 гидов + тест-демо |
| `accountant` | Сыдыкова Мария |
| `dispatcher` | Le Viet Vong (старший, руководство) |
| `booking_dispatcher` | Бин (подчинённый) |

Документ с паролями: `~/Desktop/asia-mix-crm-accounts.txt`
