# EcoVoyage CRM — Claude Code Context

## ⚠️ ОБЯЗАТЕЛЬНО ПЕРЕД ЛЮБЫМ ДЕЙСТВИЕМ

```
1. Write ~/second-brain/Tasks/YYYY-MM-DD-название.md  ← ДО кода
2. Реализовать
3. Дописать результат + коммиты в тот же файл         ← ПОСЛЕ кода
4. Добавить запись в ~/second-brain/Projects/ecovoyage-crm-log.md
```
**ВСЕГДА. Даже для мелких правок. Даже после резета сессии. Без исключений.**

Стиль пользователя: `~/second-brain/STYLE.md`

---

## Проект
CRM для турагентства EcoVoyage (Вьетнам) — форк Asia Mix CRM с новым брендом.
- **Local:** `/Users/topzonevithanh/Downloads/ecovoyage-app`
- **GitHub:** ещё не создан (Phase B)
- **Deploy:** `eco.vercel.app` — ещё не настроен (Phase B, нужен `vercel login`)
- **Supabase:** отдельный проект, ещё не создан (Phase B) — `.env.local` содержит placeholder-значения
- **Second Brain:** `~/second-brain/Projects/ecovoyage-crm.md` + `ecovoyage-crm-log.md`
- **Источник форка:** `/Users/topzonevithanh/Downloads/666/crm-app` (Asia Mix CRM, `asiamix.vercel.app`) — **НЕ трогать**, законсервирован тегом `pre-ecovoyage-fork-2026-06-14`

## Брендинг
- Лого: `public/ecovoyage-mark.png` (силуэт цапли, салатовый зелёный)
- PWA-иконки: `public/pwa-icon-{192,512,180}.png` (из `~/Desktop/ecovoyage-ptica-logo.webp`, жёлто-зелёный градиент)
- Палитра (light): `--accent: #a8ce40`, `--accent-dark: #8dab3b`, `--accent-soft: #f8fcee`
- Палитра (dark): `--accent: #bbe250`, `--accent-dark: #a7d133`, `--accent-soft: rgba(187,226,80,0.14)`
- Остальные токены (`--success`, `--danger` и т.д.) не менялись

## Стек
- Next.js 15 (App Router, Server Components by default)
- Supabase (PostgreSQL + RLS)
- Tailwind CSS v4
- Capacitor (Android + iOS) — appId `com.ecovoyage.crm` (rebrand Android/iOS — Phase C)

## Supabase миграции

Только через pooler (не direct DB):
```bash
npm run db:push:env
```

Переменные: `SUPABASE_PROJECT_REF`, `SUPABASE_POOLER_HOST`, `SUPABASE_POOLER_PORT`, `SUPABASE_DB_PASSWORD` — заполняются в Phase B.

## Стартовый seed (минимальный)

```bash
node scripts/reset-and-seed.mjs --create-accounts   # 1 директор + малый placeholder-состав
node scripts/seed-tour-templates.mjs                # 3 placeholder-шаблона туров
```
Реальные туры и сотрудники добавляются директором через UI (Phase C).

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
- Навигация: mobile (< md) — fixed bottom tab bar (`src/components/bottom-nav.tsx`, иконки из `src/components/nav-icons.tsx`), desktop (md+) — ряд вкладок наверху. Конфиг ролей — `src/lib/nav-items.ts` (`navAll`/`navForRole`/`navItemIsActive`), общий для top-nav и bottom-nav
- Серверные компоненты → `getSupabaseAdmin()`, клиентские → отдельный клиент
- Права доступа: `src/lib/role-policy.ts` и `src/lib/booking-privacy.ts`

## Диагностика Supabase

- `no route to host` → неверный host, нужен pooler
- `zsh: event not found` → `!` в пароле, использовать `npm run db:push:env`
- `password authentication failed` → неверный `SUPABASE_DB_PASSWORD`
