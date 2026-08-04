-- Player-facing protocol for the coach "Send to a player" button on
-- /coach/ankle-sprain. Grade I-II lateral (inversion) ankle sprain — early
-- functional loading + a balance/proprioception pillar. Team-scoped Breiðablik.
INSERT INTO public.recovery_protocols
  (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, team_id)
SELECT
  'lateral_ankle_sprain_staged_loading',
  'Lateral Ankle Sprain (Grade I–II) — Staged Loading',
  'rehab',
  'moderate',
  20,
  'Player with a Grade I-II lateral (inversion) ankle sprain — ATFL ± CFL. Ottawa Ankle Rules negative (no fracture). Grade III / gross instability is out of scope — refer.',
  'Restore ankle load tolerance, strength and dynamic balance and return to sport through staged functional loading, gated by pain + hop/balance symmetry, never the calendar.',
  'Rolled the ankle inward, lateral pain/swelling. Confirm Grade I-II and negative Ottawa rules first.',
  '[
    {
      "title": "Stage 1 · Protect & early load — pain/swelling control + ROM",
      "duration_min": 12,
      "description": "PEACE & LOVE — protect briefly, then load early (early functional loading beats rest/immobilisation). Weight-bear as pain allows; Grade II may use a brace/tape for a short protected phase. Keep everything pain-free early; avoid provoking end-range inversion. Every drill at an acceptable pain level (<=5/10, settles by next morning).",
      "drills": [
        { "name": "Protected weight-bearing + normal gait", "cues": ["Weight-bear as pain allows — aim for a normal heel-to-toe pattern", "GRADE II: brace/tape support for the first protected days"], "reps_or_time": "as tolerated" },
        { "name": "Pain-free ankle ROM (ankle alphabet, dorsi/plantarflexion, gentle eversion)", "cues": ["Pain-free range only", "Avoid forced end-range inversion early"], "reps_or_time": "3-5 min, several times/day" },
        { "name": "Isometric eversion / inversion / calf (pain-free)", "cues": ["Push against a wall or band, hold, breathe", "Analgesic + early activation of the peroneals"], "reps_or_time": "5 x 20-30 s" },
        { "name": "Swelling control — compression, elevation, movement", "cues": ["Movement pumps swelling out — do not just rest and ice"], "reps_or_time": "ongoing" }
      ]
    },
    {
      "title": "Stage 2 · Loading & strength + early balance",
      "duration_min": 20,
      "description": "Build calf + peroneal strength (the peroneals are the dynamic ankle stabilisers, eversion emphasis) and START the balance pillar. Pain during loading allowed up to the gate; swelling must not increase.",
      "drills": [
        { "name": "Calf raises (double -> single) + theraband eversion / inversion / dorsi / plantarflexion", "cues": ["3 x 15, progressive load", "Eversion (peroneal) emphasis"], "reps_or_time": "3 x 15" },
        { "name": "Single-leg balance progression (eyes open -> eyes closed -> firm -> foam)", "cues": ["Start the proprioception work early — it is what lowers re-sprain risk", "30-45 s holds, build time"], "reps_or_time": "3-5 x 30-45 s" }
      ]
    },
    {
      "title": "Stage 3 · Proprioception + energy storage",
      "duration_min": 20,
      "description": "Only once pain is controlled and hop/balance symmetry is building (LSI >= ~80-90%). Reactive balance + progressive hopping restore dynamic control and the spring. Track hop LSI + Y-balance symmetry.",
      "drills": [
        { "name": "Reactive balance — wobble board / BOSU, perturbations, Y-balance reaches", "cues": ["Single-leg, add head turns / ball catches / eyes closed", "Every 2nd-3rd day"], "reps_or_time": "progressive" },
        { "name": "Progressive hopping — bilateral -> single-leg -> multidirectional", "cues": ["Land soft and controlled, no wobble", "Progress by symmetry, not by feel"], "reps_or_time": "progressive" }
      ]
    },
    {
      "title": "Stage 4 · Return to sport — agility & change of direction",
      "duration_min": 20,
      "description": "Sport-specific cutting, pivoting and deceleration, graded back to full training along a control -> chaos continuum. A brace/tape for early return reduces re-sprain. Criteria to clear: hop LSI >= 90%, symmetric balance, no pain/swelling, confidence.",
      "drills": [
        { "name": "Control -> chaos agility (planned -> reactive cutting, low -> high speed)", "cues": ["Add deceleration and change-of-direction volume before intensity"], "reps_or_time": "graded" },
        { "name": "Sport-specific return with brace/tape early", "cues": ["Bracing/taping for the first weeks back lowers re-sprain risk", "Pain-monitored throughout"], "reps_or_time": "graded return" }
      ]
    }
  ]'::jsonb,
  '[
    { "label": "Dubois & Esculier 2020 — PEACE & LOVE (soft-tissue injury management)", "source": "Br J Sports Med" },
    { "label": "Vuurberg et al. 2018 — Diagnosis, treatment & prevention of ankle sprains: update of an evidence-based guideline", "source": "Br J Sports Med" },
    { "label": "Doherty et al. 2017 — Treatment & prevention of acute & recurrent ankle sprain (systematic review)", "source": "Br J Sports Med" },
    { "label": "Stiell et al. — Ottawa Ankle Rules (rule out fracture)", "source": "JAMA / BMJ" },
    { "label": "FAAM (Foot & Ankle Ability Measure) + CAIT (Cumberland Ankle Instability Tool) — outcomes", "source": "outcome measures" }
  ]'::jsonb,
  true,
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.recovery_protocols WHERE slug = 'lateral_ankle_sprain_staged_loading'
);
