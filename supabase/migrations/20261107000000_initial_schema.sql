-- Secret Santa: initial schema
--
-- Privacy model (see docs/PLAN.md, "Organizer admin controls"):
--   * Everyone, the organizer included, can read only their OWN assignment row
--     (until the organizer turns on "reveal" after the exchange).
--   * Questionnaire answers are readable only by the person and their current Secret Santa.
--   * Clients can never write assignments. The server writes them with the service role
--     after running the draw in packages/core.
--   * Admin screens read only `memberships` status columns, never assignments.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 100),
  budget_min_cents integer not null default 10000 check (budget_min_cents >= 0),
  budget_max_cents integer not null default 15000,
  exchange_date    date,
  -- draft: entering people and rules. matched: matches made, nothing sent yet (re-match freely).
  -- sent: organizer pressed Send and match emails went out.
  status           text not null default 'draft' check (status in ('draft', 'matched', 'sent')),
  draw_round       integer not null default 0,
  drawn_at         timestamptz,
  sent_at          timestamptz,
  revealed_at      timestamptz,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint budget_range check (budget_max_cents >= budget_min_cents)
);

create table public.memberships (
  id                       uuid primary key default gen_random_uuid(),
  group_id                 uuid not null references public.groups (id) on delete cascade,
  display_name             text not null check (char_length(display_name) between 1 and 80),
  email                    text not null check (email = lower(email) and email like '%_@_%'),
  -- Null until the person signs in for the first time (the organizer enters the roster).
  user_id                  uuid references auth.users (id) on delete set null,
  role                     text not null default 'member' check (role in ('organizer', 'co_organizer', 'member')),
  -- Status columns for the organizer dashboard. None of them reveal a pairing.
  match_email_status       text not null default 'not_sent'
                             check (match_email_status in ('not_sent', 'sent', 'failed')),
  match_email_sent_at      timestamptz,
  questionnaire_complete   boolean not null default false,
  questionnaire_updated_at timestamptz,
  last_reminded_at         timestamptz,
  created_at               timestamptz not null default now(),
  unique (group_id, email)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- Phone numbers are kept apart from the roster so only admins and the person can see them.
-- Collected now for future text/app notifications; the family run is email only.
create table public.member_contacts (
  membership_id uuid primary key references public.memberships (id) on delete cascade,
  phone         text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at    timestamptz not null default now()
);

-- A rule entered on the roster: "a can't draw b" (and b can't draw a when two_way).
create table public.exclusion_rules (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  a_id       uuid not null references public.memberships (id) on delete cascade,
  b_id       uuid not null references public.memberships (id) on delete cascade,
  two_way    boolean not null default true,
  created_at timestamptz not null default now(),
  check (a_id <> b_id),
  unique (a_id, b_id)
);

create table public.assignments (
  group_id    uuid not null references public.groups (id) on delete cascade,
  giver_id    uuid primary key references public.memberships (id) on delete cascade,
  -- Default (NO ACTION) so removing a member fails loudly unless the server repaired the loop first.
  receiver_id uuid not null unique references public.memberships (id),
  round       integer not null,
  created_at  timestamptz not null default now(),
  check (giver_id <> receiver_id)
);
create index assignments_group_idx on public.assignments (group_id);

-- One row per participant; the questionnaire itself is defined in the app (v1 is fixed).
create table public.questionnaire_answers (
  membership_id uuid primary key references public.memberships (id) on delete cascade,
  answers       jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  is_complete   boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- "Your giftee updated their profile" state, one row per giftee. A notification is due when
-- last_edit_at > notified_at. The sender throttles to one email per giftee per 30 minutes
-- and looks up the CURRENT Santa at send time, so a re-match never emails the wrong person.
create table public.profile_notifications (
  membership_id uuid primary key references public.memberships (id) on delete cascade,
  last_edit_at  timestamptz not null default now(),
  notified_at   timestamptz
);

-- Admin actions. Never store pairings in `details`.
create table public.audit_log (
  id            bigint generated always as identity primary key,
  group_id      uuid not null references public.groups (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action        text not null,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_log_group_idx on public.audit_log (group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = gid and m.user_id = auth.uid()
  );
$$;

create function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = gid and m.user_id = auth.uid() and m.role in ('organizer', 'co_organizer')
  );
$$;

create function public.is_my_membership(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.id = mid and m.user_id = auth.uid());
$$;

-- True when the current user is the Secret Santa of membership `mid`.
create function public.is_santa_of(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.assignments a
    join public.memberships g on g.id = a.giver_id
    where a.receiver_id = mid and g.user_id = auth.uid()
  );
$$;

-- Links roster entries to the signed-in user by email. Called right after sign-in.
create function public.claim_memberships() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  claimed integer;
begin
  if auth.uid() is null or auth.email() is null then
    return 0;
  end if;
  update public.memberships
     set user_id = auth.uid()
   where user_id is null and email = lower(auth.email());
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

-- Creates a group with the caller as organizer (and participant).
create function public.create_group(
  group_name text,
  organizer_name text,
  budget_min integer default 10000,
  budget_max integer default 15000,
  exchange date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  gid uuid;
begin
  if auth.uid() is null or auth.email() is null then
    raise exception 'must be signed in';
  end if;
  insert into public.groups (name, budget_min_cents, budget_max_cents, exchange_date, created_by)
  values (group_name, budget_min, budget_max, exchange, auth.uid())
  returning id into gid;
  insert into public.memberships (group_id, display_name, email, user_id, role)
  values (gid, organizer_name, lower(auth.email()), auth.uid(), 'organizer');
  insert into public.audit_log (group_id, actor_user_id, action)
  values (gid, auth.uid(), 'group_created');
  return gid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Changing someone's email detaches their account, so the old login stops working.
create function public.memberships_email_changed() returns trigger
language plpgsql as $$
begin
  if new.email is distinct from old.email then
    new.user_id := null;
    new.match_email_status := 'not_sent';
    new.match_email_sent_at := null;
  end if;
  return new;
end;
$$;
create trigger memberships_email_changed
  before update of email on public.memberships
  for each row execute function public.memberships_email_changed();

-- Keeps dashboard status in sync and queues a notification to the Santa.
create function public.questionnaire_saved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  update public.memberships
     set questionnaire_complete = new.is_complete,
         questionnaire_updated_at = new.updated_at
   where id = new.membership_id;
  if exists (select 1 from public.assignments a where a.receiver_id = new.membership_id) then
    insert into public.profile_notifications (membership_id)
    values (new.membership_id)
    on conflict (membership_id) do update set last_edit_at = now();
  end if;
  return new;
end;
$$;
create trigger questionnaire_saved
  before insert or update on public.questionnaire_answers
  for each row execute function public.questionnaire_saved();

-- Rules may only connect two people in the same group.
create function public.exclusion_rules_same_group() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.memberships m
      where m.id in (new.a_id, new.b_id) and m.group_id = new.group_id) <> 2 then
    raise exception 'rule must connect two members of the same group';
  end if;
  return new;
end;
$$;
create trigger exclusion_rules_same_group
  before insert or update on public.exclusion_rules
  for each row execute function public.exclusion_rules_same_group();

-- Server-only: undo an unsent match (the roster or rules changed after Match, before Send).
create function public.reset_unsent_match(gid uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (select status from public.groups where id = gid) <> 'matched' then
    return false;
  end if;
  delete from public.assignments where group_id = gid;
  update public.groups set status = 'draft' where id = gid;
  insert into public.audit_log (group_id, action) values (gid, 'match_cleared');
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.groups                        enable row level security;
alter table public.memberships                   enable row level security;
alter table public.member_contacts               enable row level security;
alter table public.exclusion_rules               enable row level security;
alter table public.assignments                   enable row level security;
alter table public.questionnaire_answers         enable row level security;
alter table public.profile_notifications         enable row level security;
alter table public.audit_log                     enable row level security;

-- Start from nothing; grant only what the app needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.claim_memberships() to authenticated;
grant execute on function public.create_group(text, text, integer, integer, date) to authenticated;
grant execute on function public.is_group_member(uuid), public.is_group_admin(uuid),
                          public.is_my_membership(uuid), public.is_santa_of(uuid) to authenticated;

-- groups: members read; admins edit settings only (status/draw fields are server-only).
grant select on public.groups to authenticated;
grant update (name, budget_min_cents, budget_max_cents, exchange_date) on public.groups to authenticated;
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));

-- Roster, phone numbers and rules are READ through RLS but WRITTEN only by server actions
-- (apps/web/app/g/[id]/admin/actions.ts) after an admin check. That way a change after Match
-- but before Send always clears the stale matches, and changes after Send repair the loop.

-- memberships: members see the roster.
grant select on public.memberships to authenticated;
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_group_member(group_id));

-- member_contacts: admins and the person themselves.
grant select on public.member_contacts to authenticated;
create policy contacts_select on public.member_contacts for select to authenticated
  using (
    public.is_my_membership(membership_id)
    or public.is_group_admin((select m.group_id from public.memberships m where m.id = membership_id))
  );

-- exclusion_rules: admins only.
grant select on public.exclusion_rules to authenticated;
create policy rules_admin_select on public.exclusion_rules for select to authenticated
  using (public.is_group_admin(group_id));

-- assignments: read your own only (organizer included), or all after reveal. Never writable by clients.
grant select on public.assignments to authenticated;
create policy assignments_own on public.assignments for select to authenticated
  using (public.is_my_membership(giver_id));
create policy assignments_revealed on public.assignments for select to authenticated
  using (
    public.is_group_member(group_id)
    and exists (select 1 from public.groups g where g.id = group_id and g.revealed_at is not null)
  );

-- questionnaire_answers: you write yours; you and your Santa read it.
grant select, insert on public.questionnaire_answers to authenticated;
grant update (answers, is_complete) on public.questionnaire_answers to authenticated;
create policy answers_select on public.questionnaire_answers for select to authenticated
  using (public.is_my_membership(membership_id) or public.is_santa_of(membership_id));
create policy answers_insert on public.questionnaire_answers for insert to authenticated
  with check (public.is_my_membership(membership_id));
create policy answers_update on public.questionnaire_answers for update to authenticated
  using (public.is_my_membership(membership_id)) with check (public.is_my_membership(membership_id));

-- audit_log: admins read; only server and security-definer functions write.
grant select on public.audit_log to authenticated;
create policy audit_admin_select on public.audit_log for select to authenticated
  using (public.is_group_admin(group_id));

-- profile_notifications: server only (no grants, no policies).

-- ---------------------------------------------------------------------------
-- Server-only: atomically replace a group's matches.
-- Used for the draw, a re-draw, and loop repairs when someone is added or removed.
-- Called with the service role after packages/core produced and validated the matches.
-- Returns only a count, never pairings.
-- ---------------------------------------------------------------------------
create function public.save_assignments(
  gid uuid,
  pairs jsonb,
  action text,
  actor uuid,
  remove_member uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  next_round integer;
  saved integer;
  member_count integer;
begin
  if action not in ('draw', 'redraw', 'member_added', 'member_removed') then
    raise exception 'unknown action %', action;
  end if;

  update public.groups
     set draw_round = draw_round + 1,
         -- A new draw always waits for the organizer to press Send again.
         status = case when action in ('draw', 'redraw') then 'matched' else status end,
         sent_at = case when action in ('draw', 'redraw') then null else sent_at end,
         drawn_at = case when action in ('draw', 'redraw') then now() else drawn_at end
   where id = gid
  returning draw_round into next_round;
  if next_round is null then
    raise exception 'group % not found', gid;
  end if;

  delete from public.assignments where group_id = gid;
  if remove_member is not null then
    delete from public.memberships where id = remove_member and group_id = gid;
  end if;

  insert into public.assignments (group_id, giver_id, receiver_id, round)
  select gid, (p->>'giver')::uuid, (p->>'receiver')::uuid, next_round
  from jsonb_array_elements(pairs) p;
  get diagnostics saved = row_count;

  -- Every assignment stays inside this group, and everyone in the group is matched.
  if exists (
    select 1 from public.assignments a
    join public.memberships g on g.id = a.giver_id
    join public.memberships r on r.id = a.receiver_id
    where a.group_id = gid and (g.group_id <> gid or r.group_id <> gid)
  ) then
    raise exception 'assignment references a member of another group';
  end if;
  select count(*) into member_count from public.memberships where group_id = gid;
  if saved <> member_count then
    raise exception 'expected % matches, got %', member_count, saved;
  end if;

  insert into public.audit_log (group_id, actor_user_id, action, details)
  values (gid, actor, action, jsonb_build_object('round', next_round, 'participants', saved));
  return saved;
end;
$$;
revoke all on function public.save_assignments(uuid, jsonb, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reset_unsent_match(uuid) from public, anon, authenticated;

-- The server (service role) needs full access; Supabase usually grants this by default,
-- but be explicit so the privacy model doesn't depend on project defaults.
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
