-- Daily cap counter for gift idea generation (docs/TASKS.md G3; docs/GIFT-IDEAS.md "When to regenerate").
--
-- One row per attempt to call the model, including failures. It holds only a time and an
-- outcome: no member, group, answers or ideas, so it cannot say who has whom.
-- Server only: RLS is on with no policy, and clients have no grants.

create table public.gift_generation_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ok         boolean not null
);
create index gift_generation_log_created_at_idx on public.gift_generation_log (created_at);

alter table public.gift_generation_log enable row level security;
revoke all on public.gift_generation_log from public, anon, authenticated;
grant all on public.gift_generation_log to service_role;
