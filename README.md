# EcoVoyage CRM

Next.js (App Router) + Supabase: туры, брони, оплаты, гиды, выходные, квитанции PDF.

## Запуск

- **С компьютера:** [docs/LAUNCH.md](./docs/LAUNCH.md)  
- **С телефона в Wi‑Fi (пошагово и что готово):** [docs/ZAPUSK-TELEFON.md](./docs/ZAPUSK-TELEFON.md)  
- **Telegram (BotFather) + PWA без App Store:** [docs/TELEGRAM-BOTFATHER-PWA.md](./docs/TELEGRAM-BOTFATHER-PWA.md)  
- **Всё сразу: прод → PWA → Telegram → APK и где файлы:** [docs/ZAPUSK-VSE-S-Nulya.md](./docs/ZAPUSK-VSE-S-Nulya.md)  
- **Памятка для агента (git + Supabase):** [AGENT_MEMORY.md](./AGENT_MEMORY.md)
- Для доступа с телефона в локальной сети: `npm run dev:lan` (см. документ выше).

Кратко:

```bash
cp .env.example .env.local
# заполнить NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY
# в Supabase выполнить supabase/schema.sql
npm install && npm run dev
```

Доп. заметки по фичам: [README_IMPLEMENTATION.md](./README_IMPLEMENTATION.md).
