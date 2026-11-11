-- Long runs per drill: IMA Free Running runs of 18 s or more, and the strides in them.
-- Catapult returns the per-band run COUNT and STRIDES per OpenField period (indoors too); per-band
-- distance and time read 0 per period (session level only), so pace can't be read per drill and these
-- include jogs. Counted with the same band edges as the player's day row (ima_fr_band_bounds).
-- Additive, nullable, forward-only.

alter table public.player_drill_load
  add column if not exists long_runs        numeric,
  add column if not exists long_run_strides numeric;

alter table public.drill_library
  add column if not exists long_runs        numeric,
  add column if not exists long_run_strides numeric;

comment on column public.player_drill_load.long_runs is 'IMA Free Running runs lasting 18 s or more in this drill (count; jogs included, pace unknown per drill)';
comment on column public.player_drill_load.long_run_strides is 'Strides taken in those runs';
comment on column public.drill_library.long_runs is 'Long runs (18 s+) per player in the last measured session (jogs included)';
comment on column public.drill_library.long_run_strides is 'Strides in those long runs per player in the last measured session';
