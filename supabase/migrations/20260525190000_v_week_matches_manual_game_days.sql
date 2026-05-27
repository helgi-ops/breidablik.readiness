-- ─────────────────────────────────────────────────────────────────────────
-- v_week_matches — also recognise GAME days set via manual-week day intents
--
-- v_week_matches previously derived a week's matches purely from the
-- coach_week_setup.matches jsonb — i.e. the explicit match-date input fields.
-- Manual weeks (Preseason / Manual override) never populate that jsonb: the
-- coach marks the match by picking the GAME intent for a day, which is stored
-- only in week_plans (day_type = 'GAME').
--
-- Consequence: the MD-day pipeline (v_week_matches → v_training_day_context →
-- md_day) saw no match for a manual week and resolved every day to 'OTHER'.
-- MD-aware features (Planned Session Load card, the header MD badge) then went
-- blank even on a manual week that genuinely had a game scheduled.
--
-- This redefinition keeps branch (1) — jsonb match inputs, which carry kickoff
-- time / home-away — and adds branch (2): GAME days from week_plans, for dates
-- not already covered by branch (1). Auto weeks are unchanged (branch 1 covers
-- them; branch 2's NOT EXISTS excludes their week_plans GAME rows). Manual
-- weeks now resolve their MD-days correctly.
-- ─────────────────────────────────────────────────────────────────────────

create or replace view public.v_week_matches as
-- (1) Matches entered in the explicit match-date fields (auto / match weeks).
select cws.id              as week_setup_id,
       cws.week_start_date,
       cws.week_type,
       m.value ->> 'match_id'                       as match_id,
       nullif(m.value ->> 'date', '')::date         as match_date,
       nullif(m.value ->> 'kickoff_time', '')       as kickoff_time,
       nullif(m.value ->> 'home_away', '')          as home_away
  from coach_week_setup cws
  cross join lateral jsonb_array_elements(coalesce(cws.matches, '[]'::jsonb)) m(value)
 where nullif(m.value ->> 'date', '') is not null
union
-- (2) GAME days marked as manual-week day intents — stored in week_plans.
select cws.id              as week_setup_id,
       cws.week_start_date,
       cws.week_type,
       'wp:' || wp.day_date::text   as match_id,
       wp.day_date                  as match_date,
       null::text                   as kickoff_time,
       null::text                   as home_away
  from coach_week_setup cws
  join week_plans wp
    on wp.team_id    = cws.team_id
   and wp.week_start = cws.week_start_date
 where upper(coalesce(wp.day_type, '')) = 'GAME'
   and not exists (
     select 1
       from jsonb_array_elements(coalesce(cws.matches, '[]'::jsonb)) m(value)
      where nullif(m.value ->> 'date', '')::date = wp.day_date
   );
