# Secret Santa App — Product & Technical Plan

_Last updated: 2026-11-06_

## 1. Goal and constraints

Build a Secret Santa app that handles groups, a fair and secret draw, participant
questionnaires, and gift recommendations. It starts as a web app and later ships to
the Apple App Store and Google Play.

**The first real launch is our family's 2026 exchange.** Christmas is about 7 weeks
away, so the plan works backward from that date:

| Milestone | Target date | Why |
|---|---|---|
| Family MVP live | **Sat Nov 21** | Leaves a week to collect questionnaires before the draw |
| Family draw sent | **Sun Nov 29** | About 4 weeks of shopping time before Dec 25 |
| Gift ideas live | Wed Dec 2 | Arrives while people are shopping |
| Retro and public beta prep | January 2027 | Learn from the family run first |
| App Store / Play Store | Q3 2027 | Ready well ahead of the 2027 season |

Everything on the critical path to Nov 21 is in **Phase 1**. Anything that can wait waits.

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
| SMS | Twilio | Standard; added in Phase 2 because of A2P 10DLC registration lead time |
| Gift ideas | Claude API (Sonnet 5.5) | Turns questionnaire answers into structured retail + DIY suggestions |
| Mobile | Expo + EAS Build | One codebase for iOS and Android, reuses `packages/core` |

### Core data model

