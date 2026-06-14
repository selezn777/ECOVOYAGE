# Asia Mix CRM — Claude Code Context

## ⚠️ ОБЯЗАТЕЛЬНО ПЕРЕД ЛЮБЫМ ДЕЙСТВИЕМ

```
1. Write ~/second-brain/Tasks/YYYY-MM-DD-название.md  ← ДО кода
2. Реализовать
3. Дописать результат + коммиты в тот же файл         ← ПОСЛЕ кода
4. Добавить запись в ~/second-brain/Projects/asia-mix-crm-log.md
```
**ВСЕГДА. Даже для мелких правок. Даже после резета сессии. Без исключений.**

Стиль пользователя: `~/second-brain/STYLE.md`

---

## Проект
CRM для турагентства Asia Mix (Вьетнам).
- **Local:** `/Users/topzonevithanh/Downloads/666/crm-app`
- **GitHub:** `selezn777/ASIAMIXXX`
- **Deploy:** `asiamix.vercel.app` (Vercel, auto-deploy из `main`)
- **Second Brain:** GitHub: `selezn777/second-brain`, локальная копия: `~/second-brain`

## Стек
- Next.js 15 (App Router, Server Components by default)
- Supabase (PostgreSQL + RLS)
- Tailwind CSS v4
- Capacitor (Android + iOS)

## Supabase миграции

Только через pooler (не direct DB):
```bash
npm run db:push:auto
```

Переменные: `SUPABASE_PROJECT_REF`, `SUPABASE_POOLER_HOST`, `SUPABASE_POOLER_PORT`, `SUPABASE_DB_PASSWORD`

## Поиск в коде

```bash
grep -r "ПАТТЕРН" src/ --include="*.tsx" -l
grep -r "ПАТТЕРН" src/ --include="*.ts" -l
```

## Важные паттерны

- `window.location.href` — всегда при смене tour_id (не router.push)
- Системные cash entries — через getSupabaseAdmin() напрямую
- `TourStatus` = `"active" | "completed" | "deleted"` (нет `"closed"`)
- Mobile keyboard: `padding-bottom: 35vh` в `.app-wrap` — не убирать
- 8+ вкладок на mobile → `<select>` на mobile, tabs на desktop (md+)
- Серверные компоненты → `getSupabaseAdmin()`, клиентские → отдельный клиент
- Права доступа: `src/lib/role-policy.ts` и `src/lib/booking-privacy.ts`

## Диагностика Supabase

- `no route to host` → неверный host, нужен pooler
- `zsh: event not found` → `!` в пароле, использовать `npm run db:push:auto`
- `password authentication failed` → неверный `SUPABASE_DB_PASSWORD`
