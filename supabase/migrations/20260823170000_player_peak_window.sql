-- Catapult CTR / period export -> per-(player, match, window) peak feed.
-- The CTR (session-summary) export is time-based and carries the high-speed data (HIR Dist,
-- Vel B5/B6) plus each period's start time -- so it supplies BOTH things the contextualised
-- peak-period flagship needs: peak-HSR (Ju 2022 Table-2 score) and the window clock position
-- (event-time alignment). Descriptive load context only -- never touches the readiness colour,
-- the load target, or the daily decision.

create table if not exists player_peak_window (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  match_date date not null,
  source text not null default 'catapult_ctr',
  window_label text not null,            -- period name (peak-1min / peak-3min / coaching period)
  window_min numeric,                    -- 1/3/5 for a peak window; null for a coaching period
  window_start text,                     -- raw period start clock from the CTR (alignment key)
  window_seconds numeric,                -- period duration
  hsr_m numeric,                         -- HIR Dist (peak-HSR, m) at the account threshold
  vb5_m numeric,                         -- Vel B5 Avg Dist (m)
  vb6_m numeric,                         -- Vel B6 Avg Dist (m)
  max_kmh numeric,                       -- Max Vel (km/h)
  player_load numeric,                   -- Avg PL
  distance_m numeric,                    -- Avg Dist (m)
  hsr_threshold_kmh numeric,             -- provenance: high-speed threshold behind HIR Dist
  export_date date,                      -- provenance: when the CTR was exported
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, match_date, source, window_label)
);

create index if not exists player_peak_window_player_date_idx on player_peak_window (player_id, match_date desc);
create index if not exists player_peak_window_team_date_idx on player_peak_window (team_id, match_date desc);

alter table player_peak_window enable row level security;

-- Reads scoped to the owning team (coach/admin/staff of that team); writes service-role only.
drop policy if exists player_peak_window_read on player_peak_window;
create policy player_peak_window_read on player_peak_window for select using (
  team_id in (
    select p.team_id from profiles p where p.id = auth.uid()
    union
    select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()
  )
);
