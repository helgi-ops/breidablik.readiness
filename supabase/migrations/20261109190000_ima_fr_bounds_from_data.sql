-- IMA Free Running: read each row's band edges from its own data, not from the calendar (Nov 2026).
--
-- Why: Catapult classifies runs with whatever edges an athlete has when the session is processed. Two
-- Breiðablik players have been on Catapult's 3-band default (0-2.5 / 2.5-5 / 5+ s) all season while the
-- squad used 0-8-12-15-18-21-24-27-100, so stamping edges by (team, date) read their runs of 5 s+ as
-- "0 long runs". The same will happen to any session Catapult reprocesses with the new edges.
--
-- How: a band's mean run (time / runs) must lie inside that band's edges. The trigger tries every known
-- config (legacy, new 0-2.5-5-8-12-18-24-30-1000, the 3-band default, and the team's own configs) and
-- keeps the one that fits. In real data no row fits none; rows with too few runs can fit several.
--   1 fit            -> those edges, ima_fr_bounds_source = 'detected'
--   several fits     -> the same player's nearest 'detected' row if it is among them ('player'),
--                       else the team config for the date ('config')
--   no evidence      -> nearest 'detected' row of the player ('player'), else team config ('config')
--   no fit at all    -> team config, source 'unknown', tiers null (a reading we can't trust)
--   writer supplied  -> kept, source 'writer' (estimated rows in estimatePod.ts)
-- A tier (>=18 s, >=24 s) whose edge is not an edge of the row's config is null ("no reading"), never 0.
-- The 3-band default is stored as {0,2.5,5,1000,...}: no 18 s or 24 s edge, so long runs read as missing.
--
-- Re-detection: on insert, when a writer sets ima_fr_band_bounds to null, or when band values change on
-- update. So a re-sync after Catapult reprocesses relabels itself.

alter table public.player_external_load_daily
  add column if not exists ima_fr_bounds_source text;

comment on column public.player_external_load_daily.ima_fr_bounds_source is
  'How ima_fr_band_bounds was decided: detected (band means fit one config) | player (nearest detected row of the same player) | config (team_fr_band_config by date) | unknown (fits no known config; tiers null) | writer (set by the writer, e.g. estimates).';

-- Catapult changed Breiðablik''s edges on 9 Nov 2026 at 17:04 (no session after it that day).
update public.team_fr_band_config
   set effective_from = date '2026-11-09'
 where team_id = '94b52a06-0b83-48da-8664-639ec3486a0c'
   and effective_from = date '2026-11-10';

-- Known OpenField configs. Index i = lower edge of band i (1-based), i+1 = upper edge.
create or replace function public.ima_fr_presets() returns setof numeric[]
language sql immutable as $$
  values
    (array[0,8,12,15,18,21,24,27,100]::numeric[]),          -- legacy (Breiðablik Jun-Oct 2026)
    (array[0,2.5,5,8,12,18,24,30,1000]::numeric[]),         -- new (Breiðablik from 9 Nov 2026)
    (array[0,2.5,5,1000,1000,1000,1000,1000,1000]::numeric[]) -- Catapult 3-band default
$$;

-- True when every band with runs has its mean run inside the band's edges (±0.25 s for rounding).
create or replace function public.ima_fr_bounds_fit(ev numeric[], du numeric[], b numeric[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(du[i] / ev[i] between b[i] - 0.25 and b[i + 1] + 0.25), true)
    from generate_series(1, 8) i
   where coalesce(ev[i], 0) > 0 and du[i] is not null
$$;

create or replace function public.ima_fr_has_evidence(ev numeric[], du numeric[]) returns boolean
language sql immutable as $$
  select exists (select 1 from generate_series(1, 8) i where coalesce(ev[i], 0) > 0 and du[i] is not null)
$$;

create or replace function public.ima_fr_fill_tiers() returns trigger
language plpgsql as $$
declare
  b numeric[];
  cfg numeric[];
  nb numeric[];
  cand numeric[];
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
    return new;  -- e.g. older CSV rows that carry only the band58 rollup: left as the writer sent them
  end if;

  -- ── 1. Decide the edges ────────────────────────────────────────────────────────────────────────
  if new.ima_fr_band_bounds is null or array_length(new.ima_fr_band_bounds, 1) is distinct from 9 then
    redetect := true;
  elsif tg_op = 'INSERT' then
    redetect := false;
    new.ima_fr_bounds_source := 'writer';
  elsif new.ima_fr_band_bounds is distinct from old.ima_fr_band_bounds then
    redetect := false;
    new.ima_fr_bounds_source := 'writer';
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
    new.ima_fr_band_bounds := b;
    new.ima_fr_bounds_source := src;
  end if;
  b := new.ima_fr_band_bounds;

  -- ── 2. Run-length tiers from those edges ───────────────────────────────────────────────────────
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
    -- Keep a writer-supplied band58 when the per-band distances are absent; it means ">=18 s" only under
    -- the legacy edges (start18 = 5).
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
  return new;
end $$;

-- ── Backfill: re-detect every Free Running row (two passes so ambiguous rows can lean on a detected
-- neighbour). updated_at is left alone: the data did not change, only how it is read.
alter table public.player_external_load_daily disable trigger trg_player_external_load_daily_set_updated_at;

update public.player_external_load_daily
   set ima_fr_band_bounds = null
 where ima_fr_band_bounds is not null
   and coalesce(ima_fr_bounds_source, '') <> 'writer';

update public.player_external_load_daily
   set ima_fr_band_bounds = null
 where ima_fr_bounds_source in ('player', 'config');

alter table public.player_external_load_daily enable trigger trg_player_external_load_daily_set_updated_at;
