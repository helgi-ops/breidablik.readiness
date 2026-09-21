-- Body composition: extend player_body_metrics with the skinfold/circumference → %fat layer.
-- Weight + height already live here; a body-comp session sets these fields alongside a weight.
-- Descriptive monitoring only — never a readiness/decision input. RLS is inherited (unchanged).

alter table public.player_body_metrics
  add column if not exists body_fat_pct     numeric check (body_fat_pct >= 2 and body_fat_pct <= 60),
  add column if not exists bf_method        text,      -- 'jp3' | 'jp7' | 'navy' | 'manual'
  add column if not exists skinfolds_mm     jsonb,     -- { chest, abdomen, thigh, triceps, suprailiac, subscapular, midaxillary }
  add column if not exists girths_cm        jsonb,     -- { neck, waist, hip }
  add column if not exists sum_skinfolds_mm numeric,
  add column if not exists lean_mass_kg     numeric,
  add column if not exists sex              text,      -- 'M' | 'F' (equations need it; per measurement or from player)
  add column if not exists age_years        numeric;   -- at measurement (JP equations need age)

comment on column public.player_body_metrics.body_fat_pct is 'Estimated body-fat % (Jackson-Pollock→Siri/Brožek or US Navy). ±3–5% estimate — individual-trend monitoring, never a verdict/target.';
comment on column public.player_body_metrics.bf_method is 'jp3 | jp7 | navy | manual — the method used, for consistency tracking.';
