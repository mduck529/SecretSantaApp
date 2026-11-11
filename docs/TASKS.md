# Status review and task plan

_Reviewed 2026-11-11 (Wed). Family launch is **Fri Nov 13**. Gift ideas are due **Fri Nov 20**._

This file is the working queue. [`PLAN.md`](PLAN.md) is the long-range product plan;
[`SETUP.md`](SETUP.md) is the account checklist. Each task below is written so a model
can pick it up cold. Read "Rules for every task" first.

---

## 1. Where we are

### Verified working (at commit `709a586`)

| Check | Result |
|---|---|
| `pnpm build` | Passes |
| `pnpm typecheck` | Passes |
| `pnpm test` | 35 pass (18 draw/questionnaire in `packages/core`, 17 in `apps/web`) |
| `scripts/test-db.sh` | All privacy checks pass on Postgres 16 |
| GitHub CI | Green on the last 5 pushes |

### Built

- **Draw** (`packages/core`): single-loop draw with fallback, plain-language explanation
  when rules make it impossible, minimal-change repair for add/remove after the draw.
- **Database** (`supabase/migrations`): 8 tables, Row Level Security so nobody (organizer
  included) reads another person's match; answers visible only to the person and their Santa.
- **Web app** (`apps/web`): emailed sign-in link, create group, roster with phone and
  "can't draw" rules, Match, Send, resend, reminders, remove/add after Send, settings,
  person page (my match + my questionnaire), giftee-updated emails with a 30-minute
  throttle and a daily sweep.
- **Email**: Gmail SMTP through Nodemailer (replaced Resend in `709a586`).

### Live services (checked through their APIs)

| Service | State |
|---|---|
| Supabase project "Secret Santa 2026" | Healthy. Schema applied (8 tables, 11 policies). 0 users. Auth emails go through Gmail SMTP, sign-in links last 24 h |
| Vercel project `secretsantaapp-web` | Deployed at `secretsantaapp-web.vercel.app` |

### Not working yet: production cannot run the organizer flow or send email

| # | Problem | Effect |
|---|---|---|
| 1 | Vercel's production branch is `claude/gracious-thompson-la2itv` (`baf367f`), which still has the **Resend** code. The Gmail commit is only on `claude/vibrant-keller-lawd4h` | Every app email throws "RESEND_API_KEY is not set" |
| 2 | `SUPABASE_SERVICE_ROLE_KEY` is not set in Vercel | Every organizer action (add person, Match, Send) fails |
| 3 | `CRON_SECRET` is not set in Vercel | The daily sweep returns 401, so throttled "giftee updated" emails can be held indefinitely |
| 4 | A misspelled variable `STMP_PASS` exists next to the real `SMTP_PASS` | Harmless, but confusing. Delete it |
| 5 | Supabase `rate_limit_email_sent` is **2 per hour** for the whole project | Only two people per hour can request a fresh sign-in link |
| 6 | The repo has no `main` branch and no pull requests; work sits on three `claude/*` branches | Nothing marks which code is "the" code |
| 7 | The Supabase schema was applied by hand, so its migration history is empty | Later migrations need a tracked way to reach production (task L7) |

### Not built

| Item | Plan step | Needed for launch? |
|---|---|---|
| End-to-end test | 1.9 | Yes (or a careful manual dry run) |
| Security and privacy review | 1.8 | Yes |
| Seed data | 0.5 | No, but helps the dry run |
| Notice to the old address when an organizer changes someone's email | Risk table | Recommended |
| Reveal after the exchange (column exists, no button) | Admin controls | No (needed by exchange day) |
| Announcement email, co-organizer, audit log screen | Admin controls | No |
| Gift ideas | Phase 2 | No (due Nov 20) |
| Anonymous Santa ↔ giftee messaging | 2.6 | No |

---

## 2. Review findings

Ordered by how likely each is to hurt the family launch.

### A. Sign-in links are fragile (highest launch risk)

1. **A used link is dead even for a signed-in person.** Links are one-time. Someone who
   reopens their match email on the same phone taps Continue, `verifyOtp` fails, and
   `confirmSignIn` (`apps/web/app/auth/confirm/actions.ts`) sends them to
   "That link has expired" although their session is still valid.
