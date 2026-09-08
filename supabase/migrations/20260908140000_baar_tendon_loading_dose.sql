-- Wire Keith Baar's tendon-loading dosing + collagen-nutrition timing into the
-- DB-seeded tendon staged-loading protocols (jumper's knee / Achilles / adductor).
-- Adds ONE uniform trailing section ("Tendon loading dose & collagen nutrition
-- (Baar)") that tells the coach HOW to dose the isometric/loading holds already in
-- the protocol — short (~10 min) bouts, 1–3×/day, ~6 h apart (frequency over
-- duration), with an optional pre-load collagen-nutrition prompt — plus the Baar
-- citations. Mechanistically strong / clinical-outcome emerging; never a cure
-- claim, never the readiness colour; pain/diagnosis → clinician.
-- Idempotent: skips rows that already carry the Baar section.
UPDATE public.recovery_protocols
SET
  sections = sections || '[
    {
      "title": "Tendon loading dose & collagen nutrition (Baar)",
      "duration_min": 10,
      "evidence_tier": "mixed",
      "description": "How to DOSE the isometric / loading holds above for tendon adaptation (Keith Baar). Collagen-synthesis signalling (ERK1/2) plateaus within ~10 min of loading and the tendon then needs a recovery window, so favour short, frequent bouts over one long session: ~10 min of loading, 1-3x per day, separated by ~6 h. Frequency over duration. Optional nutrition timing: consider ~15 g gelatin/collagen + vitamin C ~45 min BEFORE a bout (the amino-acid bolus must be available during the low-blood-flow loading window) and avoid caffeine around it. Mechanistically strong (in-vitro/rodent mechanism + a human collagen-synthesis blood marker), clinical-outcome emerging - a well-reasoned dosing rule, not a cure claim. Nutrition is guidance, not medical advice. Pain / diagnosis -> clinician.",
      "drills": [
        { "name": "Dose the Stage 1 isometric holds as short, frequent bouts", "cues": ["~10 min of loading per bout", "1-3x per day, ~6 h apart", "Frequency over duration - a longer single session adds little"], "reps_or_time": "~10 min x 1-3/day" },
        { "name": "Optional: collagen nutrition timing (consider)", "cues": ["~15 g gelatin/collagen + vitamin C ~45 min before the bout", "Avoid caffeine around the loading window", "Emerging (blood-marker) evidence - nutrition guidance, not medical advice"], "reps_or_time": "~45 min pre-load" }
      ]
    }
  ]'::jsonb,
  citations = COALESCE(citations, '[]'::jsonb) || '[
    { "label": "Baar 2017 - Minimizing Injury and Maximizing Return to Play: Lessons from Engineered Ligaments", "source": "Sports Med" },
    { "label": "Paxton et al. 2012 - Optimizing an intermittent stretch paradigm (ERK1/2 phosphorylation plateaus ~10 min)", "source": "Tissue Eng Part A" },
    { "label": "Baar 2019 - Stress Relaxation and Targeted Nutrition to Treat Patellar Tendinopathy", "source": "Int J Sport Nutr Exerc Metab" },
    { "label": "Shaw, Lee-Barthel, Ross, Wang, Baar 2017 - Vitamin C-enriched gelatin before intermittent activity augments collagen synthesis", "source": "Am J Clin Nutr" }
  ]'::jsonb,
  updated_at = now()
WHERE slug IN (
  'jumpers_knee_staged_loading',
  'achilles_tendinopathy_staged_loading',
  'adductor_related_groin_staged_loading'
)
AND sections::text NOT LIKE '%Tendon loading dose & collagen nutrition (Baar)%';
