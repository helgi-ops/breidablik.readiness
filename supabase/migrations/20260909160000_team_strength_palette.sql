-- Team strength palette — the per-slot exercise pool the coach picks so the
-- INDIVIDUALISED / auto strength session builds from THEIR chosen exercises (the
-- coach enters the standard session by hand). One row per team; slots jsonb maps
-- each slot (power_explosive | bilateral_strength | unilateral_strength |
-- posterior_accessory) to an ordered list of exercise ids. The engine
-- individualises within it (symmetry picks uni vs bi, ledger adds emphasis,
-- readiness/MD tune the dose). RLS mirrors player_deficits.
create table if not exists team_strength_palette (
  team_id uuid primary key references teams(id) on delete cascade,
  slots jsonb not null default '{}'::jsonb,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table team_strength_palette enable row level security;
drop policy if exists team_strength_palette_rw on team_strength_palette;
create policy team_strength_palette_rw on team_strength_palette for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());
