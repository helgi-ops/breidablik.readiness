-- An own-team StatsBomb Team Stats profile (season aggregate + League Average) can be
-- stored in scout_team_season with is_self=true, so the Team Season Report can read the
-- team-vs-league benchmark WITHOUT the row appearing in the opponent-scouting list.
alter table scout_team_season add column if not exists is_self boolean not null default false;
