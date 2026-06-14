# Working Memory (Operator Notes)

This file is a fast restart cache for long pauses.

## Current Operating Mode

- Primary target: stable web app on Vercel.
- APK/Android is deferred until explicitly requested.
- Supabase is the production data source.

## Important Invariants

- Login flow is custom: API checks `public.users.login/password` with service role.
- Session is cookie-based (`amx_session`), role-based page guards are active.
- Do not replace auth model during unrelated bugfixes.

## Database Boot Order (Fresh Project)

1. Apply `supabase/schema.sql`
2. Apply `supabase/migrations/*` (via `supabase db push`)
3. Apply optional seeds:
   - `supabase/seed-users.sql` (required for login accounts)
   - `supabase/seed-ticket-templates.sql` (if ticket templates are needed)

## Known Gotchas

- `20260402183000_bookings_online_code.sql` was fixed for empty DB (`setval` minimum 1).
- Manual SQL files in `supabase/migration_*.sql` are mostly legacy/manual patches; run only if a specific missing feature requires them.
- Vercel deploy confusion often comes from queue/blocked status, wrong project, or stale cache - not from missing git push.

## Environment Must Match Across Services

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

These must point to the same Supabase project used for migrations and seeds.

## Mobile Notes (Deferred)

- `CAP_SERVER_URL` is loaded from `.env.mobile`/`.env.local` by `npm run mobile:sync`.
- APK build requires Android SDK; without SDK, Gradle build will fail.
- Keep mobile tooling changes isolated from web feature work.

## How To Resume Work Safely

1. Restate user goal in one sentence.
2. Touch only directly related files first.
3. Avoid speculative cleanups and broad rewrites.
4. Run lint/typecheck after substantial edits.
5. Summarize exactly what changed and why.
