-- Weeks without a match (2026-11-17): the coach's weekday plan for the strength send.
-- weekday ("mon".."sun") → "strength" | "power" | "light" | "rest". Empty = as before (every day reads as MD-3).
-- Read with the palette (playerContext/domains.ts fetchTeamPalette); sanitised in strengthProgramming/structures.ts.
alter table public.team_strength_palette
  add column if not exists no_match_week jsonb not null default '{}'::jsonb;

comment on column public.team_strength_palette.no_match_week is
  'Weeks without a match: weekday (mon..sun) -> strength | power | light | rest. Used by the individualised strength send only when no match is within 4 days back / 5 days ahead.';
