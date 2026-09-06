-- Movement-screen framework (Stage 1). An extensible test registry + a
-- consent/access-gated screen store. Screening/training only — never a
-- diagnosis, never the readiness colour.

-- Test registry. Built-in tests are hydrated from typed code seeds by slug;
-- a custom test is added as a data row whose `definition` jsonb carries its full
-- config + rules (no pipeline change).
create table if not exists movement_tests (
  slug text primary key,
  name jsonb not null,
  category text not null,
  active boolean not null default true,
  team_id uuid references teams(id) on delete cascade,   -- null = global library
  definition jsonb,                                      -- full MovementTest for custom tests; null = built-in (code seed)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into movement_tests (slug, name, category) values
  ('single_leg_drop_jump', '{"en":"Single-leg drop jump (hands overhead)","is":"Einfætt fallstökk (hendur yfir höfði)"}'::jsonb, 'landing'),
  ('overhead_squat_assessment', '{"en":"Overhead squat assessment","is":"Yfirhöfuð-hnébeygju mat"}'::jsonb, 'mobility_screen'),
  ('hop_for_distance', '{"en":"Single-leg hop for distance","is":"Einfætt lengdarhopp"}'::jsonb, 'hop')
on conflict (slug) do nothing;

alter table movement_tests enable row level security;
drop policy if exists movement_tests_ro on movement_tests;
create policy movement_tests_ro on movement_tests for select
  using (team_id is null or team_id in (select coach_team_ids()) or is_staff());

-- Screen store (mirrors clinical_reports gating: team-scoped, service-role +
-- signed URLs for any uploaded video; nullable player_id for upload-before-link).
create table if not exists movement_screens (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  player_name_raw text,
  test_slug text not null references movement_tests(slug),
  screen_date date not null,
  file_path text,           -- storage path (private bucket) when a video is uploaded
  file_name text,
  video_url text,           -- external (Onform) link when not uploaded
  angles_json jsonb,        -- exported angles (Onform) when provided
  findings jsonb not null default '[]'::jsonb,   -- ScreenFinding[]
  context jsonb not null default '{}'::jsonb,    -- ScreenContext
  result jsonb,             -- cached ScreenResult (interpreted readings)
  confidence text,          -- high|moderate|low (denormalised for listing)
  red_flag boolean not null default false,
  rtp_flag boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists movement_screens_team_idx on movement_screens (team_id);
create index if not exists movement_screens_player_idx on movement_screens (player_id);

alter table movement_screens enable row level security;
drop policy if exists movement_screens_rw on movement_screens;
create policy movement_screens_rw on movement_screens for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

-- Private bucket for uploaded screen videos (reached only via service-role +
-- signed URLs, like clinical-reports).
insert into storage.buckets (id, name, public)
  values ('movement-screen-videos', 'movement-screen-videos', false)
  on conflict (id) do nothing;
