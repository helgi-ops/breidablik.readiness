-- Triphasic Strength (Cal Dietz, adapted for youth/intermediate athletes).
-- 9-week block model: Phase 1 Eccentric (slow lowering, wk 1-3) → Phase 2
-- Isometric (paused holds, wk 4-6) → Phase 3 Reactive (explosive + jump
-- contrast, wk 7-9). Builds power through tempo and position rather than
-- max-CNS complexes, so it suits younger / less-experienced clients — filling
-- the gap between Preparatory and the advanced Contrast/French-Contrast methods.
--
-- Seeded into training_plan_templates (Helgi PT team) so it shows in the goal
-- recommender and assigns like the Contrast family.
do $MIG$
declare
  km jsonb := $KM${
    "back_squat":"13279bd4-d1f5-4df8-ac2d-422d21677d96",
    "bench":"dacd6f95-7bf2-49c0-8d4f-a4a7f92e2795",
    "box_jump":"eff81a40-43d7-4881-9fa1-52baa8ce42bc",
    "broad_jump":"ee5dfcbe-d028-42f8-ba25-9f330d8f83d4",
    "bul_split":"3d08c2dd-8a8d-4830-b81b-cac1d2742035",
    "front_squat":"5087137e-c2b2-42b9-8cc7-703761d035cf",
    "hip_thrust":"39a023dd-e535-4f8c-8622-456cdda06ed0",
    "inverted_row":"c8b60f11-60aa-4619-9099-7dea1f2fae7a",
    "ohp":"5c5d3f4d-c037-4959-8feb-8ecad1afa7cb",
    "pallof":"e8088efe-5f14-4578-bba5-6c3ac300c5da",
    "plank":"de013fbe-64f4-4ccb-a308-fa9fb58ab135",
    "plyo_pushup":"3dc4eaa8-bfcd-4d0a-ab66-ea2350f02e36",
    "pull_up":"e011b2e4-2c4c-402e-8504-6cee9931dc4f",
    "rdl":"0cfbd9c6-0305-47f9-9f68-1aa8cd137207",
    "side_plank":"d17620aa-2bfa-4ed6-8953-f3b0d8a50919",
    "squat_jump":"04bac621-d844-4569-a5a1-e8f540417a24",
    "trap_bar_dl":"a0348938-ab5d-4100-a461-a8fa2f49770d"
  }$KM$::jsonb;
  phases jsonb := $SPEC$[
    {"phase_name":"Eccentric","method":"straight","sessions":[
      {"name":"Lower","day":1,"groups":[
        [{"ex":"back_squat","reps":"4","sets":4,"pct":75,"tempo":"6s eccentric (slow down)","rest":150,"rpe":7}],
        [{"ex":"rdl","reps":"6","sets":3,"pct":70,"tempo":"5s eccentric","rest":120,"rpe":7}],
        [{"ex":"bul_split","reps":"6/side","sets":3,"bw":true,"tempo":"4s eccentric","rest":90,"rpe":7,"note":"DB optional"}],
        [{"ex":"side_plank","reps":"30s/side","sets":3,"bw":true,"rest":45},{"ex":"pallof","reps":"10/side","sets":3,"bw":true,"rest":45}]]},
      {"name":"Upper","day":3,"groups":[
        [{"ex":"bench","reps":"4","sets":4,"pct":75,"tempo":"6s eccentric","rest":150,"rpe":7}],
        [{"ex":"pull_up","reps":"5","sets":3,"bw":true,"tempo":"4s eccentric","rest":120,"rpe":8}],
        [{"ex":"ohp","reps":"6","sets":3,"pct":70,"tempo":"5s eccentric","rest":120,"rpe":7}],
        [{"ex":"inverted_row","reps":"10","sets":3,"bw":true,"rest":60},{"ex":"plank","reps":"40s","sets":3,"bw":true,"rest":45}]]},
      {"name":"Full body","day":5,"groups":[
        [{"ex":"trap_bar_dl","reps":"4","sets":4,"pct":75,"tempo":"5s eccentric","rest":150,"rpe":7}],
        [{"ex":"front_squat","reps":"5","sets":3,"pct":70,"tempo":"5s eccentric","rest":120,"rpe":7}],
        [{"ex":"hip_thrust","reps":"8","sets":3,"pct":65,"tempo":"4s eccentric","rest":90,"rpe":7}],
        [{"ex":"side_plank","reps":"30s/side","sets":3,"bw":true,"rest":45},{"ex":"pallof","reps":"10/side","sets":3,"bw":true,"rest":45}]]}
    ]},
    {"phase_name":"Isometric","method":"straight","sessions":[
      {"name":"Lower","day":1,"groups":[
        [{"ex":"back_squat","reps":"3","sets":4,"pct":80,"tempo":"3s isometric pause at bottom","rest":180,"rpe":8}],
        [{"ex":"rdl","reps":"5","sets":3,"pct":75,"tempo":"2s pause at stretch","rest":120,"rpe":7}],
        [{"ex":"bul_split","reps":"5/side","sets":3,"bw":true,"tempo":"2s pause at bottom","rest":90,"rpe":7,"note":"DB optional"}],
        [{"ex":"side_plank","reps":"30s/side","sets":3,"bw":true,"rest":45},{"ex":"pallof","reps":"10/side","sets":3,"bw":true,"rest":45}]]},
      {"name":"Upper","day":3,"groups":[
        [{"ex":"bench","reps":"3","sets":4,"pct":80,"tempo":"3s pause on chest","rest":180,"rpe":8}],
        [{"ex":"pull_up","reps":"4","sets":3,"bw":true,"tempo":"2s pause at top","rest":120,"rpe":8}],
        [{"ex":"ohp","reps":"5","sets":3,"pct":75,"tempo":"2s pause at shoulders","rest":120,"rpe":7}],
        [{"ex":"inverted_row","reps":"8","sets":3,"bw":true,"tempo":"2s pause","rest":60},{"ex":"plank","reps":"45s","sets":3,"bw":true,"rest":45}]]},
      {"name":"Full body","day":5,"groups":[
        [{"ex":"trap_bar_dl","reps":"3","sets":4,"pct":80,"tempo":"2s pause below knee","rest":180,"rpe":8}],
        [{"ex":"front_squat","reps":"4","sets":3,"pct":75,"tempo":"3s pause at bottom","rest":120,"rpe":7}],
        [{"ex":"hip_thrust","reps":"6","sets":3,"pct":70,"tempo":"3s pause at top","rest":90,"rpe":7}],
        [{"ex":"side_plank","reps":"30s/side","sets":3,"bw":true,"rest":45},{"ex":"pallof","reps":"10/side","sets":3,"bw":true,"rest":45}]]}
    ]},
    {"phase_name":"Reactive","method":"contrast","sessions":[
      {"name":"Lower","day":1,"groups":[
        [{"ex":"back_squat","reps":"3","sets":4,"pct":70,"tempo":"Explosive — move fast","rest":20,"rpe":7},{"ex":"box_jump","reps":"3","sets":4,"bw":true,"tempo":"Max intent","rest":150}],
        [{"ex":"rdl","reps":"3","sets":3,"pct":70,"tempo":"Explosive","rest":20,"rpe":7},{"ex":"broad_jump","reps":"3","sets":3,"bw":true,"tempo":"Max intent","rest":150}],
        [{"ex":"bul_split","reps":"5/side","sets":3,"bw":true,"tempo":"Explosive up","rest":90}],
        [{"ex":"side_plank","reps":"30s/side","sets":2,"bw":true,"rest":45},{"ex":"pallof","reps":"10/side","sets":2,"bw":true,"rest":45}]]},
      {"name":"Upper","day":3,"groups":[
        [{"ex":"bench","reps":"3","sets":4,"pct":70,"tempo":"Explosive","rest":20,"rpe":7},{"ex":"plyo_pushup","reps":"4","sets":4,"bw":true,"tempo":"Max intent","rest":150}],
        [{"ex":"pull_up","reps":"4","sets":3,"bw":true,"tempo":"Explosive","rest":120,"rpe":8}],
        [{"ex":"ohp","reps":"4","sets":3,"pct":70,"tempo":"Explosive","rest":90,"rpe":7}],
        [{"ex":"plank","reps":"45s","sets":2,"bw":true,"rest":45}]]},
      {"name":"Full body","day":5,"groups":[
        [{"ex":"trap_bar_dl","reps":"3","sets":4,"pct":70,"tempo":"Explosive","rest":20,"rpe":7},{"ex":"box_jump","reps":"3","sets":4,"bw":true,"tempo":"Max intent","rest":150}],
        [{"ex":"hip_thrust","reps":"4","sets":3,"pct":65,"tempo":"Explosive","rest":20,"rpe":7},{"ex":"squat_jump","reps":"4","sets":3,"bw":true,"tempo":"Max intent","rest":120}],
        [{"ex":"side_plank","reps":"30s/side","sets":2,"bw":true,"rest":45},{"ex":"pallof","reps":"10/side","sets":2,"bw":true,"rest":45}]]}
    ]}
  ]$SPEC$::jsonb;
  wks jsonb := '[]'::jsonb;
  wk int; pidx int; p jsonb; sess jsonb; s jsonb; grp jsonb; e jsonb; exs jsonb; grps jsonb; so int; lt text; lv numeric;
