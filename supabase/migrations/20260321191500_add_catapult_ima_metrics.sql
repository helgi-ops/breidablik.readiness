alter table public.player_external_load_daily
  add column if not exists ima_accel integer null,
  add column if not exists ima_decel integer null,
  add column if not exists ima_cod integer null,
  add column if not exists ima_total integer null,
  add column if not exists cod_events integer null,
  add column if not exists impacts integer null;
