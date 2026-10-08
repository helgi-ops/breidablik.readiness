-- Per-day PITCH stimulus (mechanical/locomotive/mixed/technical) for the Week Setup
-- micro-cycle grid — a SEPARATE axis from the strength focus (no_match_intents).
-- Stored as a 7-element jsonb array (null per day = unset / match / off).
alter table public.coach_week_setup
  add column if not exists day_stimuli jsonb;

-- Extend save_week_setup to persist the per-day stimuli alongside the strength intents.
-- Drop the old 6-arg signature first so there's no ambiguous overload for PostgREST.
drop function if exists public.save_week_setup(uuid, date, text, jsonb, jsonb, text);

create or replace function public.save_week_setup(
  p_team_id uuid,
  p_week_start_date date,
  p_week_type text,
  p_matches jsonb,
  p_no_match_intents jsonb,
  p_season_phase text default null,
  p_day_stimuli jsonb default null
)
returns void
language plpgsql
as $function$
begin
  insert into public.coach_week_setup (
    team_id, week_start_date, week_type, matches, no_match_intents, season_phase, day_stimuli
  )
  values (
    p_team_id, p_week_start_date, p_week_type, p_matches, p_no_match_intents, p_season_phase, p_day_stimuli
  )
  on conflict (team_id, week_start_date)
  do update set
    week_type        = excluded.week_type,
    matches          = excluded.matches,
    no_match_intents = excluded.no_match_intents,
    season_phase     = excluded.season_phase,
    day_stimuli      = excluded.day_stimuli,
    updated_at       = now();
end;
$function$;
