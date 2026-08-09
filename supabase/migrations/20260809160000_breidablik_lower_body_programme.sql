-- Breiðablik men's football — "Lower body program" → custom microdose templates
--
-- Loads a coach-supplied single-session lower-body strength/power programme into the
-- Programme Library as its OWN set (distinct table, so it lists separately and the
-- builder's buildTableName("Lower body program","football","M") regenerates the same
-- slug on self-service edit). Team-level (player_id NULL). Mapped to MD-4 (heavy
-- lower body, furthest from the match); the coach can re-map in the builder.
--
-- One base structure written to GREEN / GREEN_PLUS / YELLOW / RED (identical content);
-- the actual yellow/red scaling is applied at render by computeTodayAdjust — matches
-- every other microdose team (hand-scaling here would double-reduce). Exercise lines
-- are kept close to the coach's source (sets×reps in digits + unit words). Idempotent
-- via the RPC upserts. Source: "Lower body program.xlsx".
--
-- Breiðablik men's football = 94b52a06-0b83-48da-8664-639ec3486a0c

-- ── 1) Create the set's dynamic microdose table ──────────────────────────────
select public.create_custom_microdose_table('lower_body_program_football_karlar_microdose_templates');

-- ── 2) Write the workout records (1 md_day × 4 readiness levels) ──────────────
with levels(rl) as (values ('GREEN'),('GREEN_PLUS'),('YELLOW'),('RED')),
base(md_day, title, description, structure) as (
  values
  ('MD-4', 'Lower Body — Strength & Power',
   'Coach-supplied lower-body strength/power session. "iso" = held isometric; "each leg / each side" = per side. Load set by the coach.',
   $json$[
     {"block":"A · Strength & Power","items":["Trap bar deadlift — 2 sets x 3-5 reps + 1 iso","Drop jumps — 2-3 sets x 3-5 reps"]},
     {"block":"B · Unilateral","items":["Box step up eda Bulgarian split squat — 1-2 sets x 5 reps each leg","Single leg RDL + iso hamstring — 1 set x 5 reps each leg + 1 iso"]},
     {"block":"C · Accessory & Core","items":["Copenhagen adductor — 1 set x 6-8 reps each leg","Pallof press — 1 set x 8-10 reps each side"]}
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
  'lower_body_program_football_karlar_microdose_templates',
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid,
  (select arr from recs),
  'inseason'
);

-- ── 3) Metadata row (one set for the whole table) ────────────────────────────
insert into public.custom_template_sets
  (team_id, set_name, sport, gender, season_phase, table_name, md_days, player_id, parent_table_name, start_date, end_date, note)
values
  ('94b52a06-0b83-48da-8664-639ec3486a0c'::uuid,
   'Lower body program', 'football', 'M', 'inseason',
   'lower_body_program_football_karlar_microdose_templates',
   ARRAY['MD-4'], null, null, null, null,
   'Coach-supplied single-session lower-body strength/power programme (imported from Lower body program.xlsx). Mapped to MD-4; re-map in the builder if needed.')
on conflict (team_id, table_name, season_phase) do update
  set md_days  = excluded.md_days,
      set_name = excluded.set_name,
      gender   = excluded.gender,
      note     = excluded.note;