2. **Each new email kills the previous link.** `signInLink` (`apps/web/lib/links.ts`) calls
   `generateLink`, and Supabase keeps one token per user. A reminder sent after the match
   email invalidates the match email's link.
3. **Links expire after 24 hours** (Supabase's maximum). Anyone who opens the match email on
   day two must request a fresh link, and finding 5 above then limits that to two people an hour.
4. The Supabase sign-in email template hard-codes `next=/home`, so the page a person was
   headed to is lost after a fresh link.

### B. Organizer flow edge cases (`apps/web/lib/group-service.ts`)

1. **Stranded member after Send.** `addMember` inserts the person, then tries to splice them
   into the loop. If the rules block the splice (or `save_assignments` throws), the person
   stays in the roster with no match. From then on `save_assignments` rejects every repair
   ("expected N matches, got N-1"), and `removeMember` refuses to remove them because it
   treats `not_in_draw` the same as `needs_redraw`. The only way out is a full re-match.
2. **Send marks the group "sent" even if no email went out** (`sendAllMatches`). Wrong
   password or a Gmail outage leaves a "sent" group with all emails failed.
3. **No guard against a double Send** (two tabs, or a retry after a slow response): everyone
   gets two emails, and the second kills the first one's link (finding A2).
4. **Re-match after Send leaves `match_email_status = 'sent'`** from the earlier round, so the
   dashboard shows everyone as emailed when nobody has the new match. The second Send also
   uses "You're X's Secret Santa!" wording rather than "your match has changed".
5. **Send is slow and sequential**: per person, two Supabase admin calls plus one SMTP send.
   About 12 people should finish in well under a minute, but no `maxDuration` is set.
6. `deliverProfileUpdates` reads every notification row on each save and has no lock, so
   two saves in the same second can email a Santa twice. Fine for one family.

### C. Abuse and privacy

1. **Anyone on the internet can sign up, create a group, and email strangers from the
   family Gmail account.** Supabase sign-up is open and `create_group` is callable by any
   signed-in user. Gmail may suspend the account for this, which would also break sign-in.
2. **An organizer can change someone's email to their own, press Resend, and read that
   person's match.** PLAN.md accepts this risk but promises a notice to the old address;
   that notice is not implemented.
3. Every member can read every other member's email address (`memberships_select`). Fine
   for a family; revisit before the public beta.
4. **Shared email addresses do not work.** `unique (group_id, email)` blocks adding two
   people with one address, and one login holding two memberships in a group breaks
   `requireMember` (`maybeSingle` errors on two rows). Workaround with no code: Gmail
   plus-addresses, such as `name+grandpa@gmail.com`.

### D. Testing and upkeep

1. `group-service.ts` (640 lines, the riskiest file) has tests only for its pure helpers.
   No test runs Match, Send, or a repair against a database.
2. No end-to-end test; nobody has yet run the whole flow against real Supabase and Gmail.
3. CI tests the schema on Postgres 16; production is Postgres 17.
4. Vercel builds on Node 26; README and CI say Node 22.
5. No lint script (`turbo lint` runs nothing).
6. Stale docs: PLAN.md's progress table, architecture tree (`packages/db`, `api-client`,
   `ui` do not exist) and data model (table names differ from the real schema);
   `apps/web/lib/supabase/admin.ts` points at a `lib/draw-service.ts` that does not exist.

---

## 3. Rules for every task

1. **Start from `main`** once task H1 creates it (until then, from the newest `claude/*`
   branch). One task per branch, one pull request per task.
2. **Match-blind rule.** No organizer-facing screen, server action result, log line, or
   audit entry may contain or imply who has whom. Service-role code may read `assignments`
   only to draw, repair, or email, and must return counts and plain messages only.
3. **Never edit `20261107000000_initial_schema.sql`.** It is applied in production. Schema
   changes go in a new timestamped file in `supabase/migrations/`, with new checks added to
   `supabase/tests/rls_test.sql`.
4. **Do not apply migrations or change Vercel/Supabase settings** unless the task says so
   and the owner has approved. Say what needs applying in the pull request.
5. **Never send email to real family addresses while testing.** Use the dev mode (leave
   `SMTP_PASS` empty and emails print to the server log) or addresses the owner supplies.
