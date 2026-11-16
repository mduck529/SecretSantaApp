# Security and privacy review (task L6)

_Reviewed 2026-11-15 at commit `1427dc1` (L1–L4 included). Scope: the diff since `baf367f`,
plus every place the app touches matches, sign-in, or email. Plan step 1.8._

## Summary

| Severity | Count | Fixed in this pull request |
|---|---|---|
| High | 1 | No: it's a Supabase setting, so the owner has to change it (task **H8**) |
| Medium | 3 | **Fixed** afterwards in `task/l6-medium-fixes` (M-1 to M-3; see each finding) |
| Low | 6 | No |

The privacy model holds where it matters most. Row Level Security is on for all 8 tables, and
the live database's grants match the migrations. No organizer screen, server action result or
audit entry contains a pairing. The weak spots are around the edges: Supabase still accepts
public sign-ups, `safeNext` lets through one open-redirect pattern, and the follow-up emails sent
after someone is added or removed post-Send can show who that person's Santa is.

**Before launch (H6):** turn off public sign-up in Supabase (H8). It takes one click, and the app
doesn't depend on it.

### How this was checked

- Read every `createAdminClient()` call site (`lib/group-service.ts`, `lib/links.ts`,
  `app/login/actions.ts`, `app/new/actions.ts`), every server action, both migrations and
  `rls_test.sql`.
- **Live Supabase (read-only):** the auth settings through the Management API, plus table,
  column and function privileges for `anon` and `authenticated` through a read-only SQL query.
  Nothing was changed.
- **Live Vercel (read-only):** the production branch, deployment protection and environment
  variable names.
- Built the app with placeholder `NEXT_PUBLIC_SUPABASE_*` values and searched the browser
  bundles for them. **The anon key and project URL are not shipped to the browser.**
- `pnpm audit`: no known vulnerabilities.
- The four checks in TASKS.md section 3 pass.

Several findings below need the Supabase **anon key**. It isn't in the browser bundle today, so
an outsider or family member can't easily get it. But Supabase treats that key as public: any
future client-side Supabase code (for example realtime messaging in P6) would ship it. So this
review rates those findings as if the key were public, and notes "needs the anon key" where it
applies.

---

## High

### H-1. Public sign-up is still on in Supabase

**Where:** the Supabase project's auth settings. Live values: `disable_signup = false`,
`mailer_autoconfirm = false`, custom SMTP = the family Gmail.

L3 stopped the app's own forms from creating accounts. Supabase's own sign-up endpoint
(`/auth/v1/signup`, `/auth/v1/otp` with `create_user`) is still open, though. Anyone with the
anon key can:

1. **Email any address from the family Gmail.** Supabase sends a "confirm your account" or
   sign-in email through Gmail for every new address, limited only by the project-wide 100 per
   hour. This is finding C1, the thing L3 was meant to close: Gmail may suspend the account,
   which would also break everyone's sign-in.
2. **Likely take over a family member's account before they first sign in.** The attacker signs
   up with the family member's address and a password of their choosing. The account stays
   unconfirmed. When the real person later taps the link in their match email, the account is
   confirmed, and the attacker's password probably still works on it. The attacker can then sign
   in with that password and read the person's match and answers. (Not tested against the live
   project. Turning sign-up off removes the risk either way.)

**Fix (owner, Supabase dashboard):** Authentication → Sign In / Providers → turn off **Allow new
users to sign up**. No code change is needed:

- `signInLink` and `sendLoginLink` create accounts with the service-role admin API, which still
  works with sign-up off.
- `sendLoginLink` already passes `shouldCreateUser: false`.

Added to TASKS.md as **H8**.

---

## Medium

### M-1. Open redirect in `safeNext` (sign-in links)

**Where:** `apps/web/lib/auth.ts:48`, used by `/auth/confirm` (page and action) and `/login`.

`safeNext` rejects `//evil.com` but accepts `/\evil.com` and `/<tab>/evil.com`. Browsers treat
the backslash as `/` and drop the tab, so the redirect lands on `https://evil.com/`. Checked with
the WHATWG URL parser.

Two ways to trigger it:

