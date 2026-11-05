-- Coach "our coverage" field on opponent set-play diagrams: how WE guard this set
-- (the Keflavík "their play calls / our coverage" column). Nullable; coach fills, AI may draft.
alter table public.opponent_play_diagrams add column if not exists coverage text;
