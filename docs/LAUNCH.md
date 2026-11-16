# Launch guide

_Written 2026-11-15, updated 2026-11-16, for the owner. Gift ideas are due **Fri Nov 20**._

This is the order to do things in, with a checkbox for each. Nothing here needs code.
You work in three places: the **app** (https://secretsantaapp-web.vercel.app), **Vercel**
(hosting settings) and **Supabase** (database and sign-in). Never paste a key or password
into chat; enter it in the dashboard yourself.

## 1. What "launch" means, and what must be true first

**Launch** (task H6) is when you, the organizer, do these things in the real app:

1. Create the real family group.
2. Add all 16 people with their correct email addresses.
3. Add "can't draw" rules (couples and so on).
4. Press **Match everyone**. You will see a count, never who got whom.
5. Press **Send to everyone**. Each person gets an email telling them who they are
   buying for, and a link to fill out their own questionnaire.

Pressing Send is the point of no return: 16 real people get email. So we check first.

Right now nothing has been launched. The production database has no groups and no members.

### Must be true before you press Send

- [x] **The questionnaire bug is fixed and live.** Saving the questionnaire used to fail for every
      member. The fix (PR #11, plus the end-to-end test in #5) is merged and deployed. The dry run
      (section 3) is where you see it work with your own eyes.
- [ ] **The settings in section 2 are done.**
- [ ] **The dry run passed** (section 3).

There is no remaining code blocker. Everything else that was recommended is also in:

- **Security fixes M-1 to M-3** (phishing-redirect fix and two small privacy leaks after an add or
  remove) are merged, and their database change is applied to production.
- **Reveal** (for exchange day) is merged, and its database change is applied.
- **Gift ideas** code is merged, and its database changes are applied. It does nothing until you add
  the Anthropic key (section 2).

## 2. The remaining settings

Do these before the dry run.

- [ ] **Vercel Node version.** Vercel → project `secretsantaapp-web` → **Settings → General →
      Node.js Version** → choose **22.x** → Save. (It is on 26.x today; the code and tests expect 22.)
      Then **Deployments → ⋯ on the latest → Redeploy** so it takes effect.
- [ ] **Your own address is in `ORGANIZER_EMAILS`.** Vercel → **Settings → Environment Variables**.
      The variable exists, but its value is hidden, so open it and check it contains the exact
      address you will sign in with (lowercase; commas between several). Only people on this list
      can start a group. If you change it, redeploy.
- [ ] **Anthropic API key (H7), due now.** Not needed for launch itself, only for gift ideas (due Nov 20). Create a key in your Anthropic account, then add it in Vercel as
      `ANTHROPIC_API_KEY` for Production (mark it Sensitive). Redeploy. Ideally set a monthly
      spend limit on the key. Adding it earlier than needed is harmless.
- [ ] **Confirm Supabase is locked down** (already done today; just look): **Authentication → Sign In /
      Providers** → "Allow new users to sign up" is **off**; **URL Configuration** → Redirect URLs lists
      only the production address.

## 3. The dry run (task H5)

Purpose: see every screen and email the family will see, using a throwaway group and a few
real people. Follow the checklist in [`DRY-RUN.md`](DRY-RUN.md); this is the short version.

**Rules for the dry run**

- Use **only testers who agreed**, with their own real addresses, on their real phones.
  Two or three is enough: ideally one iPhone, one Android.
- Everyone else in the group should be made-up names on addresses you control, such as
  `you+test1@gmail.com`. **Never put a family member in the test group.**
- Name the group `DRY RUN - delete me`.

**The path through it**

- [ ] Sign in on a phone: open the app, ask for a sign-in link, open the email, tap **Continue**.
- [ ] Create the test group, add 4 to 5 people and one "can't draw" rule.
- [ ] **Match everyone** (you should see a count only), then **Send to everyone**.
- [ ] Each tester opens their email, taps **Continue**, and sees one name: their giftee.
- [ ] A tester **fills in and saves the questionnaire** and reopens it to see their answers.
      This is the step that was broken, so it is the most important one to see working.
- [ ] That tester's Santa gets the "updated their questionnaire" email.
- [ ] Try **Remind**, fix a deliberately mistyped email and **Resend**, and remove one person.
- [ ] Check every tester's **spam folder** and note if anything landed there.
- [ ] **Delete the group** afterwards, and confirm it is gone from the testers' home pages.

If any step fails, stop and note the step. Do not launch until it works.
Tell the testers it was a test, so nobody thinks they are already matched.

## 4. The real launch

Do this when the dry run passed. Pick a time when you can sit at the computer for about
30 minutes, and give the family a heads up that an email from the app is coming
("check your spam if you don't see it").

**Before you start**

- [ ] Collect all 16 names and **correct email addresses**. Nobody shares an address. If someone
      doesn't use email, give them a Gmail plus-address of someone helping them
      (for example `name+grandpa@gmail.com`).
- [ ] Decide the **budget** and the **exchange date**.
- [ ] List the "can't draw" pairs (couples, people who live together).

**Steps**

1. [ ] **Sign in** to the app with the address that is in `ORGANIZER_EMAILS`.
2. [ ] **Start a Secret Santa:** name (for example "Family Christmas 2026"), budget, exchange date.
3. [ ] **Add each person**, one at a time: name, email, phone (optional). You are on the roster
      yourself already; you will receive a match too. Add the other 15. **Re-read each email
      address twice.** A typo means that person never gets their match.
4. [ ] **Add the rules.** On each person's row, use "Can't draw" to pick the other person.
      Rules go both ways unless you tick "one way only". Check the rule shows on both rows.
5. [ ] **Match everyone.** You will see "16 people matched ✓". If the app says the rules make
      a draw impossible, it explains why in plain words; loosen a rule and try again.
      You can re-match as often as you like before Send.
6. [ ] **Send to everyone.** Press it **once** and wait; it takes up to a minute. Don't
      refresh or press it twice.
7. [ ] **Check the dashboard.** Each person should show **Email sent**. Don't expect to see who
      got whom; that is by design, even for you.
8. [ ] Open your own match email and look at it yourself.

**If something goes wrong**

- **A badge says "Email failed" or "Not emailed".** Check the person's email address on their
  row (spot the typo), fix it, and press **Resend match email** on that person. If you changed
  the address, the old address gets a short "your email was changed" notice.
- **Someone says "my link expired" or "link already used".** Links last 24 hours, and each new
  email from the app replaces the previous link. Tell them to open the app, enter their email on
  the sign-in page and request a fresh link, or press **Resend match email** for them. Wait a bit
  between resends, as every resend cancels the previous link.
- **Nobody got an email at all.** The app should refuse to mark the group as sent in this case.
  Check the spam folder first, then tell me. Likely causes: the Gmail app password was revoked
  (see `SETUP.md`, section 3) or a Gmail outage.
- **Someone isn't on the roster and needs to be added after Send.** Use **Add person**. If the
  app says it can't fit them in without changing everyone's match, press **Match again**, then
  **Send**, which tells everyone their match has changed.
- **Never** re-match after Send unless you really mean it. It replaces everyone's match.

## 5. The first 48 hours

- [ ] **Within the first hour:** confirm everyone shows "Signed in" once they open their email.
      A phone call to someone who hasn't opened it is the fastest fix.
- [ ] **Day 1 evening:** look at who shows "No questionnaire". Press **Remind everyone who hasn't
      filled it out** at most once a day. Nudge individuals by text if you prefer.
- [ ] **Day 2:** sign-in links from the first email will have expired. Anyone locked out just
      requests a new one (a limit of 100 emails an hour applies, plenty for 16 people).
- [ ] When someone updates their questionnaire, their Santa gets an "updated their
      questionnaire" email, at most one every 30 minutes per person. This is expected.
- [ ] Check your spam folder and Supabase/Vercel for problems at the start and end of each day
      (Vercel → Logs shows errors; Supabase → Logs → Auth shows failed emails).
- [ ] If you see a real problem, stop pressing buttons and send me the exact message.

## 6. What comes later

- **Gift ideas (by Fri Nov 20).** The code is live but switched off until the Anthropic key is in
  Vercel (section 2) and the site is redeployed. After that, Santas see suggestions based on their
  giftee's answers; nobody needs to do anything except fill in the questionnaire. Check it with a
  test person on the dry-run group before the real launch if you can.
- **Reveal (exchange day).** The Reveal button is built and live. It only works on or after the
  exchange date, so set that date correctly when you create the group.
- **Clean-up after the holidays.** Delete the group if you want the data gone.

## Quick reference

| Thing | Where |
|---|---|
| The app | https://secretsantaapp-web.vercel.app |
| Hosting settings, env vars, deploys, logs | Vercel → `secretsantaapp-web` |
| Database, sign-in, email limits | Supabase → "Secret Santa 2026" |
| Email password problems | `SETUP.md`, section 3 (Gmail app password) |
| Dry-run checklist | [`DRY-RUN.md`](DRY-RUN.md) |
| Task list | [`TASKS.md`](TASKS.md) |
