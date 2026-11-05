-- Per-play narrative/description ("what it is / how it runs" — e.g. the coaching write-up for a Horns
-- Opposite Roll). Distinct from `coverage` (how WE guard it). Nullable; coach-authored, AI may draft.
alter table public.opponent_play_diagrams add column if not exists description text;
