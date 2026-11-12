-- Bar-speed (VBT) method on a PT client's prescribed exercise — Weakley et al. 2021, Table 5.
-- Shape: { method, targetVelocity?, velocityMin?, velocityMax?, velocityLossPct?, repCap?, totalReps? }
-- (VbtPrescription in src/lib/micropulse/vbtMethods). Written by the plan assign route after
-- sanitizeVbtPrescription; read by /api/client/today and /api/trainer/plans/[id]. Additive, nullable.
alter table public.individual_training_prescriptions add column if not exists vbt jsonb;

comment on column public.individual_training_prescriptions.vbt is
  'Bar-speed method for this exercise (Weakley et al. 2021, Table 5): {method, targetVelocity?, velocityMin?, velocityMax?, velocityLossPct?, repCap?, totalReps?}. Instruction only; the app does not measure bar speed.';
