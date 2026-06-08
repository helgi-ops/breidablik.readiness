-- Carry exercise grouping through plan assignment so the client knows whether
-- an exercise is standalone or part of a superset / triset / giant set /
-- contrast pair / french-contrast complex.
--
-- The template structure already encodes this (session.method + groups[].label),
-- but the assign flow flattened it away. These columns let each prescription
-- remember which authored group it came from and the session's method.
alter table public.individual_training_prescriptions
  add column if not exists group_label text,
  add column if not exists method text;

comment on column public.individual_training_prescriptions.group_label is
  'Authored group label (A/B/C) this exercise belongs to. Consecutive rows sharing a label are performed together (superset/triset/giant/contrast).';
comment on column public.individual_training_prescriptions.method is
  'Session method carried onto the row (superset|contrast|french_contrast|straight|…) so the client can label the block and explain how to run it.';
