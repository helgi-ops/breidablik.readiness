-- Team-level default for how the coach's strength send builds each session:
--   'individualised' — the data + screen driven session (readiness + MD-aware,
--     plus the player's movement-screen corrective block + deficit-ledger emphases
--     + IMTP/VBT force-velocity). The product default.
--   'standard' — the MD template, still readiness- and MD-tuned, but WITHOUT the
--     per-player individualisation layers (no screen corrective, no ledger emphasis,
--     no F-V driver) — the same clean structured session for the squad.
-- The send route may override this per send; this is just the team default.
alter table teams
  add column if not exists strength_send_mode text not null default 'individualised';

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'teams' and constraint_name = 'teams_strength_send_mode_check'
  ) then
    alter table teams add constraint teams_strength_send_mode_check
      check (strength_send_mode in ('individualised', 'standard'));
  end if;
end $$;
