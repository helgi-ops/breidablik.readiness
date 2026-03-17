alter table public.player_external_load_daily
  add column if not exists velocity_band5_total_distance numeric(10,2) null,
  add column if not exists velocity_band6_total_distance numeric(10,2) null,
  add column if not exists hir_dist numeric(10,2) null,
  add column if not exists max_vel numeric(10,2) null,
  add column if not exists accel_b2_3_tot_effs_gen2 integer null,
  add column if not exists tot_as integer null,
  add column if not exists decel_b2_3_tot_effs_gen2 integer null,
  add column if not exists tot_ds integer null,
  add column if not exists total_player_load numeric(10,2) null,
  add column if not exists player_load_per_minute numeric(10,2) null;
