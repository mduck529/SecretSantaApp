-- Launch hardening (docs/TASKS.md, L2 and L3).

-- ---------------------------------------------------------------------------
-- 1. Only the server creates groups, after checking the ORGANIZER_EMAILS allow-list.
--    Before this, any signed-in visitor could create a group and email strangers.
-- ---------------------------------------------------------------------------
drop function public.create_group(text, text, integer, integer, date);

create function public.create_group_as(
  owner_id uuid,
  owner_email text,
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
  if owner_id is null or owner_email is null then
    raise exception 'owner required';
  end if;
  insert into public.groups (name, budget_min_cents, budget_max_cents, exchange_date, created_by)
  values (group_name, budget_min, budget_max, exchange, owner_id)
  returning id into gid;
  insert into public.memberships (group_id, display_name, email, user_id, role)
  values (gid, organizer_name, lower(owner_email), owner_id, 'organizer');
  insert into public.audit_log (group_id, actor_user_id, action)
  values (gid, owner_id, 'group_created');
  return gid;
end;
$$;
revoke all on function public.create_group_as(uuid, text, text, text, integer, integer, date)
  from public, anon, authenticated;
grant execute on function public.create_group_as(uuid, text, text, text, integer, integer, date)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. A new draw means nobody has been emailed their (new) match yet, so the
--    organizer dashboard must not keep showing "sent" from an earlier round.
--    match_email_sent_at is kept: Send uses it to word the email as
--    "your match has changed" for people who already got an earlier one.
-- ---------------------------------------------------------------------------
create or replace function public.save_assignments(
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

  if action in ('draw', 'redraw') then
    update public.memberships set match_email_status = 'not_sent' where group_id = gid;
  end if;

  insert into public.audit_log (group_id, actor_user_id, action, details)
  values (gid, actor, action, jsonb_build_object('round', next_round, 'participants', saved));
  return saved;
end;
$$;
revoke all on function public.save_assignments(uuid, jsonb, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_assignments(uuid, jsonb, text, uuid, uuid) to service_role;
