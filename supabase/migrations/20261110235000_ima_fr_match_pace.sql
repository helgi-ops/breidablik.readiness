-- IMA Free Running: long runs at MATCH PACE vs jogs (10 Nov 2026).
--
-- The Free Running bands say how LONG a player ran without stopping, not how fast. Breiðablik Jun–Oct 2026
-- (new edges): in a near-full match 14.1 of 15.5 runs of 18 s+ are at 11 km/h or faster (average 12.2 km/h);
-- on a training day 0.7 of 5.6 (average 9.0 km/h): training long runs are mostly jogs (warm-up laps, jogging
-- back between drills), and the open top band (30–1000 s) makes the time and distance worse. So a long run
-- counts as running LOAD only at match pace; jogs stay visible but never judge, target or alarm
-- (docs/ima-free-running-bands.md, "Pace: match pace vs jog").
--
-- Adds:
--   * team_settings.fr_match_pace_floor_kmh (null = 11 km/h; Breiðablik's slowest tenth of match long runs = 11.2);
--   * ima_fr_ge18_mp_{event_count,total_duration,total_distance,stride_count} on player_external_load_daily;
--   * the same trigger as 20261110100000 plus the match-pace sums at the end (nothing else changes).
-- The backfill is the next migration (20261110235500).

alter table public.team_settings
  add column if not exists fr_match_pace_floor_kmh numeric
    check (fr_match_pace_floor_kmh is null or (fr_match_pace_floor_kmh > 0 and fr_match_pace_floor_kmh < 30));
comment on column public.team_settings.fr_match_pace_floor_kmh is
  'IMA Free Running: a long run (18 s+) counts as match-pace running load at or above this pace (km/h). Null = 11.';

alter table public.player_external_load_daily
  add column if not exists ima_fr_ge18_mp_event_count numeric,
  add column if not exists ima_fr_ge18_mp_total_duration numeric,
  add column if not exists ima_fr_ge18_mp_total_distance numeric,
  add column if not exists ima_fr_ge18_mp_stride_count numeric;
comment on column public.player_external_load_daily.ima_fr_ge18_mp_event_count is
  'Runs of 18 s+ at match pace (band pace >= team_settings.fr_match_pace_floor_kmh, default 11 km/h). Null = pace unknown (no GPS / no reading).';
comment on column public.player_external_load_daily.ima_fr_ge18_mp_total_duration is 'Seconds in runs of 18 s+ at match pace. Null = pace unknown.';
comment on column public.player_external_load_daily.ima_fr_ge18_mp_total_distance is 'Metres in runs of 18 s+ at match pace. Null = pace unknown.';
comment on column public.player_external_load_daily.ima_fr_ge18_mp_stride_count is 'Strides in runs of 18 s+ at match pace. Null = pace unknown.';

create or replace function public.ima_fr_fill_tiers()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  b numeric[];
  cfg numeric[];
  nb numeric[];
  cand numeric[];
  writer_b numeric[];
  fits text[] := array[]::text[];
  nfit int := 0;
  src text;
  i int;
  start18 int;
  start24 int;
  has_fr boolean;
  redetect boolean;
  ev numeric[]; du numeric[]; st numeric[]; di numeric[]; pl numeric[];
  old_ev numeric[]; old_du numeric[]; old_st numeric[];
  floor_kmh numeric;
begin
  ev := array[new.ima_fr_band1_event_count, new.ima_fr_band2_event_count, new.ima_fr_band3_event_count, new.ima_fr_band4_event_count,
              new.ima_fr_band5_event_count, new.ima_fr_band6_event_count, new.ima_fr_band7_event_count, new.ima_fr_band8_event_count]::numeric[];
  du := array[new.ima_fr_band1_total_duration, new.ima_fr_band2_total_duration, new.ima_fr_band3_total_duration, new.ima_fr_band4_total_duration,
              new.ima_fr_band5_total_duration, new.ima_fr_band6_total_duration, new.ima_fr_band7_total_duration, new.ima_fr_band8_total_duration];
  st := array[new.ima_fr_band1_stride_count, new.ima_fr_band2_stride_count, new.ima_fr_band3_stride_count, new.ima_fr_band4_stride_count,
              new.ima_fr_band5_stride_count, new.ima_fr_band6_stride_count, new.ima_fr_band7_stride_count, new.ima_fr_band8_stride_count];
  di := array[new.ima_fr_band1_total_distance, new.ima_fr_band2_total_distance, new.ima_fr_band3_total_distance, new.ima_fr_band4_total_distance,
              new.ima_fr_band5_total_distance, new.ima_fr_band6_total_distance, new.ima_fr_band7_total_distance, new.ima_fr_band8_total_distance];
  pl := array[new.ima_fr_band1_total_player_load, new.ima_fr_band2_total_player_load, new.ima_fr_band3_total_player_load, new.ima_fr_band4_total_player_load,
              new.ima_fr_band5_total_player_load, new.ima_fr_band6_total_player_load, new.ima_fr_band7_total_player_load, new.ima_fr_band8_total_player_load];

  has_fr := exists (select 1 from unnest(ev) x where x is not null)
         or exists (select 1 from unnest(du) x where x is not null)
         or exists (select 1 from unnest(st) x where x is not null)
         or exists (select 1 from unnest(di) x where x is not null);
  if not has_fr then
    return new;
  end if;

  writer_b := null;
  if new.ima_fr_band_bounds is null or array_length(new.ima_fr_band_bounds, 1) is distinct from 9 then
    redetect := true;
  elsif tg_op = 'INSERT' then
    redetect := false;
    new.ima_fr_bounds_source := 'writer';
  elsif new.ima_fr_band_bounds is distinct from old.ima_fr_band_bounds then
    -- Either the UPDATE half of an upsert (EXCLUDED already holds the INSERT half's detection) or a
    -- writer stamping its own edges. Detect again; keep the writer's edges only if the data disagrees.
    redetect := true;
    writer_b := new.ima_fr_band_bounds;
  else
    old_ev := array[old.ima_fr_band1_event_count, old.ima_fr_band2_event_count, old.ima_fr_band3_event_count, old.ima_fr_band4_event_count,
                    old.ima_fr_band5_event_count, old.ima_fr_band6_event_count, old.ima_fr_band7_event_count, old.ima_fr_band8_event_count]::numeric[];
    old_du := array[old.ima_fr_band1_total_duration, old.ima_fr_band2_total_duration, old.ima_fr_band3_total_duration, old.ima_fr_band4_total_duration,
                    old.ima_fr_band5_total_duration, old.ima_fr_band6_total_duration, old.ima_fr_band7_total_duration, old.ima_fr_band8_total_duration];
    old_st := array[old.ima_fr_band1_stride_count, old.ima_fr_band2_stride_count, old.ima_fr_band3_stride_count, old.ima_fr_band4_stride_count,
                    old.ima_fr_band5_stride_count, old.ima_fr_band6_stride_count, old.ima_fr_band7_stride_count, old.ima_fr_band8_stride_count];
    redetect := coalesce(old.ima_fr_bounds_source, '') <> 'writer'
                and (ev is distinct from old_ev or du is distinct from old_du or st is distinct from old_st);
  end if;

  if redetect then
    select c.bounds_s into cfg from public.team_fr_band_config c
     where c.team_id = new.team_id and c.effective_from <= new.date
     order by c.effective_from desc limit 1;
    cfg := coalesce(cfg, array[0,8,12,15,18,21,24,27,100]::numeric[]);

    select d.ima_fr_band_bounds into nb from public.player_external_load_daily d
     where d.player_id = new.player_id and d.team_id is not distinct from new.team_id
       and d.ima_fr_bounds_source = 'detected'
       and not (d.date = new.date and d.source = new.source)
     order by abs(d.date - new.date), d.date desc limit 1;

    if not public.ima_fr_has_evidence(ev, du) then
      if nb is not null then b := nb; src := 'player'; else b := cfg; src := 'config'; end if;
    else
      for cand in
        select distinct x from (
          select p as x from public.ima_fr_presets() p
          union all
          select c.bounds_s from public.team_fr_band_config c where c.team_id = new.team_id
        ) s
      loop
        if public.ima_fr_bounds_fit(ev, du, cand) then
          nfit := nfit + 1;
          fits := fits || cand::text;
        end if;
      end loop;

      if nfit = 1 then
        b := fits[1]::numeric[]; src := 'detected';
      elsif nfit = 0 then
        b := cfg; src := 'unknown';
      elsif nb is not null and exists (select 1 from unnest(fits) f where f::numeric[] = nb) then
        b := nb; src := 'player';
      else
        b := cfg; src := 'config';
      end if;
    end if;

    if writer_b is not null and b is distinct from writer_b then
      b := writer_b; src := 'writer';
    end if;
    new.ima_fr_band_bounds := b;
    new.ima_fr_bounds_source := src;
  end if;
  b := new.ima_fr_band_bounds;

  start18 := null; start24 := null;
  if coalesce(new.ima_fr_bounds_source, '') <> 'unknown' then
    for i in 1..8 loop
      if b[i] = 18 then start18 := i; end if;
      if b[i] = 24 then start24 := i; end if;
    end loop;
  end if;

  if start18 is not null then
    new.ima_fr_ge18_event_count     := (select case when count(x) = 0 then null else sum(x) end from unnest(ev[start18:8]) x);
    new.ima_fr_ge18_total_duration  := (select case when count(x) = 0 then null else sum(x) end from unnest(du[start18:8]) x);
    new.ima_fr_ge18_stride_count    := (select case when count(x) = 0 then null else sum(x) end from unnest(st[start18:8]) x);
    new.ima_fr_ge18_total_distance  := (select case when count(x) = 0 then null else sum(x) end from unnest(di[start18:8]) x);
    new.ima_fr_ge18_total_player_load := (select case when count(x) = 0 then null else sum(x) end from unnest(pl[start18:8]) x);
    if new.ima_fr_ge18_total_distance is not null then
      new.ima_fr_band58_total_distance := new.ima_fr_ge18_total_distance;
    elsif start18 = 5 and new.ima_fr_band58_total_distance is not null then
      new.ima_fr_ge18_total_distance := new.ima_fr_band58_total_distance;
    elsif start18 <> 5 then
      new.ima_fr_band58_total_distance := null;
    end if;
  else
    new.ima_fr_ge18_event_count := null; new.ima_fr_ge18_total_duration := null; new.ima_fr_ge18_stride_count := null;
    new.ima_fr_ge18_total_distance := null; new.ima_fr_ge18_total_player_load := null;
    new.ima_fr_band58_total_distance := null;
  end if;

  if start24 is not null then
    new.ima_fr_ge24_event_count     := (select case when count(x) = 0 then null else sum(x) end from unnest(ev[start24:8]) x);
    new.ima_fr_ge24_total_duration  := (select case when count(x) = 0 then null else sum(x) end from unnest(du[start24:8]) x);
    new.ima_fr_ge24_stride_count    := (select case when count(x) = 0 then null else sum(x) end from unnest(st[start24:8]) x);
    new.ima_fr_ge24_total_distance  := (select case when count(x) = 0 then null else sum(x) end from unnest(di[start24:8]) x);
    new.ima_fr_ge24_total_player_load := (select case when count(x) = 0 then null else sum(x) end from unnest(pl[start24:8]) x);
  else
    new.ima_fr_ge24_event_count := null; new.ima_fr_ge24_total_duration := null; new.ima_fr_ge24_stride_count := null;
    new.ima_fr_ge24_total_distance := null; new.ima_fr_ge24_total_player_load := null;
  end if;

  -- Match pace (Nov 2026): the ≥18 s runs whose band is run at or above the team's match-pace floor
  -- (team_settings.fr_match_pace_floor_kmh, default 11 km/h). Pace = the band's distance ÷ time, so it is the
  -- band's average pace. Null = pace unknown (no ≥18 s reading, or no GPS distance on the row, e.g. indoors);
  -- 0 = GPS present and every long run was slower (jogging).
  new.ima_fr_ge18_mp_event_count := null; new.ima_fr_ge18_mp_total_duration := null;
  new.ima_fr_ge18_mp_total_distance := null; new.ima_fr_ge18_mp_stride_count := null;
  if start18 is not null and new.ima_fr_ge18_event_count is not null and coalesce(new.total_distance, 0) > 0 then
    select s.fr_match_pace_floor_kmh into floor_kmh from public.team_settings s where s.team_id = new.team_id;
    floor_kmh := coalesce(floor_kmh, 11.0);
    new.ima_fr_ge18_mp_event_count := 0; new.ima_fr_ge18_mp_total_duration := 0;
    new.ima_fr_ge18_mp_total_distance := 0; new.ima_fr_ge18_mp_stride_count := 0;
    for i in start18..8 loop
      if coalesce(du[i], 0) > 0 and coalesce(di[i], 0) > 0 and di[i] / du[i] * 3.6 >= floor_kmh then
        new.ima_fr_ge18_mp_event_count    := new.ima_fr_ge18_mp_event_count + coalesce(ev[i], 0);
        new.ima_fr_ge18_mp_total_duration := new.ima_fr_ge18_mp_total_duration + du[i];
        new.ima_fr_ge18_mp_total_distance := new.ima_fr_ge18_mp_total_distance + di[i];
        new.ima_fr_ge18_mp_stride_count   := new.ima_fr_ge18_mp_stride_count + coalesce(st[i], 0);
      end if;
    end loop;
  end if;
  return new;
end $function$;
