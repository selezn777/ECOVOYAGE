# Asia Mix CRM - Implementation Notes

**Схема запуска и env:** см. [docs/LAUNCH.md](./docs/LAUNCH.md).

## Current status
- Next.js mobile-first MVP scaffold is ready.
- Core pages are created: login, dashboard, tour details, finance, tickets, team, profile, deleted.
- Cookie session auth is implemented (`/api/auth/login`, `/api/auth/logout`).
- Role guards are active on pages:
  - `finance`: director / chief_manager / accountant
  - `team`: все авторизованные (разный контент по роли)
  - `deleted`: director/chief_manager/accountant
- API endpoint for receipt number generation is added:
  - `GET /api/receipt-number`
  - performs DB uniqueness check against `receipts.receipt_number`
  - includes retry logic
- API endpoint for copy-text export is added:
  - `GET /api/tours/:id/copy`
- API endpoint for payments is added:
  - `POST /api/bookings/:id/payments`
- API endpoint for soft-delete booking:
  - `POST /api/bookings/:id/delete`
- API endpoint for restore deleted booking:
  - `POST /api/deleted/:id/restore`
- API endpoint for creating tourists in a tour is added:
  - `POST /api/tours/:id/bookings`
- UI form for new tourist with autosave draft:
  - `/tours/:id/new-booking`
- Supabase SQL schema + RLS policies are provided in `supabase/schema.sql`.

## Run locally
1. Copy env:
   - `cp .env.example .env.local`
2. Fill Supabase values in `.env.local`.
3. In Supabase SQL editor run `supabase/schema.sql`.
4. Start app:
   - `npm install`
   - `npm run dev`
5. Open `http://localhost:3000`.

## What is already encoded from requirements
- VND format with dot groups (`1.000.000 đ`) in UI helpers.
- All tours visible, with role filters (`My tours` / `My sales` placeholders in UI).
- Overbooking warning and large bus hint.
- Booking notes (VIP/allergy/conflict) visible in tour details.
- Booking add flow is live (if Supabase env + schema are configured).
- Separate finance and tickets areas.
- Soft-delete concept represented in schema (`deleted_items`) and deleted screen.
- 1-hour restore window is implemented for deleted bookings.

## Next coding steps (optional hardening)
1. Supabase Auth + маппинг на `users.role`, хеш паролей вместо plain text.
2. Фильтр финансов и отчётов по периоду.
3. UI-форма продажи `ticket_sales` (сейчас агрегация из БД).
4. Расширить тесты API и e2e.
