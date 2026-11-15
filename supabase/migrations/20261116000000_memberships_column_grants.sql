-- Security review fixes M-2 and M-3 (docs/SECURITY-REVIEW.md).
--
-- M-2: every member could read every column of `memberships` through the API. After Send,
-- adding or removing someone updates `match_email_sent_at` only for the giver(s) whose match
-- changed, so comparing timestamps showed who is the newcomer's Santa, or who was buying for
-- the person removed. Members now read only the columns the app reads with their own session.
--
-- M-3: when a follow-up email after an add or remove fails, the server must not mark that
-- person "failed" where the organizer (or anyone) can see it. It records the retry in a new
-- server-only column instead, and the daily cron tries again.

alter table public.memberships
  add column match_email_retry boolean not null default false;

comment on column public.memberships.match_email_retry is
  'Server-only. A "your match has changed" email after an add or remove failed and is retried by the daily cron. Never granted to clients: it would show whose match changed.';
comment on column public.memberships.match_email_sent_at is
  'Server-only. When this person was last emailed their match. Never granted to clients: after an add or remove it would show whose match changed.';

-- Column grants. Every column a client reads, filters or orders by must be listed here:
--   lib/auth.ts requireMember       id, role, display_name, email; filters group_id, user_id
--   app/g/[id]/page.tsx             display_name; filters id
--   app/g/[id]/admin/page.tsx       id, display_name, email, role, user_id,
--                                   questionnaire_complete, match_email_status;
--                                   filters group_id; orders by created_at
--   RLS policy contacts_select      id, group_id
-- Deliberately NOT granted: match_email_sent_at, match_email_retry (whose match changed),
-- questionnaire_updated_at and last_reminded_at (not read by clients; server-only status).
revoke select on public.memberships from authenticated;
grant select (id, group_id, display_name, email, user_id, role,
              questionnaire_complete, match_email_status, created_at)
  on public.memberships to authenticated;

-- anon never had access; keep it that way explicitly.
revoke all on public.memberships from anon;
