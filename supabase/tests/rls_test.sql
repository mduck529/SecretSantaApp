-- Privacy tests for the schema. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.eq(actual anyelement, expected anyelement, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

create function tests.fails(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok  % (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: statement succeeded but should have been blocked', label;
end $$;
grant execute on all functions in schema tests to authenticated;

create function tests.login(name text) returns void language sql security definer as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', u.id, 'email', u.email)::text, false)
  from auth.users u where u.email = name || '@example.com';
$$;
grant execute on function tests.login(text) to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'org@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'outsider@example.com');

set client_min_messages = notice;

-- Organizer creates the group and enters the roster with a rule.
set role authenticated;
select tests.login('org');
select public.create_group('Family 2026', 'Org') as gid \gset
select tests.eq((select budget_min_cents from public.groups), 10000, 'default budget min $100');
select tests.eq((select budget_max_cents from public.groups), 15000, 'default budget max $150');
select tests.fails($$insert into public.memberships (group_id, display_name, email)
  values ((select id from public.groups), 'X', 'x@example.com')$$, 'roster is written only by the server');
select tests.fails($$delete from public.memberships$$, 'organizer cannot delete members directly');

-- The server (after its admin check) writes the roster, phones and rules.
reset role;
insert into public.memberships (group_id, display_name, email) values
  (:'gid', 'Alice', 'alice@example.com'),
  (:'gid', 'Bob', 'bob@example.com'),
  (:'gid', 'Carol', 'carol@example.com');
insert into public.exclusion_rules (group_id, a_id, b_id)
  select :'gid', a.id, b.id from public.memberships a, public.memberships b
  where a.email = 'alice@example.com' and b.email = 'bob@example.com';
insert into public.member_contacts (membership_id, phone)
  select id, '+15555550123' from public.memberships where email = 'alice@example.com';
select tests.fails($$insert into public.member_contacts (membership_id, phone)
  select id, '555-0123' from public.memberships where email = 'bob@example.com'$$, 'phone must be in +1... format');
insert into public.groups (id, name) values ('00000000-0000-0000-0000-0000000000ff', 'Other group');
insert into public.memberships (group_id, display_name, email)
  values ('00000000-0000-0000-0000-0000000000ff', 'Zed', 'zed@example.com');
select tests.fails($$insert into public.exclusion_rules (group_id, a_id, b_id)
  select g.group_id, g.id, z.id from public.memberships g, public.memberships z
  where g.email = 'alice@example.com' and z.email = 'zed@example.com'$$, 'rules cannot cross groups');
set role authenticated;
select tests.login('org');
select tests.fails($$update public.memberships set user_id = auth.uid()$$, 'organizer cannot set user_id directly');
select tests.fails($$update public.groups set status = 'sent'$$, 'organizer cannot change draw status directly');

-- Everyone signs in and claims their roster entry.
select tests.login('alice'); select tests.eq(public.claim_memberships(), 1, 'alice claims her entry');
select tests.login('bob');   select tests.eq(public.claim_memberships(), 1, 'bob claims his entry');
select tests.login('carol'); select tests.eq(public.claim_memberships(), 1, 'carol claims her entry');
reset role;

-- Server runs the draw: org -> alice -> carol -> bob -> org
select public.save_assignments(:'gid', (
  select jsonb_agg(jsonb_build_object('giver', g.id, 'receiver', r.id))
  from (values ('org','alice'), ('alice','carol'), ('carol','bob'), ('bob','org')) v(gn, rn)
  join public.memberships g on g.email = v.gn || '@example.com'
  join public.memberships r on r.email = v.rn || '@example.com'
), 'draw', null);

select tests.fails(format($$select public.save_assignments(%L, '[]'::jsonb, 'redraw', null)$$, :'gid'),
  'save_assignments refuses an incomplete draw');
select tests.eq((select status from public.groups where id = :'gid'), 'matched', 'matching waits for Send');

-- Organizer (a participant) sees only their own match.
set role authenticated;
select tests.login('org');
select tests.eq((select count(*) from public.assignments), 1::bigint, 'organizer sees exactly one match');
select tests.eq((select r.display_name from public.assignments a join public.memberships r on r.id = a.receiver_id),
  'Alice', 'organizer sees their own giftee');
select tests.fails($$insert into public.assignments select * from public.assignments$$, 'organizer cannot insert matches');
select tests.fails($$update public.assignments set round = 99$$, 'organizer cannot update matches');
select tests.eq((select count(*) from public.memberships), 4::bigint, 'organizer sees the roster');
select tests.eq((select count(*) from public.exclusion_rules), 1::bigint, 'organizer sees rules');
select tests.eq((select phone from public.member_contacts), '+15555550123', 'organizer sees phone numbers');
select tests.fails($$select public.save_assignments((select id from public.groups), '[]'::jsonb, 'redraw', null)$$,
  'organizer cannot call save_assignments');

-- Questionnaire: Bob fills his out. Only Bob and his Santa (Carol) can read it.
select tests.login('bob');
insert into public.questionnaire_answers (membership_id, answers, is_complete)
  select id, '{"hobbies": "fishing"}', true from public.memberships where email = 'bob@example.com';
select tests.fails($$insert into public.questionnaire_answers (membership_id, answers)
  select id, '{}' from public.memberships where email = 'alice@example.com'$$, 'bob cannot write alice''s answers');
select tests.eq((select count(*) from public.questionnaire_answers), 1::bigint, 'bob reads his own answers');

select tests.login('carol');
select tests.eq((select answers->>'hobbies' from public.questionnaire_answers), 'fishing', 'carol (bob''s Santa) reads bob''s answers');
select tests.eq((select count(*) from public.exclusion_rules), 0::bigint, 'members cannot see rules');
select tests.eq((select count(*) from public.member_contacts), 0::bigint, 'members cannot see others'' phone numbers');
select tests.fails($$insert into public.memberships (group_id, display_name, email)
  values ((select id from public.groups), 'Y', 'y@example.com')$$, 'members cannot add people');

select tests.login('org');
select tests.eq((select count(*) from public.questionnaire_answers), 0::bigint, 'organizer cannot read bob''s answers');
select tests.eq((select questionnaire_complete from public.memberships where email = 'bob@example.com'), true,
  'dashboard shows bob is done');
select tests.fails($$select * from public.profile_notifications$$, 'organizer cannot read notification queue');
select tests.fails($$select public.reset_unsent_match((select id from public.groups))$$, 'organizer cannot call reset_unsent_match');

select tests.login('alice');
select tests.eq((select count(*) from public.questionnaire_answers), 0::bigint, 'alice cannot read bob''s answers');
select tests.eq((select phone from public.member_contacts), '+15555550123', 'alice sees her own phone number');
select tests.eq((select count(*) from public.assignments), 1::bigint, 'alice sees exactly one match');

select tests.login('outsider');
select tests.eq((select count(*) from public.groups), 0::bigint, 'outsider sees no groups');
select tests.eq((select count(*) from public.memberships), 0::bigint, 'outsider sees no roster');
select tests.eq((select count(*) from public.assignments), 0::bigint, 'outsider sees no matches');
reset role;

select tests.eq((select count(*) from public.profile_notifications), 1::bigint, 'bob''s edit queued one notification');
select tests.eq(public.reset_unsent_match(:'gid'), true, 'unsent match can be cleared by the server');
select tests.eq((select count(*) from public.assignments), 0::bigint, 'clearing removes matches');
select public.save_assignments(:'gid', (
  select jsonb_agg(jsonb_build_object('giver', g.id, 'receiver', r.id))
  from (values ('org','alice'), ('alice','carol'), ('carol','bob'), ('bob','org')) v(gn, rn)
  join public.memberships g on g.email = v.gn || '@example.com'
  join public.memberships r on r.email = v.rn || '@example.com'
), 'redraw', null);
update public.groups set status = 'sent' where id = :'gid';
select tests.eq(public.reset_unsent_match(:'gid'), false, 'a sent match is never silently cleared');
select tests.eq((select count(*) from public.audit_log where action = 'draw'), 1::bigint, 'draw is audited');
select tests.eq((select details ? 'pairs' from public.audit_log where action = 'draw'), false, 'audit log holds no pairings');

-- Changing someone's email detaches their login.
set role authenticated;
select tests.login('org');
reset role;
update public.memberships set email = 'carol.new@example.com' where email = 'carol@example.com';
set role authenticated;
select tests.eq((select user_id from public.memberships where email = 'carol.new@example.com'), null::uuid,
  'email change detaches the old login');
reset role;

-- After the exchange the organizer turns on reveal; then everyone sees all matches.
update public.groups set revealed_at = now();
set role authenticated;
select tests.login('alice');
select tests.eq((select count(*) from public.assignments), 4::bigint, 'after reveal everyone sees all matches');
reset role;

\echo 'ALL RLS TESTS PASSED'
