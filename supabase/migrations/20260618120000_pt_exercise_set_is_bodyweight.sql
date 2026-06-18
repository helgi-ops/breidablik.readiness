-- Bodyweight (BW) sets for the PT strength log.
-- When an exercise is performed without external load (push-ups, pull-ups,
-- dips, nordic, etc.) the athlete marks the set as BW instead of typing a
-- weight. Volume-load substitutes the athlete's latest logged body weight so
-- the set counts toward tonnage / ACWR instead of contributing 0.
alter table pt_exercise_set_logs
  add column if not exists is_bodyweight boolean not null default false;

comment on column pt_exercise_set_logs.is_bodyweight is
  'Set performed at bodyweight (no external load). weight_kg is null for these; volume-load uses the athlete''s logged body weight × reps.';
