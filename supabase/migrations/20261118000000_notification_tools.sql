-- Organizer notification tools: automatic reminders and announcements.
--
-- Both columns are written only by the server (service role) after an admin check.
-- Neither reveals a pairing, so the organizer can read them like the other status columns.

-- Off by default. When on, a daily job nudges people who still haven't finished their
-- questionnaire (see apps/web/lib/audience.ts for the exact schedule).
alter table public.groups
  add column auto_remind boolean not null default false;

-- How many automatic reminders this person has received, so the job stops after a few.
-- Manual reminders only touch last_reminded_at.
alter table public.memberships
  add column auto_reminder_count integer not null default 0 check (auto_reminder_count >= 0);
