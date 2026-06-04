-- Missing exercises required by the Preparatory / Contrast / French Contrast
-- strength programs (uploaded by coach). Added to the shared exercise_library
-- so the program templates can reference them as prescriptions.
insert into exercise_library (name, name_is, exercise_type, category, equipment, muscle_groups, is_bilateral, movement_pattern, movement_family, sport)
values
 ('Saw Plank','Saw planki','strength','core','bodyweight','{core,shoulders}',true,'anti_extension','core','general'),
 ('Medicine Ball Chest Pass','Boltakast (bringa)','strength','plyometric','med_ball','{chest,shoulders,triceps}',true,'horizontal_push','push','general'),
 ('Assisted Jump','Aðstoðað stökk','strength','plyometric','band','{quads,glutes,calves}',true,'knee_dominant','squat','general'),
 ('Assisted Plyo Push-Up','Aðstoðuð sprengiarmbeygja','strength','plyometric','band','{chest,triceps}',true,'horizontal_push','push','general'),
 ('Sprint','Sprettur','strength','sprint','none','{hamstrings,glutes,quads}',true,null,null,'general'),
 ('Split Squat Jump','Split hopp','strength','plyometric','bodyweight','{quads,glutes,calves}',false,'knee_dominant','squat','general'),
 ('DB Split Squat Jump','Hantel split hopp','strength','plyometric','dumbbell','{quads,glutes,calves}',false,'knee_dominant','squat','general'),
 ('Assisted Split Squat Jump','Aðstoðað split hopp','strength','plyometric','band','{quads,glutes,calves}',false,'knee_dominant','squat','general'),
 ('Single-Leg Hip Thrust','Einfætt Hip Thrust','strength','compound','bodyweight','{glutes,hamstrings}',false,'hip_hinge','hinge','general')
on conflict do nothing;
