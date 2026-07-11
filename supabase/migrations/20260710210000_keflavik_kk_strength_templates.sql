-- Keflavík men's football — strength programme → custom microdose templates
--
-- Loads the club's Workout A / Workout B / Recovery into the custom-template
-- system, mapped to MD days, in the team's own dynamic table
-- `keflavik_football_karlar_microdose_templates` (one table per team — the model
-- the coach asked for). Team-level (player_id NULL).
--
--   Workout A  → MD-4   (strength & power, contrast pairs)
--   Workout B  → MD-2   (strength & power, contrast pairs)
--   Recovery   → MD+1   (post-match; intended for 60+ min players — minute-gating
--                        is wired separately on the player-Today path, not here)
--
-- Readiness: one base structure is written to GREEN / GREEN_PLUS / YELLOW / RED
-- rows (identical content) so the resolver always finds a match for any player;
-- the actual yellow/red scaling is applied at render by computeTodayAdjust
-- (matches every other microdose team — hand-scaling here would double-reduce).
--
-- Reps notation: "rounds×reps"; "(weighted)" = coach sets the load ("@" in the
-- source sheet). Rounds/rest live in the block title, items are pure exercises.
--
-- Idempotent: exercise inserts are guarded by NOT EXISTS; the RPCs upsert.

-- Keflavík men's football = 51be1656-bb56-4702-a8f4-26c314b3c861

-- ── 1) Missing exercises → exercise_library (Keflavík-scoped, bilingual) ──────
--     9 of the 21 already exist globally (Broad Jump, Box Jump, Trap Bar
--     Deadlift, Plyo Push-Up, Seated Hamstring Curl, Pallof Press, Assisted
--     Split Squat Jump, RFESS, Med Ball Slam). These 12 are new.
insert into public.exercise_library
  (name, name_is, exercise_type, category, sport, movement_family, movement_pattern, is_bilateral, owner_team_id)
select v.name, v.name_is, 'strength', v.category, 'football', v.movement_family, v.movement_pattern, v.is_bilateral,
       '51be1656-bb56-4702-a8f4-26c314b3c861'::uuid
from (values
  ('DB Bench Press',            'Handlóðabekkpressa',            'compound',    'push', 'horizontal_push', true),
  ('Alternate Lunge',          'Skiptiútfall',                  'compound',    'squat','knee_dominant',   false),
  ('Single-Arm DB Row',        'Einhendis handlóðaróður',       'compound',    'pull', 'horizontal_pull', false),
  ('Bodysaw Plank',            'Söguplanki',                    'core',        'core', 'anti_extension',  true),
  ('One-Arm DB Press Snatch',  'Einhendis handlóða snörun',     'olympic_lift','pull', 'hip_hinge',       false),
  ('Pull-Up',                  'Upptog',                        'compound',    'pull', 'vertical_pull',   true),
  ('Single-Arm DB Bench Press','Einhendis handlóðabekkpressa',  'compound',    'push', 'horizontal_push', false),
  ('Step-Up with Knee Drive',  'Uppstig með hnélyftu',          'compound',    'squat','knee_dominant',   false),
  ('Single-Leg Deadlift',      'Einfætt marklyft',              'compound',    'hinge','hip_hinge',       false),
  ('Weighted V-Up',            'V-kviðæfing með lóð',            'core',        'core', null,              true),
  ('Med Ball Rotational Slam', 'Snúnings boltakast',            'core',        'core', 'rotational_diagonal', false),
  ('Push-Up',                  'Armbeygja',                     'compound',    'push', 'horizontal_push', true)
) as v(name, name_is, category, movement_family, movement_pattern, is_bilateral)
where not exists (
  select 1 from public.exercise_library e where lower(e.name) = lower(v.name)
);

-- ── 2) Create the team's dynamic microdose table ─────────────────────────────
select public.create_custom_microdose_table('keflavik_football_karlar_microdose_templates');

