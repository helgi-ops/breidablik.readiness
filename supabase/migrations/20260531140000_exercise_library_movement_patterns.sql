-- ============================================================
-- Exercise library: Science-for-Sport movement patterns + family
-- ============================================================
-- Two-level taxonomy (explainability-first: family is the coach
-- surface, pattern is the S&C drill-down):
--
--   movement_family  — coach-readable bucket the picker browses by:
--                      squat | hinge | push | pull | core | carry
--   movement_pattern — the precise Science-for-Sport fundamental
--                      pattern (the detail surface):
--                      hip_hinge, hip_dominant, knee_dominant,
--                      vertical_push, horizontal_push,
--                      vertical_pull, horizontal_pull,
--                      rotational_diagonal, anti_rotation,
--                      anti_flexion, anti_extension,
--                      anti_lateral_flexion, carry
--
-- Ref: scienceforsport.com/basic-movement-patterns
-- ============================================================

-- 1. Drop the old 5-value coarse check (push/pull/hinge/squat/carry)
alter table public.exercise_library
  drop constraint if exists exercise_library_movement_pattern_check;

-- 2. Remap the legacy coarse values to a sensible precise SFS pattern
--    (coach can refine; the family roll-up below is what the picker uses)
update public.exercise_library set movement_pattern = 'hip_hinge'       where movement_pattern = 'hinge';
update public.exercise_library set movement_pattern = 'knee_dominant'   where movement_pattern = 'squat';
update public.exercise_library set movement_pattern = 'horizontal_push' where movement_pattern = 'push';
update public.exercise_library set movement_pattern = 'horizontal_pull' where movement_pattern = 'pull';

-- 3. Re-add the check with the full Science-for-Sport pattern set
alter table public.exercise_library
  add constraint exercise_library_movement_pattern_check check (
    movement_pattern is null or movement_pattern in (
      'hip_hinge','hip_dominant','knee_dominant',
      'vertical_push','horizontal_push',
      'vertical_pull','horizontal_pull',
      'rotational_diagonal','anti_rotation',
      'anti_flexion','anti_extension','anti_lateral_flexion',
      'carry'
    )
  );

-- 4. Coach-readable family roll-up
alter table public.exercise_library
  add column if not exists movement_family text check (
    movement_family is null or movement_family in
      ('squat','hinge','push','pull','core','carry')
  );

-- 5. Backfill family from pattern
update public.exercise_library set movement_family = case
  when movement_pattern = 'knee_dominant' then 'squat'
  when movement_pattern in ('hip_hinge','hip_dominant') then 'hinge'
  when movement_pattern in ('vertical_push','horizontal_push') then 'push'
  when movement_pattern in ('vertical_pull','horizontal_pull') then 'pull'
  when movement_pattern in ('rotational_diagonal','anti_rotation','anti_flexion','anti_extension','anti_lateral_flexion') then 'core'
  when movement_pattern = 'carry' then 'carry'
  else movement_family
end
where movement_pattern is not null;

create index if not exists idx_exercise_library_family
  on public.exercise_library(movement_family);

comment on column public.exercise_library.movement_pattern is
  'Science-for-Sport fundamental movement pattern (S&C detail surface).';
comment on column public.exercise_library.movement_family is
  'Coach-readable movement family: squat, hinge, push, pull, core, carry.';
