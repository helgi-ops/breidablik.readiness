-- Allow basketball drill categories (shooting/fast_break/half_court_offense/
-- defense/conditioning) alongside the football set. Matches ALL_DRILL_CATEGORIES
-- in src/lib/drillCategories.ts.
alter table public.drill_library drop constraint if exists drill_library_category_check;
alter table public.drill_library add constraint drill_library_category_check
  check (category = any (array[
    'possession','ssg','transition','running','finishing',
    'shooting','fast_break','half_court_offense','defense','conditioning',
    'warmup','other'
  ]));
