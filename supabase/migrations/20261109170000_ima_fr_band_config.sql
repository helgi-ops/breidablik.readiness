-- IMA Free Running band configuration per team, with effective dates (Nov 2026).
--
-- Why: FR bands are effort-DURATION bands in seconds (Catapult, Nov 2026) and their bounds are set per
-- org/athlete in OpenField → Settings → Bands. Breiðablik changed them on 9 Nov 2026 from
-- 0-8-12-15-18-21-24-27-100 to 0-2.5-5-8-12-18-24-30-1000 (Catapult's default 0-2.5-5 at the bottom).
-- Catapult applies bands at PROCESSING time: a stats query for 24 Oct after the change still returned the
-- old classification. So "band 5" means different run lengths before and after a change, and every row
-- must carry the bounds it was classified with.
--
-- What this adds:
--   * team_fr_band_config         — bounds (9 edges, seconds) per team from an effective date.
--   * player_external_load_daily  — ima_fr_band_bounds (the edges the row's bands use) and two
--     config-independent tiers computed at sync time:
--        ima_fr_ge18_*  — efforts lasting ≥18 s ("long runs")
--        ima_fr_ge24_*  — efforts lasting ≥24 s ("longest runs")
--     18 s and 24 s are band edges in both Breiðablik configs, so the tiers are continuous across the change.
--   * ima_fr_band58_total_distance keeps its meaning for downstream readers: metres in efforts ≥18 s
--     (= bands 5-8 in the old config, 6-8 in the new one). The sync now fills it from the config.

create table if not exists public.team_fr_band_config (
  team_id uuid not null references public.teams(id) on delete cascade,
  effective_from date not null,
  bounds_s numeric[] not null check (array_length(bounds_s, 1) = 9),
  source text not null default 'openfield',
  note text,
  created_at timestamptz not null default now(),
  primary key (team_id, effective_from)
);
alter table public.team_fr_band_config enable row level security;
comment on table public.team_fr_band_config is
  'IMA Free Running band edges (seconds of effort duration, 9 edges for 8 bands) per team from effective_from. Bands are applied by Catapult at processing time, so the config in force on a session date is the one that classified it.';

insert into public.team_fr_band_config (team_id, effective_from, bounds_s, note) values
  ('94b52a06-0b83-48da-8664-639ec3486a0c', '2026-01-01', array[0,8,12,15,18,21,24,27,100]::numeric[],
   'Original OpenField setting (entered as if km/h; Catapult applies them as seconds).'),
  ('94b52a06-0b83-48da-8664-639ec3486a0c', '2026-11-10', array[0,2.5,5,8,12,18,24,30,1000]::numeric[],
   'Changed 9 Nov 2026 17:04 on Catapult advice: default 0-2.5-5 at the bottom, 18 s / 24 s edges kept.')
on conflict (team_id, effective_from) do nothing;

alter table public.player_external_load_daily
  add column if not exists ima_fr_band_bounds numeric[],
  add column if not exists ima_fr_ge18_event_count integer,
  add column if not exists ima_fr_ge18_total_duration numeric,
  add column if not exists ima_fr_ge18_stride_count numeric,
  add column if not exists ima_fr_ge18_total_distance numeric,
  add column if not exists ima_fr_ge18_total_player_load numeric,
  add column if not exists ima_fr_ge24_event_count integer,
  add column if not exists ima_fr_ge24_total_duration numeric,
  add column if not exists ima_fr_ge24_stride_count numeric,
  add column if not exists ima_fr_ge24_total_distance numeric,
  add column if not exists ima_fr_ge24_total_player_load numeric;

comment on column public.player_external_load_daily.ima_fr_band_bounds is 'Band edges (s) the ima_fr_band1..8 columns of this row were classified with (team_fr_band_config on the row date; legacy 0-8-12-15-18-21-24-27-100 when the team has no config).';
comment on column public.player_external_load_daily.ima_fr_ge18_event_count is 'Free-running efforts lasting ≥18 s ("long runs"), summed over the bands whose lower edge ≥18 s. Config-independent.';
comment on column public.player_external_load_daily.ima_fr_ge24_event_count is 'Free-running efforts lasting ≥24 s ("longest runs"). Config-independent.';

-- Backfill: every existing row was classified with the legacy edges (Breiðablik before 10 Nov; HK and demo
-- teams have no config, legacy assumed — same assumption the app already made). ≥18 s = bands 5-8,
-- ≥24 s = bands 7-8. Sums keep null when every part is null.
update public.player_external_load_daily set
  ima_fr_band_bounds = array[0,8,12,15,18,21,24,27,100]::numeric[],
  ima_fr_ge18_event_count = case when num_nonnulls(ima_fr_band5_event_count, ima_fr_band6_event_count, ima_fr_band7_event_count, ima_fr_band8_event_count) = 0 then null
    else coalesce(ima_fr_band5_event_count,0)+coalesce(ima_fr_band6_event_count,0)+coalesce(ima_fr_band7_event_count,0)+coalesce(ima_fr_band8_event_count,0) end,
  ima_fr_ge18_total_duration = case when num_nonnulls(ima_fr_band5_total_duration, ima_fr_band6_total_duration, ima_fr_band7_total_duration, ima_fr_band8_total_duration) = 0 then null
    else coalesce(ima_fr_band5_total_duration,0)+coalesce(ima_fr_band6_total_duration,0)+coalesce(ima_fr_band7_total_duration,0)+coalesce(ima_fr_band8_total_duration,0) end,
  ima_fr_ge18_stride_count = case when num_nonnulls(ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count) = 0 then null
    else coalesce(ima_fr_band5_stride_count,0)+coalesce(ima_fr_band6_stride_count,0)+coalesce(ima_fr_band7_stride_count,0)+coalesce(ima_fr_band8_stride_count,0) end,
  ima_fr_ge18_total_distance = ima_fr_band58_total_distance,
  ima_fr_ge18_total_player_load = case when num_nonnulls(ima_fr_band5_total_player_load, ima_fr_band6_total_player_load, ima_fr_band7_total_player_load, ima_fr_band8_total_player_load) = 0 then null
    else coalesce(ima_fr_band5_total_player_load,0)+coalesce(ima_fr_band6_total_player_load,0)+coalesce(ima_fr_band7_total_player_load,0)+coalesce(ima_fr_band8_total_player_load,0) end,
  ima_fr_ge24_event_count = case when num_nonnulls(ima_fr_band7_event_count, ima_fr_band8_event_count) = 0 then null
    else coalesce(ima_fr_band7_event_count,0)+coalesce(ima_fr_band8_event_count,0) end,
  ima_fr_ge24_total_duration = case when num_nonnulls(ima_fr_band7_total_duration, ima_fr_band8_total_duration) = 0 then null
    else coalesce(ima_fr_band7_total_duration,0)+coalesce(ima_fr_band8_total_duration,0) end,
  ima_fr_ge24_stride_count = case when num_nonnulls(ima_fr_band7_stride_count, ima_fr_band8_stride_count) = 0 then null
    else coalesce(ima_fr_band7_stride_count,0)+coalesce(ima_fr_band8_stride_count,0) end,
  ima_fr_ge24_total_distance = case when num_nonnulls(ima_fr_band7_total_distance, ima_fr_band8_total_distance) = 0 then null
    else coalesce(ima_fr_band7_total_distance,0)+coalesce(ima_fr_band8_total_distance,0) end,
  ima_fr_ge24_total_player_load = case when num_nonnulls(ima_fr_band7_total_player_load, ima_fr_band8_total_player_load) = 0 then null
    else coalesce(ima_fr_band7_total_player_load,0)+coalesce(ima_fr_band8_total_player_load,0) end
where ima_fr_band_bounds is null
  and num_nonnulls(ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count,
                   ima_fr_band5_event_count, ima_fr_band8_event_count, ima_fr_band5_total_duration, ima_fr_band58_total_distance) > 0;
