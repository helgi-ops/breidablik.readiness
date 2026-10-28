-- Opponent player scouting clips: a clip is EVIDENCE tied to a player + action + timecode, a deep
-- link into the club's own game feed (official API or coach-tagged) — never downloaded/re-hosted
-- video, never any CV/play-recognition. Descriptive scouting; never touches readiness.
create table if not exists opponent_player_clips (
  id            uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references teams(id) on delete cascade,
  opponent_key  text not null,              -- foldName(opponent), as the scout route keys it
  player_name   text not null,              -- matches the scouting player row
  action        text not null,              -- '3pt_make' | '3pt_miss' | 'drive' | 'post_up' | 'oreb_putback' | 'assist' | 'turnover' | 'other'
  made          boolean,                    -- for shot actions
  court_x       numeric, court_y numeric,   -- optional shot location (0-100), for the shot chart
  period        text, clock text,           -- "Q1", "05:27" (display)
  video_url     text,                       -- deep link into the game feed at the timecode
  source        text not null default 'api',-- 'api' | 'coach'
  created_at    timestamptz not null default now()
);
create index if not exists opp_player_clips_key on opponent_player_clips(owner_team_id, opponent_key, player_name);
