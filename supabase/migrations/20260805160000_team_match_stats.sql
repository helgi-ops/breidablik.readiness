-- Per-match TEAM stats from the Wyscout Team → Stats (General, "Show opponents")
-- Excel export. One row per team per match (own + opponent), keyed by
-- (team_id, match_date, is_opponent). Descriptive football context ONLY — it
-- never feeds the readiness colour / daily decision. Writes are service-role
-- only (ingestion runs server-side); reads are team-scoped for coach/staff/admin,
-- mirroring player_season_stats.

create table if not exists public.team_match_stats (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id),
  match_date      date not null,
  is_opponent     boolean not null default false,   -- false = own (Breiðablik) row, true = opponent row
  opponent_name   text,                              -- opponent label for the fixture (both rows share it)
  competition     text,
  scheme          text,
  goals           numeric,
  xg              numeric,
  shots           numeric,
  shots_on_target numeric,
  passes          numeric,
  passes_accurate numeric,
  possession_pct  numeric,
  losses          numeric,
  recoveries      numeric,
  duels           numeric,
  duels_won       numeric,
  source          text not null default 'wyscout_team_stats_xlsx',
  raw             jsonb,                             -- full parsed row, for columns we didn't model
  created_at      timestamptz not null default now(),
  unique (team_id, match_date, is_opponent)
);

create index if not exists team_match_stats_team_date_idx
  on public.team_match_stats (team_id, match_date);

alter table public.team_match_stats enable row level security;

-- Team-scoped read for coach/staff/admin (admin sees all) — identical shape to
-- player_season_stats_coach_read_team. No INSERT/UPDATE/DELETE policies: only the
-- service role (which bypasses RLS) may write.
create policy "team_match_stats_coach_read_team" on public.team_match_stats
for select using (
  exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and lower(coalesce(pr.role, '')) = any (array['coach', 'admin', 'staff'])
      and (
        lower(coalesce(pr.role, '')) = 'admin'
        or pr.team_id = team_match_stats.team_id
        or team_match_stats.team_id in (
          select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid()
        )
      )
  )
);