- `GET /auth/confirm?email=<victim>&next=/%5Cevil.com`: if the victim is signed in, the page
  redirects at once, with no tap.
- The same link without `email`: any signed-in person who taps Continue is sent on.

That makes a convincing phishing link on the family app's own domain.

**Fix (small):** also reject a backslash or control character anywhere in the path, for example:

```ts
typeof next === "string" && /^\/(?![\/\\])/.test(next) && !/[\\\u0000-\u001f\u007f]/.test(next)
```

Add unit tests for `/\evil.com`, `/\t/evil.com` and `/%5Cevil.com`. The last one is safe: it
stays on our own site.

**Status: fixed** (`task/l6-medium-fixes`). `safeNext` (`apps/web/lib/auth.ts`) now:

- requires one leading `/` not followed by `/` or `\`;
- refuses any backslash, any whitespace (tab, newline, space, no-break space, line separators),
  control characters (C0, DEL, C1) and invisible characters (zero-width, bidi, BOM) anywhere;
- then checks with the WHATWG URL parser that the path stays on our origin and doesn't resolve
  to a `//` path (so `/.//evil.com` is refused too);
- refuses anything over 2,048 characters or that isn't a string.

Unit tests in `apps/web/test/units.test.ts` cover every bypass above plus variants (`/\/`,
`\\`, `/\n/`, `/\r\n/`, leading tab or space, `//\t`, NUL, vertical tab, form feed, DEL,
U+0085, U+00A0, U+2028, U+200B, U+FEFF, a backslash deeper in the path, `/.//`, `/..//`,
`http:/`, `javascript:`). Same-site paths with query, hash and percent-encoding (including
`/%5Cevil.com`) still pass, and a guard test checks that the bypass strings really do leave the
site in the URL parser, so the tests keep proving something.

### M-2. Any member can see whose match changed after an add or remove (needs the anon key)

**Where:** `memberships` grants `select` on every column to `authenticated` (initial schema), and
`emailMatches` writes `match_email_sent_at` (`lib/group-service.ts:515`).

After Send, adding or removing someone updates `match_email_sent_at` only for the giver(s) whose
match changed. Every group member can read that column through the Supabase REST API with their
own session. Comparing timestamps shows:

- **Add:** the one existing person emailed at that moment is the newcomer's Santa (a current
  pairing).
- **Remove:** the person emailed is the one who was buying for the removed person.

The organizer's screen doesn't show this column, so this needs a direct API query.

**Fix (new migration):** narrow the `memberships` select grant to the columns the app reads with
the user's session:

```sql
revoke select on public.memberships from authenticated;
grant select (id, group_id, display_name, email, user_id, role,
              questionnaire_complete, match_email_status, created_at)
  on public.memberships to authenticated;
```

Add a check to `rls_test.sql` that a member can't select `match_email_sent_at`. The server
(service role) still reads it for the "your match has changed" wording.

**Status: fixed** (`task/l6-medium-fixes`) in the new migration
`supabase/migrations/20261116000000_memberships_column_grants.sql` (**the owner must apply it**).
It revokes table-wide `select` on `memberships` from `authenticated` and grants only `id,
group_id, display_name, email, user_id, role, questionnaire_complete, match_email_status,
created_at`: every column the app reads, filters or sorts by with a user's session
(`requireMember`, the person page, the organizer page, and the `contacts_select` policy).
`match_email_sent_at`, `questionnaire_updated_at`, `last_reminded_at` and the new
`match_email_retry` (see M-3) are server-only. `anon` keeps no access. `rls_test.sql` now checks
that members and the organizer can't select, filter or sort on the hidden columns (or use
`select *` or `to_jsonb(row)`), that every column the app reads still works, and that
`authenticated` holds exactly the listed column grants.

