-- Two more "Contrast Training — 3×/viku" Plan Builder plans (training_plan_templates),
-- cloned from the trainer's existing plan with a slightly different lower-body
-- exercise selection. Same contrast structure, sessions, weeks, owner & team.
--   v2 → Trap Bar Deadlift→Back Squat, Box Step up→Walking Lunge
--   v3 → Trap Bar Deadlift→Front Squat, B. Split Squat→Reverse Lunge
INSERT INTO training_plan_templates
  (id, team_id, created_by, name, plan_type, duration_weeks, sessions_per_week, readiness_enabled,
   deload_volume_pct, deload_intensity_pct, recovery_volume_pct, recovery_intensity_pct, structure, notes, created_at, updated_at)
SELECT gen_random_uuid(), team_id, created_by, 'Contrast Training v2 — 3×/viku', plan_type, duration_weeks, sessions_per_week, readiness_enabled,
   deload_volume_pct, deload_intensity_pct, recovery_volume_pct, recovery_intensity_pct,
   replace(replace(replace(replace(structure::text,
      'a0348938-ab5d-4100-a461-a8fa2f49770d', '13279bd4-d1f5-4df8-ac2d-422d21677d96'),
      'Trap Bar Deadlift', 'Back Squat'),
      '453f0f6b-ab72-4b84-bd87-4e550dc8b159', '107565cc-a246-4d61-89f8-032327312345'),
      'Box Step up', 'Walking Lunge')::jsonb,
   notes, now(), now()
FROM training_plan_templates WHERE id = 'ac986f56-bf24-4df3-ab73-145ee07edef6';

INSERT INTO training_plan_templates
  (id, team_id, created_by, name, plan_type, duration_weeks, sessions_per_week, readiness_enabled,
   deload_volume_pct, deload_intensity_pct, recovery_volume_pct, recovery_intensity_pct, structure, notes, created_at, updated_at)
SELECT gen_random_uuid(), team_id, created_by, 'Contrast Training v3 — 3×/viku', plan_type, duration_weeks, sessions_per_week, readiness_enabled,
   deload_volume_pct, deload_intensity_pct, recovery_volume_pct, recovery_intensity_pct,
   replace(replace(replace(replace(structure::text,
      'a0348938-ab5d-4100-a461-a8fa2f49770d', '5087137e-c2b2-42b9-8cc7-703761d035cf'),
      'Trap Bar Deadlift', 'Front Squat'),
      '3d08c2dd-8a8d-4830-b81b-cac1d2742035', '93392e9f-9d41-4083-bccf-bb302d8c513a'),
      'B. Split Squat', 'Reverse Lunge')::jsonb,
   notes, now(), now()
FROM training_plan_templates WHERE id = 'ac986f56-bf24-4df3-ab73-145ee07edef6';
