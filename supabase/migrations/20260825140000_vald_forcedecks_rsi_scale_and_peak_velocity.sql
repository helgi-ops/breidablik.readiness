-- VALD ForceDecks CMJ: fix RSI-modified scale + add concentric peak velocity,
-- and backfill concentric RFD (the normalizer was reading the wrong result key).
-- Descriptive assessment data only -- none of this touches the readiness colour.
--
-- RSI-modified: VALD's API returns it (unit "RSIModified") x100 vs the standard
-- ratio the ForceDecks app displays (e.g. 52.5 -> 0.525). The normalizer now
-- divides by 100; this backfills the historical rows. Real RSI-mod never exceeds
-- ~1.5, and every stored row is source='vald' and > 3, so the guard is exact.

alter table public.vald_forcedecks_results
  add column if not exists concentric_peak_velocity_m_s numeric;

comment on column public.vald_forcedecks_results.concentric_peak_velocity_m_s is
  'CMJ concentric peak velocity (m/s), VALD PEAK_TAKEOFF_VELOCITY. Descriptive.';

-- Fix the RSI-modified scale on existing rows (all source=vald, all x100).
update public.vald_forcedecks_results
  set rsi_mod = rsi_mod / 100
  where rsi_mod_source = 'vald' and rsi_mod > 3;

-- Backfill concentric RFD (rfd_n_s, previously null -- wrong key) + the new
-- concentric peak velocity from the raw payload, per trial. Both are stored
-- as-is by VALD (Newton Per Second, Meter Per Second) -- no unit conversion.
with tr as (
  select rt.id as raw_test_id, ord::int as trial_number, trial_json
  from public.vald_raw_tests rt,
       lateral jsonb_array_elements(rt.payload->'trials') with ordinality as t(trial_json, ord)
  where rt.product = 'forcedecks'
),
vals as (
  select tr.raw_test_id, tr.trial_number,
    max(case when res->'definition'->>'result' = 'CONCENTRIC_RFD'
             and coalesce(res->>'limb', 'Trial') in ('Trial', 'Both')
             then (res->>'value')::numeric end) as rfd,
    max(case when res->'definition'->>'result' = 'PEAK_TAKEOFF_VELOCITY'
             and coalesce(res->>'limb', 'Trial') in ('Trial', 'Both')
             then (res->>'value')::numeric end) as vel
  from tr, lateral jsonb_array_elements(tr.trial_json->'results') res
  group by tr.raw_test_id, tr.trial_number
)
update public.vald_forcedecks_results r
  set rfd_n_s = coalesce(r.rfd_n_s, v.rfd),
      concentric_peak_velocity_m_s = coalesce(r.concentric_peak_velocity_m_s, v.vel)
  from vals v
  where r.raw_test_id = v.raw_test_id and r.trial_number = v.trial_number;
