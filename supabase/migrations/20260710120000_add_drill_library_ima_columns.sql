-- drill_library was missing three basketball IMA metrics that the drill
-- create / update / import code writes (high_ima, jump_count, ima_cod_total),
-- causing "Could not find the 'high_ima' column of 'drill_library' in the
-- schema cache" when a coach tried to create a new drill.
alter table public.drill_library
  add column if not exists high_ima numeric,
  add column if not exists jump_count numeric,
  add column if not exists ima_cod_total numeric;
