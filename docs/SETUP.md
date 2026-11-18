# Account setup checklist

About 30–45 minutes. Do the steps in order; later steps use things from earlier ones.
**Never paste keys or passwords into chat.** Where Claude needs one, it will ask through a
secure form, or you'll enter it directly in the service's dashboard.

## 1. Vercel (hosting) and the domain — ~10 min

1. Sign up at **vercel.com** with your GitHub account (the one that owns `secretsantaapp`).
2. **Buy the domain:** Vercel dashboard → **Domains** → **Buy**. Pick the name; about $10–20/year.
   Buying it at Vercel means its DNS is managed there automatically.
3. **Import the project:** **Add New → Project** → choose `mduck529/secretsantaapp`.
   - **Root Directory:** `apps/web`
   - Framework: Next.js (auto-detected)
   - Don't add environment variables yet; click **Deploy**. (The first deploy may fail
     until step 4 is done. That's expected.)
4. Project → **Settings → Domains** → add the domain you bought.

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
   - Site URL: `https://YOUR-DOMAIN`
   - Redirect URLs: add `https://YOUR-DOMAIN/**`
4. **Sign-in link settings** (so the links in emails keep working for a day, and work on any device):
   - **Authentication → Providers → Email:** set *Email OTP Expiration* to `86400` (24 hours).
   - **Authentication → Emails → Templates:** in both **Magic Link** and **Confirm signup**, replace
     the link with:
     `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/home">Sign in to Secret Santa</a>`
5. Create the database tables: Claude will do this once you've added a Supabase access
   token through the secure form (Account → Access Tokens). Or you can paste
   `supabase/migrations/*.sql` into **SQL Editor** yourself.

## 3. Resend (email) — ~10 min, plus waiting for verification

1. Sign up at **resend.com** → **Domains → Add Domain** → enter `YOUR-DOMAIN`
   (Resend may suggest a subdomain such as `mail.YOUR-DOMAIN`; that's fine).
2. Resend shows 3–4 DNS records (MX, TXT for SPF, TXT for DKIM, optional DMARC).
   In Vercel → **Domains → YOUR-DOMAIN → DNS Records**, add each one exactly as shown.
3. Back in Resend, click **Verify**. It usually takes minutes, sometimes up to a few hours.
4. **API Keys → Create API Key** (permission: Sending access).
5. **Sign-in emails go through Resend too.** Supabase's built-in email is limited to a
   few messages per hour, which isn't enough for a family. In Supabase →
   **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Host `smtp.resend.com`, Port `465`, Username `resend`, Password = the Resend API key
   - Sender email `santa@YOUR-DOMAIN`, Sender name e.g. `Family Secret Santa`

## 4. Connect them — ~5 min

In Vercel → Project → **Settings → Environment Variables**, add (for Production and Preview):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | `Family Secret Santa <santa@YOUR-DOMAIN>` |
| `APP_URL` | `https://YOUR-DOMAIN` |
| `CRON_SECRET` | Any long random string (protects the email-sending job) |

Then **Deployments → ⋯ → Redeploy**.

## 5. Tell Claude

Reply with just: the domain name, and "done" (or which step got stuck). No keys in chat.