begin
  for wk in 1..9 loop
    pidx := (wk - 1) / 3;          -- 0,1,2 → Eccentric, Isometric, Reactive
    p := phases -> pidx;
    sess := '[]'::jsonb;
    for s in select jsonb_array_elements(p->'sessions') loop
      grps := '[]'::jsonb; so := 0;
      for grp in select jsonb_array_elements(s->'groups') loop
        exs := '[]'::jsonb;
        for e in select jsonb_array_elements(grp) loop
          so := so + 1;
          if coalesce((e->>'bw')::boolean, false) then lt := 'bodyweight'; lv := 0;
          else lt := 'pct_1rm'; lv := (e->>'pct')::numeric; end if;
          exs := exs || jsonb_build_object(
            'exerciseId', km->>(e->>'ex'),
            'sets', (e->>'sets')::int,
            'reps', e->>'reps',
            'loadType', lt,
            'loadValue', lv,
            'rpeTarget', case when e ? 'rpe' then (e->>'rpe')::int else null end,
            'tempo', coalesce(e->>'tempo',''),
            'restSeconds', (e->>'rest')::int,
            'notes', coalesce(e->>'note',''),
            'sortOrder', so);
        end loop;
        grps := grps || jsonb_build_object('label', chr(64 + jsonb_array_length(grps) + 1), 'exercises', exs);
      end loop;
      sess := sess || jsonb_build_object(
        'dayOfWeek', (s->>'day')::int, 'name', (p->>'phase_name') || ' · ' || (s->>'name'),
        'type','strength', 'method', p->>'method', 'bodySplit','full',
        'groups', grps, 'estimatedDurationMin', 60);
    end loop;
    wks := wks || jsonb_build_object('week', wk, 'sessions', sess);
  end loop;

  insert into training_plan_templates(team_id, created_by, name, plan_type, duration_weeks,
    sessions_per_week, readiness_enabled, deload_volume_pct, deload_intensity_pct,
    recovery_volume_pct, recovery_intensity_pct, structure, notes)
  values ('1aaecc06-e675-4cb2-a903-e6500cc67ce8', '60b93b68-94fa-43a9-bdab-78b51056a7fb',
    'Triphasic Strength — 3×/viku', 'strength', 9, 3, true, 80, 85, 60, 70, wks,
    'Triphasic block model (Cal Dietz): Phase 1 Eccentric (slow lowering, wk 1-3) → Phase 2 Isometric (paused holds, wk 4-6) → Phase 3 Reactive (explosive + jump contrast, wk 7-9). Builds power through tempo and position — youth/intermediate friendly, not a max-CNS complex.');
end $MIG$;
