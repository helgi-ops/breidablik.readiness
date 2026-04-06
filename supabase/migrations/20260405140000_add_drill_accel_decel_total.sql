-- Add total acceleration / deceleration counts to drill libraries
-- (in addition to existing band 2-3 values)

alter table public.drill_library
  add column if not exists accel_total numeric(5,1),
  add column if not exists decel_total numeric(5,1);

alter table public.drill_library_public
  add column if not exists accel_total numeric(5,1),
  add column if not exists decel_total numeric(5,1);
