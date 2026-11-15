-- Gift ideas cache (docs/TASKS.md G2; design in docs/GIFT-IDEAS.md).
--
-- One row per giftee ("receiver"): the latest validated ideas the server generated from that
-- person's questionnaire. Keyed by the receiver, not the Santa, so a loop repair that gives
-- someone a new Santa hands the same ideas to the new Santa without regenerating.
--
-- Privacy:
--   * Readable only by the receiver's CURRENT Secret Santa (is_santa_of). Not by the receiver
--     (the ideas are a surprise), not by the organizer, not by anyone else, even after reveal.
--   * Written only by the server with the service role. No client can insert, update or delete.
--   * Nothing here names or points to the Santa.

create table public.gift_suggestions (
  receiver_id        uuid primary key references public.memberships (id) on delete cascade,
  -- packages/core GiftIdeas: { retail: RetailIdea[], diy: DiyIdea[] }, already validated.
  ideas              jsonb not null check (jsonb_typeof(ideas) = 'object'),
  -- The receiver's memberships.questionnaire_updated_at when these ideas were generated
  -- (null = generated from an empty profile). Ideas are stale when the two differ.
  answers_updated_at timestamptz,
  -- The group budget the ideas were priced for. Ideas are stale when the organizer changes it.
  budget_min_cents   integer not null check (budget_min_cents >= 0),
  budget_max_cents   integer not null,
  -- Which model and prompt produced them (packages/core GIFT_MODEL, GIFT_PROMPT_VERSION).
  model              text not null check (char_length(model) between 1 and 100),
  prompt_version     text not null check (char_length(prompt_version) between 1 and 100),
  created_at         timestamptz not null default now(),
  constraint gift_suggestions_budget_range check (budget_max_cents >= budget_min_cents)
);

alter table public.gift_suggestions enable row level security;

-- Supabase grants new tables to anon and authenticated by default; start from nothing.
revoke all on public.gift_suggestions from public, anon, authenticated;
grant select on public.gift_suggestions to authenticated;
create policy gift_suggestions_santa_select on public.gift_suggestions for select to authenticated
  using (public.is_santa_of(receiver_id));

grant all on public.gift_suggestions to service_role;
