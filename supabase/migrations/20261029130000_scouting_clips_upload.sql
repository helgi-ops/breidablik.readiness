-- Short uploaded scouting clips (e.g. a single InStat possession download) — stored in a PRIVATE
-- bucket and played via short-lived signed URLs (opponent-player video → treat like minors' footage).
-- A clip is still evidence tied to player+action+timecode; this just lets a self-contained short file
-- stand in for a deep link. Descriptive scouting — never touches readiness.
alter table opponent_player_clips add column if not exists storage_path text;

insert into storage.buckets (id, name, public)
values ('scouting-clips', 'scouting-clips', false)
on conflict (id) do nothing;
