# Secret Santa App — Product & Technical Plan

_Last updated: 2026-11-06_

## 1. Goal and constraints

Build a Secret Santa app that handles groups, a fair and secret draw, participant
questionnaires, and gift recommendations. It starts as a web app and later ships to
the Apple App Store and Google Play.

**The first real launch is our family's 2026 exchange, going out next week.**

The draw does **not** wait for questionnaires. The organizer adds the family, the draw
runs, and everyone learns their match right away. People then fill out their
questionnaire whenever they like, and **each time someone updates their answers, their
Secret Santa is notified** and sees the latest profile (and, from Phase 2, refreshed
gift ideas).

**Notifications are email only** (no SMS). Push notifications come with the mobile apps.

**The organizer is also a participant.** They get a match like everyone else, so the app
must hide every match (including who is buying for them) from the organizer. They still
get admin controls, but none of those controls ever shows or returns match data.

| Milestone | Target date | What happens |
|---|---|---|
| Foundation + draw logic | Sat–Sun Nov 7–8 | Project setup, database, tested draw algorithm |
| Build | Mon–Wed Nov 9–11 | Sign-in, group, exclusions, draw, match page, questionnaire, emails |
| Dry run + security review | Thu Nov 12 | 2–3 family members test it; fix issues |
| **Family launch + draw** | **Fri Nov 13** | Draw runs; everyone gets their match by email |
| Questionnaires fill in | Nov 13 onward | Santas get "your giftee updated their profile" emails |
| Gift ideas live | Fri Nov 20 | Recommendations appear on each match page and refresh as answers change |
| Retro and public beta prep | January 2027 | Learn from the family run first |
| App Store / Play Store | Q3 2027 | Ready well ahead of the 2027 season |

Everything needed for Nov 13 is in **Phases 0–1**. Anything that can wait waits.

### Organizer admin controls (without seeing matches)

