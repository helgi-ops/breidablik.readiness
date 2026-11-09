-- IMA Free Running: one place that turns raw bands into config-independent run-length tiers (Nov 2026).
--
-- Every writer of player_external_load_daily (Catapult sync, CSV upload, manual entry, seeds) gets the same
-- treatment: if the row carries Free Running band data, the trigger
--   1. stamps ima_fr_band_bounds with the edges in force for (team, date) from team_fr_band_config
--      (legacy 0-8-12-15-18-21-24-27-100 when the team has none) — unless the writer already set them;
--   2. fills ima_fr_ge18_* / ima_fr_ge24_* by summing the bands whose lower edge is ≥18 s / ≥24 s;
--   3. sets ima_fr_band58_total_distance = metres in runs ≥18 s, so its many readers keep their meaning.
-- A tier field is null when every contributing band is null ("no reading"), never 0.

create or replace function public.ima_fr_fill_tiers() returns trigger
language plpgsql as $$
declare
  b numeric[];
  i int;
  start18 int;
  start24 int;
  has_fr boolean;
  ev int[]; du numeric[]; st numeric[]; di numeric[]; pl numeric[];
begin
  ev := array[new.ima_fr_band1_event_count, new.ima_fr_band2_event_count, new.ima_fr_band3_event_count, new.ima_fr_band4_event_count,
              new.ima_fr_band5_event_count, new.ima_fr_band6_event_count, new.ima_fr_band7_event_count, new.ima_fr_band8_event_count];
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

  if new.ima_fr_band_bounds is null or array_length(new.ima_fr_band_bounds, 1) <> 9 then
    select c.bounds_s into b from public.team_fr_band_config c
     where c.team_id = new.team_id and c.effective_from <= new.date
     order by c.effective_from desc limit 1;
    new.ima_fr_band_bounds := coalesce(b, array[0,8,12,15,18,21,24,27,100]::numeric[]);
  end if;
  b := new.ima_fr_band_bounds;

  start18 := null; start24 := null;
  for i in 1..8 loop
    if b[i] = 18 then start18 := i; end if;
    if b[i] = 24 then start24 := i; end if;
  end loop;

  if start18 is not null then
    new.ima_fr_ge18_event_count     := (select case when count(x) = 0 then null else sum(x) end from unnest(ev[start18:8]) x);
    new.ima_fr_ge18_total_duration  := (select case when count(x) = 0 then null else sum(x) end from unnest(du[start18:8]) x);
    new.ima_fr_ge18_stride_count    := (select case when count(x) = 0 then null else sum(x) end from unnest(st[start18:8]) x);
    new.ima_fr_ge18_total_distance  := (select case when count(x) = 0 then null else sum(x) end from unnest(di[start18:8]) x);
    new.ima_fr_ge18_total_player_load := (select case when count(x) = 0 then null else sum(x) end from unnest(pl[start18:8]) x);
    -- Keep a writer-supplied band58 (e.g. older CSV imports that carry only the rollup) when the per-band
    -- distances are absent; it means "≥18 s" only under the legacy edges (start18 = 5).
    if new.ima_fr_ge18_total_distance is not null then
      new.ima_fr_band58_total_distance := new.ima_fr_ge18_total_distance;
    elsif start18 = 5 and new.ima_fr_band58_total_distance is not null then
      new.ima_fr_ge18_total_distance := new.ima_fr_band58_total_distance;
    elsif start18 <> 5 then
      new.ima_fr_band58_total_distance := null;
    end if;
  end if;
  if start24 is not null then
    new.ima_fr_ge24_event_count     := (select case when count(x) = 0 then null else sum(x) end from unnest(ev[start24:8]) x);
    new.ima_fr_ge24_total_duration  := (select case when count(x) = 0 then null else sum(x) end from unnest(du[start24:8]) x);
    new.ima_fr_ge24_stride_count    := (select case when count(x) = 0 then null else sum(x) end from unnest(st[start24:8]) x);
    new.ima_fr_ge24_total_distance  := (select case when count(x) = 0 then null else sum(x) end from unnest(di[start24:8]) x);
    new.ima_fr_ge24_total_player_load := (select case when count(x) = 0 then null else sum(x) end from unnest(pl[start24:8]) x);
  end if;
  return new;
end $$;

drop trigger if exists trg_ima_fr_fill_tiers on public.player_external_load_daily;
create trigger trg_ima_fr_fill_tiers
  before insert or update on public.player_external_load_daily
  for each row execute function public.ima_fr_fill_tiers();
