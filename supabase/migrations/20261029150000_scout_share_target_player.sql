-- Per-player targeting for a scouting share: null = the whole team (default), else only that player
-- sees it (individual scouting notes, or a test send to one player). Informational — never readiness.
alter table opponent_scout_shares add column if not exists target_player_id uuid references players(id) on delete cascade;
