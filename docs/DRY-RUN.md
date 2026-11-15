# Dry-run checklist

Run this once before the real launch (task H5, Thursday Nov 12). It uses a throwaway group
with two to three real testers, so you can see every screen and email the family will get.

**Before you start**

- [ ] Vercel has `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` and `ORGANIZER_EMAILS` set, and the
      latest deploy is live (see `docs/SETUP.md`).
- [ ] The Supabase project has the launch migration (`20261111000000_launch_hardening.sql`).
- [ ] Supabase email rate limit is at 100 per hour (already done, see H3).
- [ ] You have the phone numbers or email addresses of 2 or 3 testers who agreed to take part.
      Use real addresses for them only, never for anyone not in the test.

Do not add the family to this test group. Use a group named `DRY RUN - delete me`.

## 1. Sign in

- [ ] On an iPhone, open the app address and request a sign-in link with your own address.
      Open the email, tap **Continue**, and check that you land on your home page.
- [ ] On an Android phone, do the same with a second address.
- [ ] Ask one tester to sign in from a laptop as well.

## 2. Build the group

- [ ] Create the group `DRY RUN - delete me`. Check the budget and exchange date.
- [ ] Add 4 to 5 people (testers plus some made-up names on your own addresses, such as
      `you+test1@gmail.com`). Give one person a phone number and leave another without one.
- [ ] Add one rule: two people who must not draw each other. Check the rule shows on both rows.
- [ ] Try to add the same email twice. You should see a friendly message, not an error page.

## 3. Match and Send

- [ ] Press **Match**. You should see only a count, never who has whom. Check the page source
      and the browser's network responses do not list pairings.
- [ ] Press **Match** again. The result should change, and the message should still show counts only.
- [ ] Press **Send**. Each tester should get one match email within a minute.
- [ ] Press **Send** a second time quickly (two taps). Nobody should get a second email.

## 4. Each tester opens their email

- [ ] Tap the link in the email on the phone it arrived on. Tap **Continue**. You see your
      giftee's name and nothing else about the group's pairings.
- [ ] An hour later, reopen the same email and tap the link again. You should still reach your page
      (the sign-in link can be used again while you are signed in).
- [ ] Ask a tester to request a fresh sign-in link from the sign-in page. It should arrive, and
      the older link should still work for them.

## 5. Questionnaire and updates

- [ ] The tester fills in the questionnaire, saves it, then comes back to it. Check that it
      shows the answers they saved, and that the three required questions are marked with a star.
- [ ] The tester's Santa receives the "your giftee updated their profile" email.
- [ ] Make a second change within 30 minutes. The Santa should not get a second email yet.

## 6. Reminders and typos

- [ ] Press **Remind** on one person who has not finished the questionnaire. They get a reminder.
- [ ] Change one tester's email to a typo (for example `tester@gmial.com`), then to the right one.
      The old address should get the "email changed" notice. Press **Resend** for that person.
- [ ] Check the spam folders of the testers' accounts. Note anything that landed there.

## 7. Remove and re-match

- [ ] Remove one tester after Send. Check the organizer sees a plain message, and that exactly one
      "your match has changed" email goes to the person who was affected.
- [ ] Add a new person after Send. If the app says it cannot fit them in without changing everyone's
      match, press **Match** again and then **Send**. Only then should the new person be emailed.

## 8. Clean up

- [ ] Delete the `DRY RUN - delete me` group from the organizer page.
- [ ] Confirm the group is gone from the testers' home pages.
- [ ] Write down anything that confused you, in plain words, in the pull request or in
      `docs/TASKS.md` under the launch section.

## Things to write down

| What you saw | Which step | Yes / no and why |
|---|---|---|
| | | |

If any step fails, stop, note the step number, and do not press Send for the real group
until it works.
