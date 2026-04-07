-- Add Catapult Basketball Movement Profile (BMP) columns to drill_library
-- These are basketball-specific metrics from the Catapult Vector T7 system:
--   jump_count   – number of jumps detected via inertial sensors
--   ima_cod_total – total IMA Change-of-Direction events
--   high_ima      – high-intensity IMA events (accel/decel/COD ≥ 3.5 m/s²)

alter table public.drill_library
  add column if not exists jump_count     int           default null,
  add column if not exists ima_cod_total  int           default null,
  add column if not exists high_ima       int           default null;

comment on column public.drill_library.jump_count
  is 'Number of jumps detected (Catapult BMP)';
comment on column public.drill_library.ima_cod_total
  is 'Total IMA Change-of-Direction events (Catapult BMP)';
comment on column public.drill_library.high_ima
  is 'High-intensity IMA events ≥3.5 m/s² – combined accel+decel+COD (Catapult BMP)';

-- Also add to public templates table if it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'drill_library_public') then
    execute 'alter table public.drill_library_public
      add column if not exists jump_count    int default null,
      add column if not exists ima_cod_total int default null,
      add column if not exists high_ima      int default null';
  end if;
end $$;