6. **No secrets in code, commits, logs, or chat.**
7. **Before pushing, all four must pass:**

   ```bash
   pnpm build
   ```

   ```bash
   pnpm typecheck
   ```

   ```bash
   pnpm test
   ```

   ```bash
   scripts/test-db.sh
   ```

   The last one needs a local Postgres (`PGHOST`, `PGUSER`, `PGPASSWORD`).
8. Keep copy plain and friendly: the audience includes grandparents on phones.
9. When a task is finished, tick it in section 5 of this file in the same pull request.

Model guide (same as PLAN.md): **Opus 5.5** (`claude-opus-5-5`) for security, the draw,
data model and reviews; **Sonnet 5.5** (`claude-sonnet-5-5`) for features and tests;
**Haiku 5.5** (`claude-haiku-5-5`) for copy, docs, seed data.

---

## 4. Tasks

### Track H: owner actions (settings and decisions)

| ID | Action | When |
|---|---|---|
| H1 | Create `main` from `709a586` (or later) and make it the GitHub default branch. In Vercel → Settings → Git, set the production branch to `main` | Today |
| H2 | Vercel → Settings → Environment Variables: add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` (any long random string) for Production and Preview; delete `STMP_PASS`; redeploy | Today |
| H3 | Supabase → Authentication → Rate Limits: raise "emails sent" from 2 to 100 per hour | Today |
| H4 | Decide: does anyone in the family share an email address? (finding C4) | Today |
| H5 | Dry run with a throwaway group and 2–3 people, following the checklist in task L8 | Thu Nov 12 |
| H6 | Launch: create the real group, add everyone, Match, Send | Fri Nov 13 |
| H7 | Add `ANTHROPIC_API_KEY` to Vercel (needed by track G) | By Mon Nov 16 |

### Track L: launch (finish by Thu Nov 12)

Suggested order: L1 and L2 first (in parallel), then L3, L4, L5; L6 reviews all of them.

---

#### L1. Make sign-in links forgiving — **Sonnet 5.5**

Fixes findings A1 and A4. Small, no schema change.

- In `confirmSignIn`, when `verifyOtp` fails, call `supabase.auth.getUser()`. If a user is
  signed in **and** their email equals the `email` form field (case-insensitive), run
  `claim_memberships` and redirect to `next`. If the `email` field is empty, do the same
  for any signed-in user.
- In `ConfirmPage`, if that same condition already holds, redirect to `next` without
  showing Continue.
- If someone is signed in as a **different** email than the link's, sign them out and
  proceed with the link as today.
- `sendLoginLink` already passes `next` in `emailRedirectTo`. Change the Supabase template
  line in `docs/SETUP.md` to use `{{ .RedirectTo }}` so `next` survives, falling back to
  `/home`; keep `safeNext` on the receiving side. Note in the pull request that the owner
  must paste the new template into Supabase.

Done when: unit tests cover the decision (extract it into a pure function in
`lib/auth.ts`: inputs are verify result, session email, link email; output is one of
`go`, `expired`); a signed-in person reopening an old link lands on their page.

---

#### L2. Fix the organizer edge cases — **Opus 5.5**

Fixes findings B1–B5. Touches the riskiest file; keep the match-blind rule.

1. **Stranded member (B1).** In `addMember` when the group is `sent`: if the splice fails
   or saving throws, delete the membership that was just inserted and return
   `ok: false` with "Couldn't fit {name} in without changing everyone's match. Re-match
   everyone to include them." In `removeMember`, handle `reason === "not_in_draw"` by
   deleting the membership directly (no repair needed).
2. **Send only counts when something was sent (B2).** In `sendAllMatches`, if zero emails
   succeeded, leave the group `matched` and return `ok: false` with a message to check the
   email settings and try again.
3. **Double Send (B3).** Claim the send atomically before emailing: update `groups` set
   `status = 'sent'` where `id = gid and status = 'matched'`, and continue only if a row
   was returned. If every email then fails, set it back to `matched` (covers item 2).
4. **Re-match hygiene (B4).** New migration: replace `save_assignments` so that for
   `draw` and `redraw` it resets every membership in the group to
   `match_email_status = 'not_sent'`, `match_email_sent_at = null`. Have it also record on
   the group whether an earlier round was already sent (for example
   `groups.resend_as_changed boolean`), and have `sendAllMatches` pass `changedIds` for
   everyone when that flag is set, then clear it.
5. **Time limit (B5).** Add `export const maxDuration = 60` to
   `apps/web/app/g/[id]/admin/page.tsx`.

Done when: new checks in `rls_test.sql` cover the reset; `pnpm test` covers the pure parts;
the pull request lists the migration for the owner to apply (see L7).

---

#### L3. Close the open door — **Sonnet 5.5**, reviewed in L6

Fixes finding C1.

- Add env var `ORGANIZER_EMAILS` (comma-separated, lowercase). `createGroup`
  (`apps/web/app/new/actions.ts`) and `/new` refuse anyone not on the list with a friendly
  message. Unset means nobody can create a group in production (allow all only when
  `NODE_ENV !== "production"`).
- New migration: `revoke execute on function public.create_group(...) from authenticated`.
  The server action checks the allow-list, then calls `create_group` in a way that still
  records the caller as organizer (add `owner_id uuid, owner_email text` parameters to a
  service-role-only version; do not trust client input for either).
- In `sendLoginLink`, pass `shouldCreateUser: false` unless the email is in
  `ORGANIZER_EMAILS`. Roster members already get accounts from `signInLink`. Keep the
  success message identical in both cases so the form does not reveal who has an account.
- Update `.env.example`, `docs/SETUP.md`, and the privacy tests (a normal signed-in user
  can no longer call `create_group`).

Done when: a stranger can neither create a group nor trigger email to an address that is
not on a roster.

---

#### L4. Tell people when their email is changed — **Sonnet 5.5** (copy: **Haiku 5.5**)

Fixes finding C2, the mitigation PLAN.md promises.

- In `updateMember`, when the email changes and the group is `matched` or `sent`, email the
  **old** address: "The organizer of {group} changed your email to {masked new address}.
  If that wasn't expected, reply to this email or tell them." No sign-in link in it.
- Add `emailChangedNotice` to `lib/email/templates.ts` with a unit test (including HTML
  escaping), and mask the new address (`a•••@example.com`).
- Record `email_changed: true` in the audit log (already done) and say in the organizer's
  result message that the person was told.

---

#### L5. End-to-end test — **Sonnet 5.5**

Plan step 1.9. Fixes findings D1 and D2.

- Add Playwright to `apps/web` (`pnpm --filter @santa/web e2e`). In this cloud
  environment Chromium is preinstalled; do not run `playwright install` here.
- Add a CI job that runs `supabase start` (Docker works on GitHub runners; it does not in
  the Claude cloud sandbox), applies migrations, and starts the app with
  `SMTP_HOST=127.0.0.1`, the local Mailpit SMTP port from `supabase status`, and any
  non-empty `SMTP_USER`/`SMTP_PASS`. Read both sign-in and app emails from Mailpit's HTTP API.
- One spec, phone viewport, covering: organizer signs in → creates group → adds 5 people
  with one couple rule → Match → Send → a member opens their email link → sees a giftee who
  is not their excluded partner → saves the questionnaire → that member's Santa receives
  the "updated" email → organizer resends one email → organizer removes one person and
  exactly one "match changed" email goes out.
- **Privacy assertions:** capture every response body the organizer's browser receives on
  `/g/[id]/admin` (page and server actions) and assert no body contains a
  giver/receiver pairing; as the organizer, query `assignments` through the Supabase REST
  API and assert exactly one row comes back.

Done when: the job is green in CI and fails if `assignments_own` is loosened.

---

#### L6. Security and privacy review — **Opus 5.5**

Plan step 1.8. Run after L1–L4 are merged. Use the `/security-review` skill on the diff
since `baf367f`, then check by hand:

- Every `createAdminClient()` call site: does anything derived from `assignments` reach a
  return value, a log, a redirect, or an audit entry? Include error messages and timing
  (for example, a message that differs depending on who someone's Santa is).
- Counts shown to the organizer: can "N people got a new match" plus the roster identify a
  pair in a 3- or 4-person group? Decide a minimum group size for repairs if so.
- RLS: re-read each policy and helper against the current tables; confirm
  `profile_notifications` is unreadable; confirm column grants on `groups` and
  `questionnaire_answers` are still minimal.
- Sign-in: `safeNext` open-redirect cases, token in URL (referrer policy, no third-party
  requests on `/auth/confirm`), the L1 shortcut cannot switch accounts, `/api/cron/notify`
  rejects when `CRON_SECRET` is unset.
- Email templates: every interpolated value is escaped; subjects cannot carry line breaks.
- Dependencies: `pnpm audit`.

Output: `docs/SECURITY-REVIEW.md` with findings by severity, plus fixes for anything high.

---

#### L7. Migration path to production — **Sonnet 5.5**

Fixes status item 7.

- Add `scripts/migrate-status.sh` that lists files in `supabase/migrations/` and marks which
  are recorded in production (`supabase migration list`, or the Management API).
- Document in `docs/SETUP.md` the one-time step that records the initial migration as
  already applied (`supabase migration repair --status applied 20261107000000`) and the
  normal step for new ones (`supabase db push`), both run by the owner or with the owner's
  approval.
- Bump the CI database job to `postgres:17` to match production (finding D3).

---

#### L8. Seed data, dry-run checklist, docs refresh — **Haiku 5.5**

- `supabase/seed.sql`: one group, 12 people with `@example.com` addresses, 5 couples as
  two-way rules, a few filled questionnaires. No assignments (the app draws).
- `docs/DRY-RUN.md`: a checklist the owner follows on Thursday with a throwaway group:
  sign in on iPhone and Android; add people; add a rule; Match; Send; each tester opens the
  email, taps Continue, sees a name; reopen the same email an hour later; fill the
  questionnaire; Santa gets the update email; reminder; fix a typo'd email and Resend;
  remove one tester; check spam folders; delete the test group afterwards.
- Refresh PLAN.md (progress table, architecture tree, data model to match the real schema),
  README (Node version, email provider), and the stale comment in
  `apps/web/lib/supabase/admin.ts` (finding D6). Add `"engines": { "node": ">=22" }` and pin
  Vercel's Node version to match CI (finding D4).

---

### Track G: gift ideas (Nov 14–20)

Plan phase 2. Depends on H7.

| ID | Task | Model | Notes |
|---|---|---|---|
| G1 | Prompt and output schema: 3 retail + 2 DIY ideas, each with title, one-line reason tied to a specific answer, price estimate inside the group budget, search keywords; never anything from "please no" or allergies; sensible output from partial or empty answers. Plus ~20 fake profiles as an eval set in `packages/core/src/gifts/` | **Opus 5.5** | Output: `docs/GIFT-IDEAS.md` and typed schema. Load the `claude-api` skill before writing any API code |
| G2 | Migration `gift_suggestions` (receiver membership, ideas jsonb, `answers_updated_at` it was built from, model, created_at). RLS: readable only by the receiver's Santa (`is_santa_of`), **not** by the receiver or organizer; written only by the server | **Opus 5.5** | Add privacy checks |
| G3 | Engine in `apps/web/lib/gifts.ts`: Sonnet 5.5 with structured output, validate against the schema and budget, cache per receiver, regenerate when `questionnaire_updated_at` is newer than the cached row. Run it inside `deliverProfileUpdates` so the update email can say "new gift ideas are ready". Cap: one generation per receiver per 30 minutes, and a daily project cap | **Sonnet 5.5** | Never send the Santa's identity to the model |
| G4 | "Gift ideas" panel on the person page replacing the "coming soon" text, with shop search links (Amazon, Etsy, Target) built from keywords and DIY cards (materials, difficulty, time) | **Sonnet 5.5** | Plan steps 2.3, 2.4 |
| G5 | Run the eval set; report budget and "please no" violations; tune the prompt | **Opus 5.5** | Plan step 2.7 |

Plan step 2.5 (Haiku summary of long answers) is unnecessary at family scale; skip until
cost matters.

### Track P: after launch (by exchange day)

| ID | Task | Model |
|---|---|---|
| P1 | **Reveal** button for organizers, enabled only on or after the exchange date, with confirmation; "Who had whom" list on the person page once `revealed_at` is set. Server-only write, audited | **Sonnet 5.5**, Opus review |
| P2 | **Long-lived email links** (findings A2, A3): put a signed, 30-day, per-person token in emails instead of a Supabase one-time token; on Continue the server verifies it, then mints a session with `generateLink` + `verifyOtp`. Needs a threat model first (a forwarded email grants access for 30 days; changing someone's email must revoke their tokens) | **Opus 5.5** designs, **Sonnet 5.5** builds |
| P3 | Announcement email to everyone (organizer's own text, escaped, rate-limited) | **Sonnet 5.5** |
| P4 | Co-organizer: promote/demote a member | **Sonnet 5.5** |
| P5 | Audit log screen for organizers | **Sonnet 5.5** |
| P6 | Anonymous Santa ↔ giftee messages (plan 2.6) | **Opus 5.5** designs the privacy model, **Sonnet 5.5** builds |
| P7 | Shared-email support, if H4 says it is needed and plus-addresses are not enough | **Opus 5.5** |
| P8 | Lint (ESLint + `eslint-config-next`) wired into `turbo lint` and CI | **Haiku 5.5** |
| P9 | Service tests for `group-service.ts` against a real Postgres (reuse `local_auth_stub.sql`; inject the email sender) | **Sonnet 5.5** |

Phases 3–5 in PLAN.md (public hardening, mobile, growth) are unchanged.

---

## 4b. Branches ready for other models

Each branch starts from the launch-hardening code. Open a session on the branch with the
model shown and give it the prompt. No task here needs the top-tier model.

| Branch | Task | Model | Start after |
|---|---|---|---|
| `task/l8-seed-dryrun-docs` | L8 | Haiku 5.5 | Now |
| `task/l7-migration-path` | L7 | Sonnet 5.5 | Now |
| `task/l5-e2e-test` | L5 | Sonnet 5.5 | Now |
| `task/p8-lint` | P8 | Haiku 5.5 | Now |
| `task/l6-security-review` | L6 | Opus 5.5 | Now (review only; small fixes) |
| `task/g1-g2-gift-design` | G1, G2 | Opus 5.5 | After launch |
| `task/g3-g4-gift-engine-ui` | G3, G4 | Sonnet 5.5 | After G1/G2 merge (rebase on `main` first) |
| `task/p1-reveal` | P1 | Sonnet 5.5 | After launch |

Prompt to paste (change the task ID):

> Read `docs/TASKS.md` section 3 (rules) and task **L8** in section 4. Do exactly that task
> on this branch, run the four checks, tick it in section 5, commit, push, and open a pull
> request into `main`. Do not change Vercel or Supabase settings and do not apply migrations.

## 5. Checklist

Owner
- [x] H1 `main` branch, Vercel production branch (still to do by hand: make `main` the default branch in GitHub → Settings)
- [x] H2 Vercel environment variables (`ORGANIZER_EMAILS` still to add, see L3)
- [x] H3 Supabase email rate limit (now 100 per hour)
- [x] H4 shared-email decision: nobody shares an address; 16 people expected
- [ ] H5 dry run
- [ ] H6 launch
- [ ] H7 Anthropic API key

Launch
- [x] L1 forgiving sign-in links (the Supabase template change was dropped: with one group, `/home` already lands on the right page)
- [x] L2 organizer edge cases (code done; migration `20261111000000_launch_hardening.sql` must be applied to production before this code is deployed)
- [x] L3 close the open door (code done; needs the same migration and `ORGANIZER_EMAILS` in Vercel)
- [x] L4 email-change notice
- [ ] L5 end-to-end test
- [ ] L6 security review
- [ ] L7 migration path
- [ ] L8 seed, dry-run checklist, docs

Gift ideas
- [ ] G1 · [ ] G2 · [ ] G3 · [ ] G4 · [ ] G5

After launch
- [ ] P1 · [ ] P2 · [ ] P3 · [ ] P4 · [ ] P5 · [ ] P6 · [ ] P7 · [ ] P8 · [ ] P9

### If time runs short before Friday

Must have: **H1, H2, H3, L1, L2 (items 1–3), H5.**
Strongly recommended: L3, L6.
Can follow the launch: L4, L5, L7, L8.
