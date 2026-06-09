-- Trainer-owned exercises. owner_team_id NULL = a system/global exercise
-- (shared library, read-only for trainers). Non-null = a custom exercise owned
-- by that team — only its owner can edit or delete it. Existing rows stay
-- system exercises (NULL).
alter table public.exercise_library
  add column if not exists owner_team_id uuid references public.teams(id) on delete cascade;

create index if not exists exercise_library_owner_idx on public.exercise_library (owner_team_id);

comment on column public.exercise_library.owner_team_id is
  'Owning team for a custom exercise. NULL = system/global exercise (read-only for trainers); non-null = trainer-owned and editable/deletable only by that team.';
