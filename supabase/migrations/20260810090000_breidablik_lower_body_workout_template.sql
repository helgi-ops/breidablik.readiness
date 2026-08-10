-- Breiðablik — "Lower body program" into the /coach/templates library (workout_templates).
--
-- The coach's "Programme Library" is /coach/templates (workout_templates: global + a
-- Pro/Elite team's own custom templates), NOT the custom-templates microdose builder.
-- Breiðablik is ELITE, so a team-scoped row shows there. Team-scoped (team_id set), so
-- only Breiðablik sees it. Structure matches TemplateBlockBuilder's shape
-- ({ blocks:[{ type, title, exercises:[{ name, sets, reps, note }] }] }). Descriptive
-- programme content — never touches the readiness colour. Source: "Lower body program.xlsx".
-- Idempotent on (team_id, code). Applied via mcp apply_migration; committed per repo rule.

insert into public.workout_templates
  (team_id, code, title, description, structure, is_active, category, intensity_level, md_relevance)
select
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid,
  'BREID-LOWER-1',
  'Lower body program',
  'Coach-supplied lower-body strength/power session (imported from Lower body program.xlsx). "iso" = held isometric; "each leg / each side" = per side. Load set by the coach.',
  $json${
    "blocks": [
      {"type":"strength","title":"A · Strength & Power","exercises":[
        {"name":"Trap bar deadlift","sets":2,"reps":"3-5","note":"+ 1 iso hold"},
        {"name":"Drop jumps","sets":"2-3","reps":"3-5"}
      ]},
      {"type":"strength","title":"B · Unilateral","exercises":[
        {"name":"Box step up eða Bulgarian split squat","sets":"1-2","reps":"5 each leg"},
        {"name":"Single leg RDL + iso hamstring","sets":1,"reps":"5 each leg","note":"+ 1 iso hold"}
      ]},
      {"type":"core","title":"C · Accessory & Core","exercises":[
        {"name":"Copenhagen adductor","sets":1,"reps":"6-8 each leg"},
        {"name":"Pallof press","sets":1,"reps":"8-10 each side"}
      ]}
    ],
    "category":"STRENGTH",
    "duration_min":40
  }$json$::jsonb,
  true, 'strength', 'high', 'none'
where not exists (
  select 1 from public.workout_templates
  where team_id = '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid and code = 'BREID-LOWER-1'
);