| Control | What the organizer sees | What stays hidden |
|---|---|---|
| Manage family list (add, remove, fix names/emails) | Names and emails | — |
| Manage exclusions (couples, etc.) | The rules they set | — |
| Run the draw | "Draw complete: 12 matches sent" | Every pairing |
| Re-draw (with confirmation, emails everyone a new match) | Confirmation and send status | New pairings |
| Resend someone's match email (e.g. after fixing a typo) | "Sent to Aunt Sue" | Who Aunt Sue has |
| Remove someone after the draw (drop-out) | "Fixed: 1 person got a new match" | Who was affected. The app repairs the loop by giving the dropout's Santa the dropout's giftee, so only one person's match changes |
| Status dashboard | Per person: email delivered, signed in, questionnaire done yes/no | Questionnaire answers (only each person's Santa sees those) |
| Send reminders | Pick who to nudge, or "everyone not done" | — |
| Group settings | Budget, exchange date, group name | — |
| Announcement email to everyone | Their own message | — |
| Reveal after the exchange (optional) | Full list of who had whom, shown to everyone at once | Nothing; off until the organizer turns it on after the exchange date |
| Add a co-organizer | Same controls as above | Same as above |

How this is enforced:
- Admin actions run as server functions that are written to **never read or return
  `assignments` rows**. Row Level Security also blocks the organizer from reading any
  assignment except their own.
- Admin screens show no counts or timings that could hint at a pairing (e.g. no
  "Santa of X opened their email").
- Every admin action is written to an `audit_log`, so changes after the draw are traceable.

## 2. How "model attached" works in this plan

Every step names the Claude model that should do the work, so we spend the strongest
(most expensive) model where mistakes are costly and the faster ones on routine work.

| Model | Model ID | Use it for |
|---|---|---|
| **Opus 5.5** | `claude-opus-5-5` | Architecture, security, the draw algorithm, data model, code review, anything where a subtle bug ruins the exchange |
| **Sonnet 5.5** | `claude-sonnet-5-5` | Day-to-day feature work: screens, API routes, integrations, tests. Also the **runtime** model for gift recommendations |
| **Haiku 5.5** | `claude-haiku-5-5` | Boilerplate, copy, email templates, seed data, fixtures, and cheap high-volume runtime jobs (tagging, summarizing answers) |

Rule of thumb: **Opus designs and reviews, Sonnet builds, Haiku fills in.** Every phase
ends with an Opus review step before anything reaches the family.

## 3. Recommended architecture

Chosen so the web app and the future mobile apps share as much code as possible.

```
secretsantaapp/                 (Turborepo monorepo, TypeScript everywhere)
├─ apps/
│  ├─ web/        Next.js (App Router) — Phase 1
│  └─ mobile/     Expo (React Native) — Phase 4
├─ packages/
│  ├─ core/       Draw algorithm, validation, domain types (pure TS, fully tested)
│  ├─ db/         Schema, migrations, generated types
│  ├─ api-client/ Typed client used by web and mobile
│  └─ ui/         Shared design tokens (later: shared components)
└─ supabase/      Migrations, row-level-security policies, edge functions
```

| Concern | Choice | Reason |
|---|---|---|
| Backend / DB / Auth | **Supabase** (Postgres + Auth + Row Level Security) | Magic-link login fits families; RLS keeps draw results private at the database level; works with web and Expo |
| Web hosting | Vercel | Zero-config Next.js |
| Email | Resend (+ React Email templates) | Simple API, good deliverability |
| Gift ideas | Claude API (Sonnet 5.5) | Turns questionnaire answers into structured retail + DIY suggestions |
| Mobile | Expo + EAS Build | One codebase for iOS and Android, reuses `packages/core` |

### Core data model

- `users` — id, name, email, phone, notification preferences
- `groups` — id, name, budget, exchange_date, status (`draft` → `open` → `drawn` → `complete`)
- `memberships` — group_id, name, email, user_id (nullable until they sign in), role (`organizer` / `co_organizer` / `member`), email_status, questionnaire_complete. The organizer enters the roster directly, so the draw can run before anyone has an account; the match email's link signs them in.
- `exclusions` — group_id, giver_id, receiver_id (e.g. spouses, last year's match); can be one-way or both ways
- `assignments` — group_id, giver_id, receiver_id. **RLS: a user can only read the row where they are the giver.** The organizer is a participant and cannot see other matches either; everyone sees all matches only if the organizer turns on "reveal" after the exchange date.
- `audit_log` — group_id, actor_id, action, created_at (admin actions; never stores pairings)
- `questionnaire_templates` / `questions` — customizable per group
- `answers` — membership_id, question_id, value, updated_at
- `profile_updates` — membership_id, changed_at, notified_at. Drives the "your giftee updated their profile" email to their Santa (batched so several quick edits send one email, not ten)
- `gift_suggestions` — receiver_id, type (`retail` / `diy`), title, reason, link, price band, generated_from_answers_at (so ideas regenerate when answers change)

### Draw algorithm (the most important piece of logic)

1. Build the allowed-pairs graph: everyone can give to everyone except themselves and their exclusions.
2. Find a random **Hamiltonian cycle** (one big loop) where possible, so nobody ends up in a closed pair (A↔B). Fall back to any valid derangement if the rules make a loop impossible.
3. Use randomized backtracking with a cryptographically secure shuffle (`crypto.getRandomValues`). Fine for groups up to a few hundred people.
4. If no valid assignment exists, tell the organizer **which rule is the problem** instead of failing silently.
5. Store results atomically; a re-draw is allowed only before notifications go out, and is logged.

---

## 4. Phase-by-phase plan

### Phase 0 — Foundation (Sat–Sun Nov 7–8)

| # | Step | Model | Output |
|---|---|---|---|
| 0.1 | Lock the one-week MVP scope and user stories (draw first, questionnaire after) | **Opus 5.5** | `docs/user-stories.md` |
| 0.2 | Design the data model, RLS policies, and draw algorithm spec | **Opus 5.5** | `docs/architecture.md`, first migration |
| 0.3 | Scaffold Turborepo, Next.js app, Supabase project, lint/format/test setup, CI on GitHub Actions; set up the email sending domain (SPF/DKIM) | **Sonnet 5.5** | Running "hello world" on Vercel |
| 0.4 | Implement the draw algorithm in `packages/core` with property-based tests (random groups, random exclusions, verify every result is valid and that impossible rule sets are explained) | **Opus 5.5** | Fully tested draw module |
| 0.5 | Generate seed data (fake family of ~12, couples, kids) and fixtures | **Haiku 5.5** | `supabase/seed.sql` |

### Phase 1 — Family MVP (Mon Nov 9 – Fri Nov 13) — critical path

| # | Step | Model | Output | Day |
|---|---|---|---|---|
| 1.1 | Magic-link sign-in; the link in each email signs that person straight in | **Sonnet 5.5** | Auth flow | Mon |
| 1.2 | Create group: name, budget, exchange date, and enter the family roster (name + email) directly — no waiting for invites to be accepted | **Sonnet 5.5** | Organizer flow | Mon |
| 1.3 | Exclusions UI: "these people shouldn't draw each other" (couples one-click) | **Sonnet 5.5** | Rules screen | Tue |
| 1.4 | "Run the draw" (organizer) + "My match" page showing the giftee's profile, or "they haven't filled this out yet". The organizer's own match page works exactly like everyone else's | **Sonnet 5.5** | Draw and reveal flow | Tue |
| 1.4b | **Organizer admin panel:** status dashboard, resend match email, fix email, reminders, re-draw, remove a dropout with loop repair, settings (see "Organizer admin controls" above) | **Opus 5.5** designs the match-blind server functions and loop repair → **Sonnet 5.5** builds the screens | Admin panel | Tue–Wed |
| 1.5 | Default questionnaire: likes, dislikes, hobbies, sizes (shirt/pants/shoe), favorite colors, allergies, "please no…", wish-list links. Can be saved partially and edited anytime | **Haiku 5.5** drafts questions → **Sonnet 5.5** builds the form | Questionnaire page | Wed |
| 1.6 | **Profile-update notifications:** when someone saves answers, their Santa gets "Your giftee updated their profile" with a link. Batched (e.g. sent 30 min after the last edit) so a burst of edits sends one email | **Opus 5.5** designs the trigger/batching → **Sonnet 5.5** builds it | Live-updating match | Wed |
| 1.7 | Email templates: "You've been matched — and please fill out your own questionnaire", "Your giftee updated their profile", gentle reminder for anyone who hasn't filled theirs out | **Haiku 5.5** writes copy → **Sonnet 5.5** wires up Resend | Email flow | Wed |
| 1.8 | Security and privacy review: RLS, nobody (organizer included) can read others' matches, no admin endpoint or screen leaks pairings, links can't be guessed, update emails never reveal who the Santa is | **Opus 5.5** | Review notes + fixes | Thu |
| 1.9 | End-to-end test of the whole flow (Playwright): roster → draw → match email → questionnaire edit → Santa notified, plus admin actions (resend, dropout repair) while confirming the organizer never receives pairing data | **Sonnet 5.5** | Green CI | Thu |
| 1.10 | Dry run with 2–3 family members on their phones, fix friction | **Sonnet 5.5** for fixes | Go/no-go | Thu |
| 1.11 | **Launch: run the real draw, match emails go out** | Organizer (you) | Family is live | **Fri** |

Deferred out of the launch week: anonymous Santa ↔ giftee messaging (moves to Phase 2).

### Phase 2 — Gift recommendations and messaging (Nov 14 – Nov 25)

| # | Step | Model | Output |
|---|---|---|---|
| 2.1 | Design the recommendation prompt and output schema (retail + DIY, reason tied to answers, price within budget, no items from the "please no" list, works with partial answers) | **Opus 5.5** | Prompt spec + eval set of ~20 fake profiles |
| 2.2 | Build the runtime engine: Sonnet 5.5 with structured output, cached per receiver, **automatically regenerated when the giftee updates their answers** (folded into the same update email: "new gift ideas are ready") | **Sonnet 5.5** (builds it) / **Sonnet 5.5** (runs it) | "Gift ideas" panel on the match page, live Fri Nov 20 |
| 2.3 | Retail links: start with search links (Amazon, Etsy, Target) built from the suggestion's keywords; add affiliate tags later | **Sonnet 5.5** | Clickable shop links |
| 2.4 | DIY ideas: materials list, difficulty, time needed | **Sonnet 5.5** runtime, prompt by **Opus 5.5** | DIY cards |
| 2.5 | Summarize long questionnaire answers into a one-line "gift profile" | **Haiku 5.5** runtime | Faster, cheaper prompts |
| 2.6 | Anonymous Santa ↔ giftee messaging ("what size are you, really?") | **Sonnet 5.5** | Simple message thread |
| 2.7 | Evaluate suggestion quality against the eval set; check budget and "no" rules are respected | **Opus 5.5** | Quality report |

### Phase 3 — Hardening for the public (Jan – Mar 2027)

| # | Step | Model | Output |
|---|---|---|---|
| 3.1 | Family retro: what confused people, what they loved | **Opus 5.5** analyzes notes | Prioritized backlog |
| 3.2 | Custom questionnaires per group (organizer adds/removes questions) | **Sonnet 5.5** | Template editor |
| 3.3 | Multi-year history: "don't match the same pair as last year" automatically | **Opus 5.5** (rule design) → **Sonnet 5.5** | History-aware draw |
| 3.4 | Wish lists, gift "purchased" status, shipping address sharing (opt-in) | **Sonnet 5.5** | Wish list feature |
| 3.5 | Privacy policy, terms, account deletion, data export | **Opus 5.5** drafts → human/legal review | Legal pages (required by app stores) |
| 3.6 | Monitoring, error tracking (Sentry), rate limiting, cost caps on AI calls | **Sonnet 5.5** | Production readiness |
| 3.7 | Full security review before opening sign-ups | **Opus 5.5** | Sign-off |

### Phase 4 — Mobile apps (Apr – Aug 2027)

| # | Step | Model | Output |
|---|---|---|---|
| 4.1 | Mobile architecture: Expo app reusing `core`, `api-client`, and tokens; push notifications plan | **Opus 5.5** | Mobile spec |
| 4.2 | Build Expo screens mirroring the web flows | **Sonnet 5.5** | iOS + Android builds |
| 4.3 | Push notifications (Expo Notifications) alongside email | **Sonnet 5.5** | Push match alerts |
| 4.4 | Store listing copy, screenshots plan, review-guideline checklist (Sign in with Apple is required if offering other social logins) | **Haiku 5.5** copy, **Opus 5.5** compliance check | Store submissions |
| 4.5 | TestFlight / Play internal testing with the family | **Sonnet 5.5** for fixes | Public release |

### Phase 5 — Growth (Fall 2027+)

| # | Step | Model |
|---|---|---|
| 5.1 | Monetization options: free core, premium for large groups / office parties, affiliate revenue on retail links | **Opus 5.5** |
| 5.2 | Office/team mode (Slack invites, budgets, remote shipping) | **Sonnet 5.5** |
| 5.3 | Other occasions: White Elephant, birthdays, teacher gifts | **Sonnet 5.5** |
| 5.4 | Localization | **Haiku 5.5** |

---

## 5. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| One-week deadline is tight | Launch scope is only: roster, exclusions, draw, match page, questionnaire, emails. Messaging and gift ideas ship after launch without blocking anything |
| Santas buy before the questionnaire is filled in | Match email asks everyone to fill out their own profile; reminders go to anyone still blank after 2–3 days; the match page says clearly when a profile is empty |
| Too many update emails | Edits are batched into one email per burst; a daily cap per Santa |
| Organizer typo in an email address after the draw | Organizer can fix an email and resend that person's match without re-drawing |
| The organizer (a participant) sees matches | Enforced in the database (RLS), not just hidden in the UI; admin functions never read pairings; reviewed in 1.8 and tested in 1.9 |
| Someone drops out after the draw | Loop repair changes only one person's match and emails just them |
| Exclusions make the draw impossible | The algorithm names the conflicting rule and suggests a fix |
| Emails land in spam | Verified sending domain (SPF/DKIM/DMARC) in Phase 0 |
| AI suggests something off-budget or on the "no" list | Structured output + validation + eval set (2.1, 2.7) |
| AI cost at scale | Cache suggestions, use Haiku for summaries, per-user regenerate limits |

## 6. Definition of done for the family run

- [ ] Every family member can sign in from a phone browser without help
- [ ] Organizer can add couples as exclusions in under a minute
- [ ] Organizer can resend emails, nudge people, and handle a dropout without ever seeing who has whom
- [ ] Draw produces a valid loop and nobody can see anyone else's match
- [ ] Everyone gets their match by email on launch day (Fri Nov 13), before any questionnaire is filled out
- [ ] When someone fills out or edits their questionnaire, their Santa is notified and sees the new answers
- [ ] Each person sees at least 5 gift ideas (retail + DIY) for their giftee by Fri Nov 20, refreshed as answers change
