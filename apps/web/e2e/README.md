# End-to-end test

One spec (`secret-santa.spec.ts`) walks the whole organizer-and-family flow on a phone-sized
screen and checks the privacy rules. It needs a local Supabase stack (which includes Mailpit,
the inbox the test reads) and a built app.

```bash
supabase start                       # applies supabase/migrations; Docker required
supabase status -o env               # ANON_KEY, API_URL, ...
pnpm build

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
export SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
export APP_URL=http://127.0.0.1:3000
export ORGANIZER_EMAILS=organizer@example.com
export SMTP_HOST=127.0.0.1 SMTP_PORT=54325 SMTP_USER=e2e SMTP_PASS=e2e   # Mailpit SMTP
pnpm --filter @santa/web e2e
```

Emails never leave your machine. Chromium: where it is already installed (Claude cloud
sessions) do not run `playwright install`; elsewhere run `pnpm --filter @santa/web exec playwright install chromium`.
CI runs this as the `e2e` job in `.github/workflows/ci.yml`.
