# ATLAS — ASIAMIXXX CRM · Мастер-контекст
*Обновлено: 2026-05-10 | v2.1 — рефреш аккаунтов, migration rules*

---

## 🏗️ Стек и инфраструктура
- **Framework:** Next.js 15 (App Router, Server Components by default)
- **DB:** Supabase (PostgreSQL + Row Level Security)
- **Стили:** Tailwind CSS v4 (кастомные токены через CSS vars в `globals.css`)
- **Deploy:** Vercel (auto-deploy из `main` ветки GitHub) → **asiamix.vercel.app**
- **Repo:** `selezn777/ASIAMIXXX` | Local: `/Users/topzonevithanh/Downloads/666/crm-app`
- **Second Brain:** `selezn777/second-brain` | Local: `~/Documents/SecondBrain`

---

## 👥 Роли и права доступа

| Роль | Что видит |
|---|---|
| `director` | Всё. View-as любой роли. |
| `chief_manager` | Все туры, все брони, финансы, команда |
| `manager` | Свои туры и брони (по `manager_id`) |
| `guide` / `chief_guide` | Только свои назначенные туры |
| `dispatcher` / `booking_dispatcher` | Автобусы, перевозки |
| `accountant` | Финансовые отчёты, зарплаты |

**Паспорта (`passport_photo_urls`):** только `director`, `chief_manager`, менеджер-владелец брони, гид назначенный на конкретный тур.
**Ключевые файлы прав:** `src/lib/role-policy.ts`, `src/lib/booking-privacy.ts`

---

## 🗂️ Карта роутов (src/app/)

| Роут | Описание |
|---|---|
| `/dashboard` | Главная. Список туров с поиском. |
| `/tours/[id]` | Карточка тура (брони, автобус, гиды) |
| `/tours/[id]/new-booking` | Новое бронирование на тур |
| `/bookings/[id]` | Карточка бронирования |
| `/bookings/[id]/duplicate` | Записать туриста на другой тур |
| `/tickets` | Продажа билетов/трансферов |
| `/finance/reports` | Финансовый отчёт по датам |
| `/accounting` | Бухгалтерия туров |
| `/cash` | Кассовые операции |
| `/team` | Команда и зарплаты |
| `/sales-points` | Точки продаж |
| `/login` | Авторизация |

---

## 🧩 Ключевые компоненты (src/components/)

| Файл | Назначение |
|---|---|
| `top-nav.tsx` | Верхняя навигация (роль-зависимая) |
| `tour-card.tsx` | Карточка тура в списке |
| `dashboard-tour-filters.tsx` | Поиск туров с dropdown (UpcomingTour type) |
| `tour-booking-card.tsx` | Карточка брони внутри тура |
| `new-booking-step-payment.tsx` | Форма оплаты при бронировании |
| `ticket-sale-form.tsx` | Форма продажи билета |
| `ticket-sales-history.tsx` | История продаж менеджера |
| `ticket-template-manager.tsx` | Управление шаблонами билетов |
| `dispatcher-bus-quick-form.tsx` | Быстрая форма автобуса |
| `transfer-booking-form.tsx` | Перенос бронирования |

---

## 📚 Ключевые lib-файлы (src/lib/)

| Файл | Назначение |
|---|---|
| `data.ts` | Все запросы к Supabase (listTours, listBookings...) |
| `types.ts` | Типы: `TourStatus = "active"\|"completed"\|"deleted"` |
| `role-policy.ts` | Константы ролей для каждой фичи |
| `scheduling.ts` | Даты: `tourBusinessTodayYmd()`, `formatYmdWithWeekdayRu()` |
| `auth-session.ts` | `requireAuth()` — проверка сессии |
| `supabase-admin.ts` | `getSupabaseAdmin()` — серверный клиент |
| `booking-privacy.ts` | Политики доступа к данным туристов |
| `format.ts` | Форматирование сумм, дат |

---

## ⚠️ Важные паттерны и gotchas

1. **TourStatus** = `"active" | "completed" | "deleted"` — нет `"closed"` или `"open"`!
2. **Mobile клавиатура:** `padding-bottom: 35vh` в `.app-wrap` (globals.css) — не убирать!
3. **UpcomingTour тип** в `dashboard-tour-filters.tsx`: `{id, name, dateLabel, booked, capacity}`
4. **Поиск туров:** клик по пункту в dropdown сразу делает `router.push` к туру (не нужна кнопка "Найти")
5. **Бронь на другой тур:** `/bookings/[id]/duplicate` + `fromBooking` query param → передаётся в форму
6. **Паспорта в Storage:** политики RLS на уровне Supabase Storage bucket, не только API
7. **Все серверные компоненты** используют `getSupabaseAdmin()`, клиентские — отдельный клиент

---

## ✅ История завершённых задач

| Дата | Задача | Коммит |
|---|---|---|
| 2026-05-10 | Поиск туров: dropdown с датой и кол-вом мест | `80913e6` |
| 2026-05-10 | `/finance/reports`: отчёт по датам (director + chief_manager) | `7ba5383` |
| 2026-05-10 | `/tickets`: полный UI продажи + шаблоны | `9b9203a` |
| 2026-05-10 | ATLAS архитектура: `.claudeignore`, `.claude.md`, `ai.sh` | `34a6e81` |
| 2026-05-10 | Полный сброс БД + 40 аккаунтов сотрудников | `8ef1881` |
| 2026-05-10 | Ротация cookie сессий (`amx_session_v2`) | `213c2da` |
| 2026-05-11 | fix: аватар-кроп — portal + EXIF ручное чтение | `3b5e12f` |

---

## 🔜 Открытые задачи (Next Steps)
*(пусто)*

---

## 🤖 ATLAS Правила для агентов

1. **Читай только ЭТОТ файл** на старте. Не сканируй весь проект.
2. **Grep для поиска кода:** `grep -r "ПАТТЕРН" src/ --include="*.tsx" -l`
3. **Цикл EPIC:** Explore (grep) → Plan → Implement → Commit
4. **После задачи:** обнови этот файл → `git commit -am "feat: ..."` → `bash ~/Documents/SecondBrain/sync.sh`
5. **Не удалять** поле `updated:` в frontmatter заметок Obsidian — только обновлять.
6. **Миграции:** только `npm run db:push:env` (НЕ `db:push:auto`/`--include-all`). Подробности в `AGENT_MEMORY.md`.

---

## 👥 Текущий состав команды (2026-05-10)

| Роль | Имя | Логин |
|------|-----|-------|
| `director` | Эля | `director` / `AsiaMix00!` |
| `chief_manager` | Ушмодина Александра | `aleksandra` |
| `chief_guide` | Верховодов Руслан | `ruslan.v` |
| `accountant` | Сыдыкова Мария | `maria.s` |
| `dispatcher` | Le Viet Vong (старший офиса) | `le.vong` |
| `booking_dispatcher` | Бин (подчинённый) | `bin` |
| `manager` | 19 менеджеров | `katerina.t` … `aiya` |
| `guide` | 15 гидов + тест | `artur.a` … `test` |

Полные пароли: `~/Desktop/asia-mix-crm-accounts.txt`
Скрипт пересоздания: `scripts/reset-and-seed.mjs`
