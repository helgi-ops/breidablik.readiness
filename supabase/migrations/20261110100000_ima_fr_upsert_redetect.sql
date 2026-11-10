-- IMA Free Running: a re-sync (upsert) re-reads the band edges from the row's data, not "writer" (10 Nov 2026).
--
-- Found when 24 Oct 2026 was re-synced after Catapult reprocessed it with the new edges. The sync sends
-- ima_fr_band_bounds = null ("decide again"). On INSERT ... ON CONFLICT DO UPDATE, Postgres runs the
-- BEFORE INSERT trigger first, so EXCLUDED already carries the detected edges. The BEFORE UPDATE half then
-- saw non-null edges that differ from the old row and labelled them 'writer'. The edges were right, but:
--   * 'writer' rows are never used as a player's reference row ('player' fallback looks for 'detected'),
--     so a full-season re-sync would push low-evidence sessions back onto the team's calendar config;
--   * an 'unknown' (fits no known config) row would become 'writer' and get tiers, i.e. a reading we
--     don't trust would show as a number.
--
-- Fix: when an UPDATE brings edges that differ from the old row, detect again from the row's own data.
-- If detection gives the same edges, keep its label (detected / player / config / unknown). Only when the
-- edges differ from what the data says (a writer stamping its own, e.g. estimate-pod) is it 'writer'.
-- INSERT with edges supplied is unchanged ('writer').
--
-- Also relabels the 15 Breiðablik rows of 2026-10-24 that the re-sync labelled 'writer'.

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
  return new;
end $function$;

-- Relabel the rows the 24 Oct re-sync marked 'writer' (null edges = decide again from the row's data).
-- Estimates are left alone: they carry raw_payload_json.estimated = true.
update public.player_external_load_daily
   set ima_fr_band_bounds = null
 where source = 'catapult'
   and ima_fr_bounds_source = 'writer'
   and date = date '2026-10-24'
   and coalesce(raw_payload_json->>'estimated', 'false') <> 'true';
