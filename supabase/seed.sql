-- Dry-run seed: one throwaway group with 12 test people, 5 couples, and a few filled questionnaires.
-- NOT for production. Load it into a local or throwaway Supabase database only, e.g.
--   supabase db reset            (runs migrations, then this file)
-- or: psql -f supabase/seed.sql  against a local database that already has the migrations.
-- Every address is @example.com, so nothing can reach a real inbox. No assignments are
-- inserted: the app makes the match when the organizer presses Match.

-- The group (status 'draft': people and rules can be entered, nothing drawn yet).
insert into public.groups (id, name, budget_min_cents, budget_max_cents, exchange_date, status)
values (md5('seed-group')::uuid, 'Dry Run Family Group', 10000, 15000, '2026-12-25', 'draft');

-- 12 people. tester01 is the organizer. Phones are fake 555 numbers for four people.
insert into public.memberships (id, group_id, display_name, email, role, created_at)
select md5('seed-member-' || n)::uuid,
       md5('seed-group')::uuid,
       case n
         when 1 then 'Ada Tester (organizer)'
         when 2 then 'Ben Tester'
         when 3 then 'Carla Tester'
         when 4 then 'Dev Tester'
         when 5 then 'Ella Tester'
         when 6 then 'Finn Tester'
         when 7 then 'Gia Tester'
         when 8 then 'Hugo Tester'
         when 9 then 'Ines Tester'
         when 10 then 'Jack Tester'
         when 11 then 'Kira Tester'
         when 12 then 'Leo Tester'
       end,
       'tester' || lpad(n::text, 2, '0') || '@example.com',
       case when n = 1 then 'organizer' else 'member' end,
       now()
from generate_series(1, 12) as n;

insert into public.member_contacts (membership_id, phone)
select md5('seed-member-' || n)::uuid, '+1555555' || lpad((100 + n)::text, 4, '0')
from generate_series(2, 5) as n;

-- Five couples who must not draw each other (two-way). Pairs: 2-3, 4-5, 6-7, 8-9, 10-11.
-- Ada (1) and Leo (12) have no rules.
insert into public.exclusion_rules (group_id, a_id, b_id, two_way)
select md5('seed-group')::uuid, md5('seed-member-' || a)::uuid, md5('seed-member-' || b)::uuid, true
from (values (2, 3), (4, 5), (6, 7), (8, 9), (10, 11)) as pairs(a, b);

-- Filled questionnaires for four testers. Keys match packages/core/src/questionnaire.ts.
-- Inserting here fires the questionnaire trigger, which sets questionnaire_complete on the membership.
insert into public.questionnaire_answers (membership_id, answers, is_complete)
select md5('seed-member-' || n)::uuid, answers::jsonb, true
from (values
  (2, '{"hobbies":"Climbing, board games, baking bread","loves":"Dark chocolate, wool socks, plants","please_no":"Mugs, candles, anything with a slogan","favorite_colors":"Green and navy","treats":"Good coffee beans","stores":"Local bookshop","experiences":"A cooking class","shirt_size":"M","shoe_size":"10","allergies":"Peanuts","wishlist":"A cast-iron pan","anything_else":""}'),
  (4, '{"hobbies":"Cycling and photography","loves":"Film cameras, maps, tea","please_no":"Novelty gadgets","favorite_colors":"Orange","treats":"Trail mix","stores":"Any camera shop","experiences":"A day trip by train","shirt_size":"L","shoe_size":"11","allergies":"","wishlist":"A tripod","anything_else":"Pick something I can use outdoors"}'),
  (6, '{"hobbies":"Gardening and cooking","loves":"Herbs, linen, jazz records","please_no":"Anything plastic","favorite_colors":"Yellow","treats":"Pastries","stores":"Garden centre","experiences":"","shirt_size":"S","shoe_size":"7","allergies":"","wishlist":"","anything_else":""}'),
  (10, '{"hobbies":"Football, reading thrillers","loves":"Sci-fi novels, hot sauce","please_no":"Socks, slippers","favorite_colors":"Blue","treats":"Snacks from abroad","stores":"","experiences":"Tickets to a match","shirt_size":"XL","shoe_size":"12","allergies":"","wishlist":"A good headlamp","anything_else":""}')
) as seed(n, answers);