- `users` — id, name, email, phone, notification preferences
- `groups` — id, name, organizer_id, budget, exchange_date, status (`draft` → `open` → `drawn` → `complete`)
- `memberships` — group_id, user_id, role (`organizer` / `member`), invite status
- `exclusions` — group_id, giver_id, receiver_id (e.g. spouses, last year's match); can be one-way or both ways
- `assignments` — group_id, giver_id, receiver_id. **RLS: a user can only read the row where they are the giver.** The organizer cannot see matches unless they choose a "reveal" option after the exchange.
- `questionnaire_templates` / `questions` — customizable per group
- `answers` — user_id, group_id, question_id, value
- `gift_suggestions` — receiver_id, type (`retail` / `diy`), title, reason, link, price band, cached output

### Draw algorithm (the most important piece of logic)

1. Build the allowed-pairs graph: everyone can give to everyone except themselves and their exclusions.
2. Find a random **Hamiltonian cycle** (one big loop) where possible, so nobody ends up in a closed pair (A↔B). Fall back to any valid derangement if the rules make a loop impossible.
3. Use randomized backtracking with a cryptographically secure shuffle (`crypto.getRandomValues`). Fine for groups up to a few hundred people.
4. If no valid assignment exists, tell the organizer **which rule is the problem** instead of failing silently.
5. Store results atomically; a re-draw is allowed only before notifications go out, and is logged.

---

## 4. Phase-by-phase plan

### Phase 0 — Foundation (Nov 6–9)

| # | Step | Model | Output |
|---|---|---|---|
| 0.1 | Finalize MVP scope and user stories for the family run | **Opus 5.5** | `docs/user-stories.md` |
| 0.2 | Design the data model, RLS policies, and draw algorithm spec | **Opus 5.5** | `docs/architecture.md`, first migration |
| 0.3 | Scaffold Turborepo, Next.js app, Supabase project, lint/format/test setup, CI on GitHub Actions | **Sonnet 5.5** | Running "hello world" on Vercel |
| 0.4 | Generate seed data (fake family of ~12, couples, kids) and fixtures | **Haiku 5.5** | `supabase/seed.sql` |

### Phase 1 — Family MVP (Nov 10–21) — critical path

| # | Step | Model | Output |
|---|---|---|---|
| 1.1 | Implement the draw algorithm in `packages/core` with property-based tests (random groups, random exclusions, verify every result is valid and that impossible rule sets are explained) | **Opus 5.5** | Fully tested draw module |
| 1.2 | Magic-link sign-in and basic profile (name, email, phone optional) | **Sonnet 5.5** | Auth flow |
| 1.3 | Create group: name, budget, exchange date, invite by email link | **Sonnet 5.5** | Organizer flow |
| 1.4 | Exclusions UI: "these people shouldn't draw each other" (couples one-click) | **Sonnet 5.5** | Rules screen |
| 1.5 | Default questionnaire: likes, dislikes, hobbies, sizes (shirt/pants/shoe), favorite colors, allergies, "please no…", wish-list links | **Haiku 5.5** drafts questions → **Sonnet 5.5** builds the form | Questionnaire page |
| 1.6 | "Run the draw" + "My match" page showing the receiver's profile and answers | **Sonnet 5.5** | Draw and reveal flow |
| 1.7 | Email notifications: invite, reminder to fill questionnaire, "you've been matched" | **Haiku 5.5** writes templates → **Sonnet 5.5** wires up Resend | Email flow |
| 1.8 | Anonymous Santa ↔ giftee messaging ("what size are you, really?") | **Sonnet 5.5** | Simple message thread (stretch goal; can slip to Phase 2) |
| 1.9 | Security and privacy review: RLS, nobody can read others' matches, invite links can't be guessed | **Opus 5.5** | Review notes + fixes |
| 1.10 | End-to-end tests of the whole family flow (Playwright) | **Sonnet 5.5** | Green CI |
| 1.11 | Dry run with 2–3 family members, fix friction | **Sonnet 5.5** for fixes | Go/no-go for Nov 21 |

### Phase 2 — Gift recommendations and SMS (Nov 22 – Dec 5)

| # | Step | Model | Output |
|---|---|---|---|
| 2.1 | Design the recommendation prompt and output schema (retail + DIY, reason tied to answers, price within budget, no items from the "please no" list) | **Opus 5.5** | Prompt spec + eval set of ~20 fake profiles |
| 2.2 | Build the runtime engine: Sonnet 5.5 with structured output, cached per receiver, regenerate on demand | **Sonnet 5.5** (builds it) / **Sonnet 5.5** (runs it) | "Gift ideas" panel on the match page |
| 2.3 | Retail links: start with search links (Amazon, Etsy, Target) built from the suggestion's keywords; add affiliate tags later | **Sonnet 5.5** | Clickable shop links |
| 2.4 | DIY ideas: materials list, difficulty, time needed | **Sonnet 5.5** runtime, prompt by **Opus 5.5** | DIY cards |
| 2.5 | Summarize long questionnaire answers into a one-line "gift profile" | **Haiku 5.5** runtime | Faster, cheaper prompts |
| 2.6 | SMS notifications via Twilio (start 10DLC registration in Phase 0 — it can take weeks) | **Sonnet 5.5** | SMS match alerts |
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
| 4.3 | Push notifications (Expo Notifications) replace most SMS cost | **Sonnet 5.5** | Push match alerts |
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
| Not ready for the family deadline | Phase 1 is deliberately small; messaging (1.8) and gift ideas (Phase 2) are allowed to slip without blocking the draw |
| The organizer accidentally sees matches | Enforced in the database (RLS), not just hidden in the UI; reviewed in 1.9 |
| Exclusions make the draw impossible | The algorithm names the conflicting rule and suggests a fix |
| Emails land in spam | Verified sending domain (SPF/DKIM/DMARC) in Phase 0 |
| SMS registration delays | Start Twilio 10DLC paperwork immediately; email is the Phase 1 fallback |
| AI suggests something off-budget or on the "no" list | Structured output + validation + eval set (2.1, 2.7) |
| AI cost at scale | Cache suggestions, use Haiku for summaries, per-user regenerate limits |

## 6. Definition of done for the family run

- [ ] Every family member can sign in from a phone browser without help
- [ ] Organizer can add couples as exclusions in under a minute
- [ ] Draw produces a valid loop and nobody can see anyone else's match
- [ ] Everyone gets their match by email on Nov 29
- [ ] Each person sees their giftee's questionnaire and at least 5 gift ideas (retail + DIY) by Dec 2
