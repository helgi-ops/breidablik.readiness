-- ============================================================
-- Exercise library seed — bilingual (EN/IS), tagged by
-- Science-for-Sport movement pattern + coach family.
-- ============================================================
-- Canonical names are used where relevant (Back Squat, Romanian
-- Deadlift, Bench Press, Pull-Up, Power Clean, ...) so that the
-- PR / volume-load / e1RM analytics pool variants correctly via
-- src/lib/client/oneRepMax.ts::canonicalLift.
--
-- Idempotent: each row inserts only if no exercise of the same
-- name (case-insensitive) already exists.
-- ============================================================

insert into public.exercise_library
  (name, name_is, exercise_type, category, movement_pattern, movement_family, muscle_groups, equipment, is_bilateral, sport)
select v.name, v.name_is, v.exercise_type, v.category, v.movement_pattern, v.movement_family,
       v.muscle_groups::text[], v.equipment, v.is_bilateral, 'football'
from (values
  -- ── SQUAT (knee-dominant) ──────────────────────────────
  ('Back Squat','Hnébeygja','strength','compound','knee_dominant','squat','{quadriceps,glutes}','barbell',true),
  ('Front Squat','Framhnébeygja','strength','compound','knee_dominant','squat','{quadriceps,glutes,core}','barbell',true),
  ('Goblet Squat','Goblet hnébeygja','strength','compound','knee_dominant','squat','{quadriceps,glutes}','dumbbell',true),
  ('Bulgarian Split Squat','Búlgörsk klofbeygja','strength','compound','knee_dominant','squat','{quadriceps,glutes}','dumbbell',false),
  ('Walking Lunge','Gönguútfall','strength','compound','knee_dominant','squat','{quadriceps,glutes}','dumbbell',false),
  ('Reverse Lunge','Afturútfall','strength','compound','knee_dominant','squat','{quadriceps,glutes}','dumbbell',false),
  ('Step-Up','Uppstig','strength','compound','knee_dominant','squat','{quadriceps,glutes}','dumbbell',false),
  ('Leg Press','Fótapressa','strength','compound','knee_dominant','squat','{quadriceps,glutes}','machine',true),
  ('Pistol Squat','Pistólbeygja','strength','compound','knee_dominant','squat','{quadriceps,glutes}','bodyweight',false),
  ('Leg Extension','Fótaréttur','strength','isolation','knee_dominant','squat','{quadriceps}','machine',true),
  ('Box Jump','Kassastökk','strength','plyometric','knee_dominant','squat','{quadriceps,glutes}','box',true),
  ('Squat Jump','Hnébeygjustökk','strength','plyometric','knee_dominant','squat','{quadriceps,glutes}','bodyweight',true),

  -- ── HINGE (hip hinge / hip dominant) ───────────────────
  ('Deadlift','Réttstöðulyfta','strength','compound','hip_hinge','hinge','{hamstrings,glutes,back}','barbell',true),
  ('Trap-Bar Deadlift','Trap-bar réttstöðulyfta','strength','compound','hip_hinge','hinge','{hamstrings,glutes,quadriceps}','barbell',true),
  ('Romanian Deadlift','Rúmensk réttstöðulyfta','strength','compound','hip_hinge','hinge','{hamstrings,glutes}','barbell',true),
  ('Single-Leg RDL','Einfætt RDL','strength','compound','hip_hinge','hinge','{hamstrings,glutes}','dumbbell',false),
  ('Kettlebell Swing','Ketilbjöllusveifla','strength','compound','hip_hinge','hinge','{glutes,hamstrings}','kettlebell',true),
  ('Good Morning','Good morning','strength','compound','hip_hinge','hinge','{hamstrings,erectors}','barbell',true),
  ('Hip Thrust','Mjaðmalyfta','strength','compound','hip_dominant','hinge','{glutes,hamstrings}','barbell',true),
  ('Glute Bridge','Rassbrú','strength','compound','hip_dominant','hinge','{glutes}','bodyweight',true),
  ('Back Extension','Bakréttur','strength','isolation','hip_hinge','hinge','{erectors,glutes}','bodyweight',true),
  ('Nordic Hamstring Curl','Nordic aftanlæri','strength','isolation','hip_hinge','hinge','{hamstrings}','bodyweight',true),
  ('Seated Hamstring Curl','Aftanlærisréttur','strength','isolation','hip_hinge','hinge','{hamstrings}','machine',true),
  ('Power Clean','Sprengilyfta','strength','olympic_lift','hip_hinge','hinge','{glutes,hamstrings,traps}','barbell',true),
  ('Hang Power Clean','Hengilyfta','strength','olympic_lift','hip_hinge','hinge','{glutes,hamstrings,traps}','barbell',true),
  ('Power Snatch','Snörun','strength','olympic_lift','hip_hinge','hinge','{glutes,hamstrings,shoulders}','barbell',true),

  -- ── PUSH (vertical / horizontal) ───────────────────────
  ('Bench Press','Bekkpressa','strength','compound','horizontal_push','push','{chest,triceps,shoulders}','barbell',true),
  ('Incline Bench Press','Hallandi bekkpressa','strength','compound','horizontal_push','push','{chest,shoulders,triceps}','barbell',true),
  ('Dumbbell Bench Press','Handlóða bekkpressa','strength','compound','horizontal_push','push','{chest,triceps,shoulders}','dumbbell',true),
  ('Push-Up','Armbeygja','strength','compound','horizontal_push','push','{chest,triceps,core}','bodyweight',true),
  ('Single-Arm Dumbbell Press','Einhent handlóðapressa','strength','compound','horizontal_push','push','{chest,shoulders,core}','dumbbell',false),
  ('Overhead Press','Axlapressa','strength','compound','vertical_push','push','{shoulders,triceps}','barbell',true),
  ('Dumbbell Shoulder Press','Handlóða axlapressa','strength','compound','vertical_push','push','{shoulders,triceps}','dumbbell',true),
  ('Push Press','Push press','strength','compound','vertical_push','push','{shoulders,triceps,legs}','barbell',true),
  ('Dip','Dýfur','strength','compound','vertical_push','push','{chest,triceps,shoulders}','bodyweight',true),
  ('Triceps Pushdown','Þríhöfðapressa','strength','isolation','horizontal_push','push','{triceps}','cable',true),
  ('Plyo Push-Up','Sprengiarmbeygja','strength','plyometric','horizontal_push','push','{chest,triceps}','bodyweight',true),

  -- ── PULL (vertical / horizontal) ───────────────────────
  ('Pull-Up','Upptog','strength','compound','vertical_pull','pull','{lats,biceps}','bodyweight',true),
  ('Chin-Up','Upptog (undirgrip)','strength','compound','vertical_pull','pull','{lats,biceps}','bodyweight',true),
  ('Lat Pulldown','Niðurtog','strength','compound','vertical_pull','pull','{lats,biceps}','machine',true),
  ('Bent-Over Row','Framhallandi róður','strength','compound','horizontal_pull','pull','{back,lats,biceps}','barbell',true),
  ('Single-Arm Dumbbell Row','Einhent handlóðaróður','strength','compound','horizontal_pull','pull','{back,lats,biceps}','dumbbell',false),
  ('Seated Cable Row','Setróður','strength','compound','horizontal_pull','pull','{back,lats,biceps}','machine',true),
  ('Inverted Row','Öfugur róður','strength','compound','horizontal_pull','pull','{back,lats,biceps}','bodyweight',true),
  ('T-Bar Row','T-bar róður','strength','compound','horizontal_pull','pull','{back,lats,biceps}','barbell',true),
  ('Face Pull','Andlitstog','strength','isolation','horizontal_pull','pull','{rear_delts,upper_back}','cable',true),
  ('Barbell Biceps Curl','Tvíhöfðabeygja','strength','isolation','horizontal_pull','pull','{biceps}','barbell',true),

  -- ── CORE (rotation / anti-) ────────────────────────────
  ('Pallof Press','Pallof pressa','strength','core','anti_rotation','core','{core,obliques}','cable',true),
  ('Plank','Planki','strength','core','anti_extension','core','{core}','bodyweight',true),
  ('Side Plank','Hliðarplanki','strength','core','anti_lateral_flexion','core','{obliques,core}','bodyweight',false),
  ('Dead Bug','Dauða bjalla','strength','core','anti_extension','core','{core}','bodyweight',true),
  ('Ab Wheel Rollout','Magahjól','strength','core','anti_extension','core','{core}','bodyweight',true),
  ('Hanging Leg Raise','Hangandi fótalyfta','strength','core','anti_extension','core','{core,hip_flexors}','bodyweight',true),
  ('Cable Woodchop','Viðarhögg','strength','core','rotational_diagonal','core','{obliques,core}','cable',false),
  ('Russian Twist','Rússnesk snúa','strength','core','rotational_diagonal','core','{obliques,core}','bodyweight',true),
  ('Medicine Ball Rotational Throw','Boltakast með snúningi','strength','plyometric','rotational_diagonal','core','{obliques,core}','medicine_ball',false),

  -- ── CARRY (loaded carries) ─────────────────────────────
  ('Farmer''s Carry','Bóndaganga','strength','compound','carry','carry','{grip,traps,core}','dumbbell',true),
  ('Suitcase Carry','Ferðatöskuburður','strength','compound','carry','carry','{obliques,grip,core}','dumbbell',false),
  ('Overhead Carry','Yfirhöfuðsburður','strength','compound','carry','carry','{shoulders,core}','dumbbell',true)
) as v(name, name_is, exercise_type, category, movement_pattern, movement_family, muscle_groups, equipment, is_bilateral)
where not exists (
  select 1 from public.exercise_library e where lower(e.name) = lower(v.name)
);

-- Tag pre-existing core exercises that collided with the seed (so they show
-- up when browsing the Core family).
update public.exercise_library set movement_pattern = 'anti_extension', movement_family = 'core'
  where lower(name) in ('plank','dead bug') and movement_family is null;
update public.exercise_library set movement_pattern = 'anti_rotation', movement_family = 'core'
  where lower(name) in ('pallof press','anti-rotation hold') and movement_family is null;
