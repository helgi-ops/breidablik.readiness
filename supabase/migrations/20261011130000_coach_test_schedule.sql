-- Scheduled performance tests the coach pins to real dates (the "when to test" from the
-- Periodization Hub, made concrete). Edited from BOTH the Hub testing tab and Week Setup;
-- surfaced in Week Setup on the matching day. Descriptive planning — never a readiness/decision.
create table if not exists public.coach_test_schedule (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  test_key text not null check (test_key in ('aerobic','cmj','maxStrength','nordbord','sprint')),
  test_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, test_key, test_date)
);
create index if not exists idx_coach_test_schedule_team_date
  on public.coach_test_schedule (team_id, test_date);

-- All access goes through the coach-gated API (service role), which enforces team access.
-- RLS on with no client policy blocks direct client reads/writes.
alter table public.coach_test_schedule enable row level security;