-- ── 3) Write the workout records (3 md_days × 4 readiness levels) ─────────────
with levels(rl) as (values ('GREEN'),('GREEN_PLUS'),('YELLOW'),('RED')),
base(md_day, title, description, structure) as (
  values
  ('MD-4', 'Workout A — Strength & Power',
   'Keflavík men''s football — MD-4 strength & power (contrast pairs). "(weighted)" = coach sets the load.',
   $json$[
     {"block":"CNS · Power Primer · 2–3 rounds · rest 1:30–2 min/round","items":["Broad jump 3×3"]},
     {"block":"A · Strength & Power (contrast) · 1–3 rounds · 0–10 s between lifts · 2–3 min/round","items":["Trap bar deadlift 3×5 (weighted)","Box jump 3×3"]},
     {"block":"B · Strength & Power (contrast) · 1–3 rounds · 0–10 s between lifts · 1–2 min/round","items":["DB bench press 3×5 (weighted)","Plyo push ups 3×3"]},
     {"block":"C · Strength · 1–3 rounds · rest 60–90 s/round","items":["Alternate lunge 3×3 (weighted)","Single-arm DB row 3×5 (weighted)","Hamstring curl 3×6"]},
     {"block":"D · Core · 1–3 rounds · rest 60–90 s/round","items":["Bodysaw plank 3×10","Pallof press 3×5 (weighted)"]}
   ]$json$::jsonb),
  ('MD-2', 'Workout B — Strength & Power',
   'Keflavík men''s football — MD-2 strength & power (contrast pairs). "(weighted)" = coach sets the load.',
   $json$[
     {"block":"CNS · Power Primer · 2–3 rounds · rest 1–2 min/round","items":["One-arm DB press snatch 3×2 (weighted)","Assisted split squat jump 3×2 (weighted)"]},
     {"block":"A · Strength & Power (contrast) · 1–3 rounds · 0–10 s between lifts · 1–2 min/round","items":["RFESS 3×3 (weighted)","Med ball slam 3×3"]},
     {"block":"B · Strength & Power (contrast) · 1–3 rounds · 0–10 s between lifts · 60–90 s/round","items":["Pull ups 3×5","Single-arm DB bench press 3×5 (weighted)"]},
     {"block":"C · Strength · 1–3 rounds · 0–10 s between lifts · 60–90 s/round","items":["Step-ups with knee drive 3×3 (weighted)","SL deadlift 3×3 (weighted)"]},
     {"block":"D · Core · 1–3 rounds · 0–10 s between lifts · 60–90 s/round","items":["Weighted V-ups 3×10","Med ball rotational slam 3×5 (weighted)"]}
   ]$json$::jsonb),
  ('MD+1', 'Recovery Workout',
   'Keflavík men''s football — MD+1 post-match recovery. Intended only for players with 60+ match minutes (minute-gating applied separately on the player-Today path).',
   $json$[
     {"block":"A · Aerobic flush · 1 round","items":["Cardio (bike/run/treadmill/swim) 5–10 min @ 70–80% HRmax"]},
     {"block":"B · Eccentric strength · 3 rounds","items":["Trap bar deadlift 3×3 (weighted) — drop from top position, 80–90% of max"]},
     {"block":"C · Push · 1 round","items":["Push ups AMRAP"]},
     {"block":"D · Pull · 1 round","items":["Pull ups AMRAP"]},
     {"block":"E · Cool-down · 1 round","items":["Cardio 3–5 min @ 20–30% HRmax","Stretch","Foam roll / massage"]}
   ]$json$::jsonb)
),
recs(arr) as (
  select jsonb_agg(jsonb_build_object(
    'md_day', b.md_day,
    'readiness_level', l.rl,
    'title', b.title,
    'description', b.description,
    'structure', b.structure,
    'variant', 'A'
  ))
  from base b cross join levels l
)
select public.save_custom_template_records(
  'keflavik_football_karlar_microdose_templates',
  '51be1656-bb56-4702-a8f4-26c314b3c861'::uuid,
  (select arr from recs),
  'inseason'
);

-- ── 4) Metadata row (one set for the whole team table) ───────────────────────
insert into public.custom_template_sets
  (team_id, set_name, sport, gender, season_phase, table_name, md_days, player_id, parent_table_name, start_date, end_date, note)
values
  -- set_name MUST be the bare club name so the builder's buildTableName(setName,
  -- sport, gender) regenerates exactly this table_name on coach self-service —
  -- matches Breiðablik ("Breiðablik") + HK ("HK"). A longer name would fork the
  -- slug into a different table.
  ('51be1656-bb56-4702-a8f4-26c314b3c861'::uuid,
   'Keflavík', 'football', 'M', 'inseason',
   'keflavik_football_karlar_microdose_templates',
   ARRAY['MD-4','MD-2','MD+1'], null, null, null, null,
   'Workout A→MD-4, Workout B→MD-2, Recovery→MD+1 (60+ min).')
on conflict (team_id, table_name, season_phase) do update
  set md_days = excluded.md_days,
      set_name = excluded.set_name,
      gender   = excluded.gender,
      note     = excluded.note;
