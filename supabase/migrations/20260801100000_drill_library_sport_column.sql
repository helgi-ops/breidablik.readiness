-- Tag drills with a sport so a basketball team never sees football drills (and
-- vice-versa). All existing drills are football (categories: ssg/possession/…).
alter table public.drill_library
  add column if not exists sport text not null default 'football';

comment on column public.drill_library.sport is
  'Sport the drill belongs to (football | basketball). The drill-library API filters by the team''s sport so cross-sport drills do not leak into the session builder.';

create index if not exists idx_drill_library_team_sport on public.drill_library (team_id, sport);
create index if not exists idx_drill_library_coach_sport on public.drill_library (owner_coach_id, sport);
