-- Remove 5 duplicate exercise_library entries that differed only by hyphen/space
-- in the English name. All 5 were unreferenced (no prescriptions / logs / maxes /
-- template structures). Canonical kept: Trap Bar Deadlift, Pull-Up, Push-Up,
-- Step-Up, Bent-Over Row.
delete from exercise_library
where id in (
  'eab0557a-ce92-4452-984a-607c327eaf1c',  -- Trap-Bar Deadlift
  '0804cc10-4023-4150-9243-ccd6db61d02f',  -- Pull Up
  'e0c17c22-d994-4124-a8c5-dd6a3119ca4e',  -- Push Up
  'b4fde990-4729-4417-913b-9438302d4caa',  -- Step Up
  'd7847915-fb55-4611-8873-2a590c9097e0'   -- Bent Over Row
);