`match_email_status` stays readable (the organizer's badges need it), so M-3 also stops
follow-up emails from changing it.

### M-3. A failed follow-up email names the person whose match changed

**Where:** `addMember` and `removeMember` → `emailMatches` (`lib/group-service.ts:243`, `:332`,
`:526-530`), the "Email failed" badge on the admin page, and `send.ts:43`.

If the follow-up email fails after an add or remove, three things reveal who got it:

- the result message ("Couldn't email Bob; check their address and press Resend"),
- the dashboard badge ("Email failed" on Bob),
- the Vercel log line (`Email to bob@… failed`).

Together they tell the organizer that Bob is the newcomer's Santa, or was the removed person's
Santa.

This only happens when an email fails, but a wrong address or Gmail outage is exactly when an
organizer is looking.

**Fix (design choice):** for follow-up emails after an add or remove, don't attribute the failure
to a person. Say "One email didn't go through. We'll try again automatically." Record the
failure in a server-only place, such as a column the organizer can't select (see M-2) or a
server-only table, and retry it from the daily cron. Drop the address from the log line.

**Status: fixed** (`task/l6-medium-fixes`). In `lib/group-service.ts`, `emailMatches` takes
`blindIds`: the people whose match changed because someone else was added or removed. For them:

- **Result message:** counts only. Remove: "Removed Bob. One person got a new match. One email
  didn't go through, so we'll try again automatically." Add: "Added Dave and sent them their
  match. One other person's match changed. That email didn't go through, so we'll try again
  automatically." The newcomer is still named if *their own* email fails (the organizer just
  typed that address, and it says nothing about who has whom).
- **Badge:** `match_email_status` is never changed for a blind person, on failure *or* success
  (a badge flipping from "Email failed" to "Email sent" right after an add would also point at
  the Santa). Only server-only columns change: `match_email_sent_at`, and the new
  `match_email_retry` flag on failure.
- **Retry:** the daily cron (`/api/cron/notify`) calls `retryChangedMatchEmails`, which resends
  "your match has changed" to everyone flagged in a group that is still `sent`, match-blind
  again, and audits counts only. An organizer's Resend or a full Send also clears the flag.
- **Log line:** `send.ts` now logs "An email failed to send (code EENVELOPE, SMTP 550, during
  RCPT TO)": error codes only, no address and no raw error (Nodemailer's message, `response`
  and `rejected` fields quote the recipient). A sign-in link that can't be made now counts as
  one failed email rather than failing the whole batch, and is logged as a count.

Tests: `apps/web/test/match-blind.test.ts` runs the real `addMember`, `removeMember`,
`resendMatch` and the retry against an in-memory Supabase stand-in and a fake SMTP server that
rejects addresses the way Gmail does. It checks that the result message, audit entries and every
log line never name the Santa, that no blind person's status changes, that the retry flag is set
and cleared, and that the retry stops after a re-match. Pure helpers are covered in
`units.test.ts`.

Known limit: if a blind person's address is wrong, the retry keeps failing quietly once a day.
Their first match email would normally have failed visibly already, and fixing the address and
pressing Resend sends their current match and clears the flag.

---

## Low

### L-1. The "N people got a new match" count can hint at who sat between a couple

`removeMember` reports "One person" or "2 people". Two people change only when the removed
person's Santa isn't allowed to draw the removed person's giftee. With couples as two-way rules,
that means the removed person sat between a couple, and the organizer can see the rules.

**Fix:** drop the count: "Removed {name}. Anyone whose match changed has been emailed."

**Minimum group size for repairs: not needed.** In a single loop of 3, every participant can
work out the whole loop from their own match. In a loop of 4, one more fact is enough. That is
true of the draw itself, whether or not anyone is added or removed, and a repair-only minimum
wouldn't change it. Once L-1 is fixed, the organizer's screen adds nothing beyond what any
participant can already infer. The family group (16 people) is far from this. If public groups
come later, consider a note when matching fewer than 5 people.

### L-2. The sign-in form can be used to pester family members and use up the email limit

Anyone who knows an organizer or roster address can submit `/login` over and over. Each email
kills the previous sign-in link (finding A2) and uses up the project-wide 100-per-hour email
limit. Supabase limits each address to one email per 60 seconds, which is still 60 an hour per
address. Response time also shows whether an address is on a roster: a stranger's address
returns at once, a roster address waits for Supabase.

**Fix:** a small per-address and per-IP throttle in `sendLoginLink`, and do the send in
`after()` so every request returns equally fast.

### L-3. No security headers

