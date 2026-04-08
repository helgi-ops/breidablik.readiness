-- ============================================================
-- Add movement_pattern to exercise_library
-- ============================================================
-- Categorises exercises by fundamental movement pattern:
--   push, pull, hinge, squat, carry
-- Used by PlanBuilder presets to suggest appropriate exercises
-- for each slot in structured training methods.
-- ============================================================

alter table public.exercise_library
  add column if not exists movement_pattern text check (
    movement_pattern in ('push','pull','hinge','squat','carry')
  );

create index if not exists idx_exercise_library_pattern
  on public.exercise_library(movement_pattern);

comment on column public.exercise_library.movement_pattern is
  'Fundamental movement pattern: push, pull, hinge, squat, carry';
