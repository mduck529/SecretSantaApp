# Secret Santa

Draw names with rules (no spouses, etc.), tell your Secret Santa what you'd love,
and get gift ideas. Web first, iOS and Android later. See [`docs/PLAN.md`](docs/PLAN.md).

## Layout

| Path | What |
|---|---|
| `packages/core` | Draw algorithm, rule handling, post-draw repairs (add/remove someone), validation. Pure TypeScript, shared by web and mobile. |
| `apps/web` | Next.js web app |
| `supabase/migrations` | Database schema and privacy rules (Row Level Security) |
| `supabase/tests` | Privacy tests run against plain Postgres |

## Privacy rules (enforced in the database)

- Everyone, **the organizer included**, can see only their own match until the organizer turns on "reveal" after the exchange.
- Questionnaire answers are visible only to the person and their Secret Santa.
- Matches are written only by the server; the organizer's screens get counts, never pairings.

## Develop

Requires Node 22 and pnpm.

```bash
pnpm install
```

```bash
pnpm test        # draw algorithm tests
```

```bash
scripts/test-db.sh   # schema + privacy tests (needs a local Postgres)
```

```bash
cp apps/web/.env.example apps/web/.env.local   # then fill in Supabase keys
pnpm dev
```
