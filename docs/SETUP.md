# Account setup checklist

About 30–40 minutes. Do the steps in order; later steps use things from earlier ones.
**Never paste keys or passwords into chat.** Where Claude needs one, it will ask through a
secure form, or you'll enter it directly in the service's dashboard.

## 1. Vercel (hosting) — ~5 min

1. Sign up at **vercel.com** with your GitHub account (the one that owns `secretsantaapp`).
2. **Import the project:** **Add New → Project** → choose `mduck529/secretsantaapp`.
   - **Root Directory:** `apps/web`
   - Framework: Next.js (auto-detected)
   - Don't add environment variables yet; click **Deploy**. (The first deploy may fail
     until step 4 is done. That's expected.)
3. **Domain:** the app lives at **`bassl.xyz`** (bought through Vercel → **Domains**, so its DNS
   is managed there). Project → **Settings → Domains** has:
   - `bassl.xyz`: the production address
   - `www.bassl.xyz`: redirects (308) to `bassl.xyz`
   - `secretsantaapp-web.vercel.app`: redirects to `bassl.xyz`, so old links keep working
   Below, `YOUR-APP-URL` means `bassl.xyz`.

## 2. Supabase (database and sign-in) — ~10 min

1. Sign up at **supabase.com** → **New project**.
   - Name: `secret-santa`
   - Region: the US region closest to most of the family (e.g. East US)
   - Database password: generate one and save it in your password manager.
2. When the project is ready: **Project Settings → API**. You'll need three values in step 4:
   - Project URL
   - `anon` public key
   - `service_role` key (secret: it bypasses all privacy rules; only goes into Vercel)
3. **Authentication → URL Configuration**
   - Site URL: `https://YOUR-APP-URL`
   - Redirect URLs: add `https://YOUR-APP-URL/**`. Keep `https://secretsantaapp-web.vercel.app/**`
     too, so sign-in links sent before the switch still work.
4. **Sign-in link settings** (so the links in emails keep working for a day, and work on any device):
   - **Authentication → Providers → Email:** set *Email OTP Expiration* to `86400` (24 hours).
   - **Authentication → Emails → Templates:** in both **Magic Link** and **Confirm signup**, replace
     the link with:
     `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/home">Sign in to Secret Santa</a>`
5. Create the database tables: Claude will do this once you've added a Supabase access
   token through the secure form (Account → Access Tokens). Or you can paste
   `supabase/migrations/*.sql` into **SQL Editor** yourself.

## Migrations: getting database changes to production

Only the owner (or Claude with the owner's approval) runs these. Pull requests list the
migrations they add; nothing is applied automatically.

**One-time setup** (production's schema was applied by hand, so its history is empty):

1. Install the Supabase CLI, then `supabase login` and
   `supabase link --project-ref YOUR_PROJECT_REF` (the ref is in the project's URL).
2. Record the initial migration as already applied, without running it:
   `supabase migration repair --status applied 20261107000000`
3. Check: `scripts/migrate-status.sh` should show the initial file as `applied`.

**Every time a pull request adds a migration:**

1. `scripts/migrate-status.sh` shows what is `PENDING`.
2. `supabase db push` applies the pending files, after showing the list and asking to confirm.
3. Run it **before** deploying the code that needs it.

Never edit a migration that is already applied; add a new timestamped file instead.

## 3. Resend (email from `santa@bassl.xyz`) — ~10 min, plus waiting for verification

All email (sign-in links, match emails, reminders) is sent from `santa@bassl.xyz` through
Resend's SMTP server. The free plan allows 100 emails a day and 3,000 a month, plenty for a
family draw.

1. Sign up at **resend.com** → **Domains → Add Domain** → `bassl.xyz`.
2. Resend lists DNS records (DKIM `TXT` at `resend._domainkey`, plus `MX` and SPF `TXT` at
   `send`). Add each in Vercel → **Domains → bassl.xyz → DNS Records**, exactly as shown.
   Also add a DMARC record: `TXT` at `_dmarc`, value `v=DMARC1; p=none;`.
   (Claude can add these through Vercel for you.)
3. Back in Resend, click **Verify**. Usually minutes, sometimes a few hours.
4. **API Keys → Create API Key**, permission *Sending access*, domain `bassl.xyz`.
   Resend shows it once. Put it straight into your password manager; it goes into Vercel and
   Supabase below, never into chat.
5. **Sign-in emails go through Resend too.** Supabase's built-in email is limited to a
   few messages per hour, which isn't enough for a family. In Supabase →
   **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Host `smtp.resend.com`, Port `465`
   - Username `resend`, Password = the Resend API key
   - Sender email `santa@bassl.xyz`, Sender name `Family Secret Santa`

If you ever delete or roll the API key, update it in both Vercel and Supabase.

## 4. Connect them — ~5 min

In Vercel → Project → **Settings → Environment Variables**, add (for Production and Preview):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | The Resend API key from step 3 |
| `EMAIL_FROM` | `Family Secret Santa <santa@bassl.xyz>` |
| `EMAIL_REPLY_TO` | `secretsanta8@gmail.com` (`santa@bassl.xyz` has no inbox, so replies go here) |
| `APP_URL` | `https://YOUR-APP-URL` |
| `CRON_SECRET` | Any long random string (protects the email-sending job) |
| `ORGANIZER_EMAILS` | Your own email address (comma-separate several). Only these people can start a group |

Then **Deployments → ⋯ → Redeploy**.

## 5. Tell Claude

Reply with just "done" (or which step got stuck). No keys in chat.
