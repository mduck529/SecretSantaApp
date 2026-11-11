# Account setup checklist

About 25–30 minutes. Do the steps in order; later steps use things from earlier ones.
**Never paste keys or passwords into chat.** Where Claude needs one, it will ask through a
secure form, or you'll enter it directly in the service's dashboard.

## 1. Vercel (hosting) — ~5 min

1. Sign up at **vercel.com** with your GitHub account (the one that owns `secretsantaapp`).
2. **Import the project:** **Add New → Project** → choose `mduck529/secretsantaapp`.
   - **Root Directory:** `apps/web`
   - Framework: Next.js (auto-detected)
   - Don't add environment variables yet; click **Deploy**. (The first deploy may fail
     until step 4 is done. That's expected.)
3. Note the app's address from Project → **Settings → Domains**, e.g. `secretsantaapp.vercel.app`.
   Below, `YOUR-APP-URL` means that address. No domain purchase is needed.

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
   - Redirect URLs: add `https://YOUR-APP-URL/**`
4. **Sign-in link settings** (so the links in emails keep working for a day, and work on any device):
   - **Authentication → Providers → Email:** set *Email OTP Expiration* to `86400` (24 hours).
   - **Authentication → Emails → Templates:** in both **Magic Link** and **Confirm signup**, replace
     the link with:
     `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/home">Sign in to Secret Santa</a>`
5. Create the database tables: Claude will do this once you've added a Supabase access
   token through the secure form (Account → Access Tokens). Or you can paste
   `supabase/migrations/*.sql` into **SQL Editor** yourself.

## 3. Gmail (email) — ~5 min

All email (sign-in links, match emails, reminders) is sent from `secretsanta8@gmail.com`.
Gmail allows about 500 emails a day, far more than a family draw needs.

1. Sign in to `secretsanta8@gmail.com` → **Google Account → Security**.
2. Turn on **2-Step Verification** (required before Google allows app passwords).
3. Go to **myaccount.google.com/apppasswords** → name it `Secret Santa` → **Create**.
   Google shows a 16-letter password once. Put it straight into your password manager;
   it goes into Vercel and Supabase below, never into chat.
4. **Sign-in emails go through Gmail too.** Supabase's built-in email is limited to a
   few messages per hour, which isn't enough for a family. In Supabase →
   **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Host `smtp.gmail.com`, Port `465`
   - Username `secretsanta8@gmail.com`, Password = the app password
   - Sender email `secretsanta8@gmail.com`, Sender name e.g. `Family Secret Santa`

If you ever change the Google account's password, Google revokes the app password;
make a new one and update it in both Vercel and Supabase.

## 4. Connect them — ~5 min

In Vercel → Project → **Settings → Environment Variables**, add (for Production and Preview):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key |
| `SMTP_USER` | `secretsanta8@gmail.com` |
| `SMTP_PASS` | The Gmail app password from step 3 |
| `EMAIL_FROM` | `Family Secret Santa <secretsanta8@gmail.com>` |
| `APP_URL` | `https://YOUR-APP-URL` |
| `CRON_SECRET` | Any long random string (protects the email-sending job) |
| `ORGANIZER_EMAILS` | Your own email address (comma-separate several). Only these people can start a group |

Then **Deployments → ⋯ → Redeploy**.

## 5. Tell Claude

Reply with just: the app address (e.g. `secretsantaapp.vercel.app`), and "done" (or which step got stuck). No keys in chat.
