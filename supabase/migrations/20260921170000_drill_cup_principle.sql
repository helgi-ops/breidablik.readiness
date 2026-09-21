-- Owen (CUPs) planning taxonomy — an optional tag on a drill for the Collective / Unit /
-- Positional model (Owen et al. 2024). Additive and nullable; inherits the drill's RLS.
-- Descriptive planning metadata — never the readiness colour or the daily decision.

alter table public.drill_library
  add column if not exists cup_principle text
  check (cup_principle is null or cup_principle in ('collective', 'unit', 'positional'));