`next.config.ts` sets no headers:

- **No framing protection:** organizer buttons could be clickjacked. The confirm dialogs on
  Re-match, Send and Remove make that harder.
- **No explicit Referrer-Policy** on `/auth/confirm`. The browser default
  (`strict-origin-when-cross-origin`) already keeps the token out of third-party requests, and
  that page makes none (no external fonts, scripts or images).

**Fix:** in `next.config.ts` `headers()`, send `X-Frame-Options: DENY`,
`Referrer-Policy: same-origin` and `X-Content-Type-Options: nosniff` on all routes.

### L-4. The production redirect allow-list includes `http://localhost:3000/**`

The live `uri_allow_list` has the localhost entry. Our sign-in templates use `{{ .SiteURL }}`, so
they aren't affected. The default password-recovery and email-change templates still use
`{{ .ConfirmationURL }}`, though, which follows `redirect_to`.

**Fix (owner):** remove the localhost entry in production. Local development uses the local
Supabase project.

### L-5. Answers written straight to the database aren't checked (needs the anon key)

The app cleans answers with `cleanAnswers`, but the table only checks that `answers` is a JSON
object. A member writing straight to the API could store a huge blob, or a non-text value that
crashes their Santa's page when it renders. Wish-list links are already limited to `http(s)`, so
this can't run script.

**Fix:** a database check (every value is text, total size limited), or validate when reading.

### L-6. Email addresses in the server log

`send.ts:43` logged the recipient of every failed email. That is part of M-3 and is now fixed
(codes only). Separately, the
email-change notice and the logs are the only places a person's old and new addresses sit side
by side. Fine for a family, but worth trimming before any public use.

---

## Checked and fine

**Service-role code (`createAdminClient`)**

- Every organizer function returns a fixed message or a count.
- Audit details are counts and flags only: `round`, `participants`, `sent`, `failed`,
  `count`, `ok`, `email_changed`.
- Errors with a database `code` are logged, not returned. Plain errors that reach the organizer
  carry only validation text or draw-problem kinds.
- `explainProblem` talks about rules, not matches.
- Timing doesn't depend on who has whom.

**Row Level Security (live database)**

- RLS is on for all 8 tables, and the 11 policies match the migrations.
- `profile_notifications` has no grants for `anon` or `authenticated`.
- `groups` lets members update only `name`, the two budget columns and `exchange_date`, so
  status, draw and reveal fields stay server-only.
- `questionnaire_answers` lets people insert their own row and update `answers` and
  `is_complete`. (`updated_at` is insertable, but a trigger overwrites it.)
- The helper functions only answer questions about the caller.
- `create_group_as`, `save_assignments` and `reset_unsent_match` can be called only by the
  service role.

**Sign-in**

- The L1 shortcut needs the signed-in address to equal the link's address, so it can't switch
  accounts. A working token still signs in as the link's owner, as intended.
- `/api/cron/notify` returns 401 when `CRON_SECRET` is unset.
- Tokens are used only after the Continue tap, so link scanners can't burn them.

**Email**

- Every interpolated value in the HTML is escaped: headings, paragraphs, button labels,
  preheaders, URLs.
- Display names are whitespace-collapsed, and Nodemailer folds any line breaks in subjects, so
  subjects can't carry extra headers.
- The email-change notice has no sign-in link and masks the new address.

**Dependencies:** `pnpm audit` reports no known vulnerabilities.

**Vercel**

- The production branch is `main`.
- Preview deployments need a Vercel login (Standard Protection).
- `SMTP_PASS` is production-only, so previews can't send email.

## Notes for later tasks

- **New tables and functions (G2 and later):** Supabase's default privileges grant `anon` and
  `authenticated` access to new objects in `public`. Every new migration must revoke and grant
  explicitly, as the existing ones do, and add a "cannot read" check to `rls_test.sql`.
- **Migration history (L7):** production's `supabase_migrations.schema_migrations` records only
  `20261115194050`, which isn't a file in this repo. Neither `20261107000000` nor
  `20261111000000` is recorded, although both schemas are live. Reconcile this before using
  `supabase db push`.
- **Small groups:** see L-1.
