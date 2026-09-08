-- Append the same uniform "Tendon loading dose & collagen nutrition (Baar)"
-- section + Baar citations to the calf-strain staged-loading protocol, matching
-- the jumper's-knee / Achilles / adductor rows (migration 20260908140000). The
-- isometric calf loading (soleus-tolerance entry) is exactly where Baar's dosing
-- applies. Idempotent: skips if the Baar section is already present.
UPDATE public.recovery_protocols
SET
  sections = sections || '[
    {
      "title": "Tendon loading dose & collagen nutrition (Baar)",
      "duration_min": 10,
      "evidence_tier": "mixed",
      "description": "How to DOSE the isometric calf holds above for tendon/muscle-tendon adaptation (Keith Baar). Collagen-synthesis signalling (ERK1/2) plateaus within ~10 min of loading and the tissue then needs a recovery window, so favour short, frequent bouts over one long session: ~10 min of loading, 1-3x per day, separated by ~6 h. Frequency over duration. Optional nutrition timing: consider ~15 g gelatin/collagen + vitamin C ~45 min BEFORE a bout (the amino-acid bolus must be available during the low-blood-flow loading window) and avoid caffeine around it. Mechanistically strong (in-vitro/rodent mechanism + a human collagen-synthesis blood marker), clinical-outcome emerging - a well-reasoned dosing rule, not a cure claim. Nutrition is guidance, not medical advice. Pain / diagnosis -> clinician.",
      "drills": [
        { "name": "Dose the isometric calf holds as short, frequent bouts", "cues": ["~10 min of loading per bout", "1-3x per day, ~6 h apart", "Frequency over duration - a longer single session adds little"], "reps_or_time": "~10 min x 1-3/day" },
        { "name": "Optional: collagen nutrition timing (consider)", "cues": ["~15 g gelatin/collagen + vitamin C ~45 min before the bout", "Avoid caffeine around the loading window", "Emerging (blood-marker) evidence - nutrition guidance, not medical advice"], "reps_or_time": "~45 min pre-load" }
      ]
    }
  ]'::jsonb,
  citations = COALESCE(citations, '[]'::jsonb) || '[
    { "label": "Baar 2017 - Minimizing Injury and Maximizing Return to Play: Lessons from Engineered Ligaments", "source": "Sports Med" },
    { "label": "Paxton et al. 2012 - Optimizing an intermittent stretch paradigm (ERK1/2 phosphorylation plateaus ~10 min)", "source": "Tissue Eng Part A" },
    { "label": "Shaw, Lee-Barthel, Ross, Wang, Baar 2017 - Vitamin C-enriched gelatin before intermittent activity augments collagen synthesis", "source": "Am J Clin Nutr" }
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'calf_strain_staged_loading'
AND sections::text NOT LIKE '%Tendon loading dose & collagen nutrition (Baar)%';
