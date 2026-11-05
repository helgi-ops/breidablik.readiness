-- Multi-phase set plays: a play can be a sequence of diagrams (phase A/B/C...), e.g. a Horns set
-- that flows through three looks. `diagram` stays = phase 1 (backward compat for all existing readers);
-- `phases` holds the full ordered sequence (PlayDiagram[]). Nullable → single-phase plays keep working.
alter table public.opponent_play_diagrams add column if not exists phases jsonb;
