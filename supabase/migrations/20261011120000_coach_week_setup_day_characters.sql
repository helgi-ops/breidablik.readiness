-- A per-day FIELD CHARACTER axis (Mechanical/Locomotive/Mixed/Technical/Activation/Top-up/
-- Recovery/Off) — the SAME vocabulary the Meso uses. It is stored independently of the strength
-- focus (no_match_intents) so a day like Activation or Top-up can carry BOTH a character and a
-- strength dose. Week-Setup display + round-trip only; player delivery still reads no_match_intents.
alter table public.coach_week_setup
  add column if not exists day_characters jsonb;

create or replace function public.save_week_setup(
  p_team_id uuid,
  p_week_start_date date,
  p_week_type text,
  p_matches jsonb,
  p_no_match_intents jsonb,
  p_season_phase text default null::text,
  p_day_stimuli jsonb default null::jsonb,
  p_day_characters jsonb default null::jsonb
)
 returns void
 language plpgsql
as $function$
begin
  insert into public.coach_week_setup (
    team_id, week_start_date, week_type, matches, no_match_intents, season_phase, day_stimuli, day_characters
  )
  values (
    p_team_id, p_week_start_date, p_week_type, p_matches, p_no_match_intents, p_season_phase, p_day_stimuli, p_day_characters
  )
  on conflict (team_id, week_start_date)
  do update set
    week_type        = excluded.week_type,
    matches          = excluded.matches,
    no_match_intents = excluded.no_match_intents,
    season_phase     = excluded.season_phase,
    day_stimuli      = excluded.day_stimuli,
    day_characters   = excluded.day_characters,
    updated_at       = now();
end;
$function$;
