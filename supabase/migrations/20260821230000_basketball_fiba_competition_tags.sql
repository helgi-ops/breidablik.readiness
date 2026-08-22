-- Tag stored FIBA games with their competition/season/stage so the league-level
-- "win factors" read knows which games form a league-season. Plus a record of the
-- resolved contiguous gameid block per competition-season so re-ingests are one call.
-- Descriptive analytics only -- never touches the readiness colour or daily decision.
alter table basketball_fiba_games add column if not exists competition_code text;
alter table basketball_fiba_games add column if not exists season text;
alter table basketball_fiba_games add column if not exists stage text;
create index if not exists basketball_fiba_games_comp_idx on basketball_fiba_games (owner_team_id, competition_code, season, stage);

create table if not exists basketball_fiba_ingest_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references teams(id) on delete cascade,
  competition_code text not null,
  season text not null,
  stage text not null default 'regular',
  gameid_start bigint not null,
  gameid_end bigint not null,
  games_ingested int not null default 0,
  computed_at timestamptz not null default now(),
  unique (owner_team_id, competition_code, season, stage)
);

alter table basketball_fiba_ingest_blocks enable row level security;
drop policy if exists fiba_blocks_read on basketball_fiba_ingest_blocks;
create policy fiba_blocks_read on basketball_fiba_ingest_blocks for select using (
  owner_team_id in (
    select p.team_id from profiles p where p.id = auth.uid()
    union
    select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()
  )
);
