-- Per-session chaos tags for the Control-Chaos Continuum (ccc/chaos.ts).
--
-- The CCC volume bands measure HOW MUCH a rehab session was (% of own game); this
-- records WHERE on the control↔chaos axis each session sat. A session's chaos level
-- is auto-SUGGESTED from IMA change-of-direction density (a proxy), then CONFIRMED or
-- OVERRIDDEN by the physio — or set manually by clinical judgment when a session has
-- no GPS. One confirmed tag per (player, date). The proxy math lives in code; this
-- persists the physio's confirmed level + an audit of who/when.
--
-- Rules suggest, the clinician decides (manifesto #4/#6). Descriptive decision-support
-- only — never a diagnosis, never a clearance, never the readiness colour.
-- RLS mirrors rehab_track_progress (coach_team_ids() or is_staff()).

create table if not exists ccc_session_chaos_tags (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  session_date date not null,
  chaos_level text not null,            -- a CccPhaseKey (validated app-side via isCccPhaseKey)
  chaos_index_pct numeric,              -- the proxy % at tag time (provenance); null for a manual no-GPS tag
  source text,                          -- 'coach' (manual) or the GPS source that was confirmed
  note text,
  tagged_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, session_date)
);

create index if not exists ccc_session_chaos_tags_player_idx on ccc_session_chaos_tags (player_id, session_date desc);

alter table ccc_session_chaos_tags enable row level security;
drop policy if exists ccc_session_chaos_tags_rw on ccc_session_chaos_tags;
create policy ccc_session_chaos_tags_rw on ccc_session_chaos_tags for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());
