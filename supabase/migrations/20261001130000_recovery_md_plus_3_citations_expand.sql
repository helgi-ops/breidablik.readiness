-- Fuller provenance for the MD+3 Reload Readiness protocol (explainability-first): add the
-- biochemical-residual and female-recovery reviews alongside the time-course + isometric citations.
update recovery_protocols
set citations = '[
  {"label":"Drayton et al. 2025 — Time course of postmatch physical impairments","source":"J Strength Cond Res"},
  {"label":"Silva et al. 2018 — Acute and residual soccer match-related fatigue","source":"Sports Med"},
  {"label":"Doeven et al. 2018 — Postmatch recovery of physical performance and biochemical markers","source":"BMJ Open Sport Exerc Med"},
  {"label":"Goulart et al. 2022 — Fatigue and recovery time course after female soccer matches","source":"Sports Med Open"},
  {"label":"Rio et al. 2015 — Isometric exercise reduces tendon pain","source":"Br J Sports Med"}
]'::jsonb
where slug = 'md_plus_3_reload_readiness';
