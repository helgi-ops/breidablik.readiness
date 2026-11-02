-- Manual VBT: add bar-velocity columns to the existing per-set strength log so
-- athletes / PT clients WITHOUT GymAware hardware can enter velocity (m/s) by
-- hand and feed the SAME VBT analytics (velocity-loss, PBs, load-velocity /
-- est-1RM) that GymAware teams get. Extending an existing table → its grants and
-- RLS are unchanged; both columns are nullable (velocity is optional on a set).

alter table public.player_strength_set_log
  add column if not exists mean_velocity numeric,
  add column if not exists peak_velocity numeric;

comment on column public.player_strength_set_log.mean_velocity is
  'Manual VBT: mean concentric bar velocity (m/s), entered by hand from a VBT device/app readout. NULL when not measured.';
comment on column public.player_strength_set_log.peak_velocity is
  'Manual VBT: peak concentric bar velocity (m/s). NULL when not measured.';
