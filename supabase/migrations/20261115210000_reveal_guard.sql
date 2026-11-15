-- Reveal guard (task P1 review).
-- 1. Once matches are out, the exchange date can't be moved to today or earlier, and
--    revealed_at can only be set when the group is sent and the date has arrived
--    (Eastern time, matching apps/web/lib/reveal.ts).
-- 2. reveal_group(): service-role-only; checks, claims and audits in one transaction.

create function public.groups_guard_reveal() returns trigger
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
begin
  if new.revealed_at is distinct from old.revealed_at and new.revealed_at is not null then
    if new.status <> 'sent' or new.exchange_date is null or new.exchange_date > today then
      raise exception 'Reveal opens on the exchange date, after matches are sent';
    end if;
  end if;
  if new.exchange_date is distinct from old.exchange_date
     and new.exchange_date is not null
     and new.exchange_date <= today
     and old.status <> 'draft' then
    raise exception 'Matches are already out, so the exchange date can only move to a future day';
  end if;
  return new;
end;
$$;

create trigger groups_guard_reveal before update on public.groups
  for each row execute function public.groups_guard_reveal();

-- Returns: 'ok', 'already', 'not_sent', 'no_date', 'too_early'. Raises if actor is not an organizer.
create function public.reveal_group(gid uuid, actor uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
  today date := (now() at time zone 'America/New_York')::date;
begin
  if not exists (
    select 1 from public.memberships m
    where m.group_id = gid and m.user_id = actor and m.role in ('organizer', 'co_organizer')
  ) then
    raise exception 'Not an organizer of this group';
  end if;
  select * into g from public.groups where id = gid for update;
  if not found then raise exception 'Group not found'; end if;
  if g.revealed_at is not null then return 'already'; end if;
  if g.status <> 'sent' then return 'not_sent'; end if;
  if g.exchange_date is null then return 'no_date'; end if;
  if g.exchange_date > today then return 'too_early'; end if;
  update public.groups set revealed_at = now() where id = gid;
  insert into public.audit_log (group_id, actor_user_id, action) values (gid, actor, 'revealed');
  return 'ok';
end;
$$;

revoke all on function public.reveal_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reveal_group(uuid, uuid) to service_role;
