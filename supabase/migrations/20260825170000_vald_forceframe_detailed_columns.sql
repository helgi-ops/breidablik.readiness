-- ForceFrame "detailed test" CSV exports carry more than the lean Test-Metrics
-- export: a Direction (Pull/Squeeze/Push...) that distinguishes the two movements
-- measured together (e.g. Hip abduction vs adduction), plus average force and
-- rate-of-force-development. Promote the coach-useful subset into typed columns
-- so ANY ForceFrame protocol can be registered and surfaced; the full row still
-- lives in vald_raw_tests.payload. Time-banded RFD/impulse stay in the raw row.
alter table public.vald_forceframe_results
  add column if not exists direction text,
  add column if not exists left_avg_force_n numeric,
  add column if not exists right_avg_force_n numeric,
  add column if not exists left_max_rfd_n_s numeric,
  add column if not exists right_max_rfd_n_s numeric;
