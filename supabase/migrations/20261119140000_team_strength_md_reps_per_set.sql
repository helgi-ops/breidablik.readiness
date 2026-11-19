-- 2026-11-19 — Reps a set per heavy MD day (the week rule, strengthProgramming/weekRule.ts).
--
-- The week rule fixes the day's heavy lower-body reps (MD-5 / MD-4 / MD-3). This column holds the coach's choice of
-- how many reps a set holds on each of those days (1–5), so 12 reps are 6 x 2 or 3 x 4. Unset = the method's own reps.
-- Shape: { "MD-4": 2, "MD-3": 3 }. Read by fetchTeamPalette, written by /api/coach/team/strength-palette (service
-- role, coach-authenticated). Additive, no backfill: an empty object keeps every team as it is.

alter table public.team_strength_palette
  add column if not exists md_reps_per_set jsonb not null default '{}'::jsonb;

comment on column public.team_strength_palette.md_reps_per_set is
  'Coach choice of reps a set for the heavy lift per heavy MD day (MD-5/MD-4/MD-3 -> 1..5). Empty = the method''s own. Week rule, 2026-11-19.';
