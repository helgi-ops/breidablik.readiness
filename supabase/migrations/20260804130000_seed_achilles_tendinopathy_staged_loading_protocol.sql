-- Player-facing protocol for the coach "Send to a player" button on
-- /coach/achilles-tendinopathy. Four staged calf/plantarflexor loading phases.
-- Insertional caveat carried inline (no step / floor-to-neutral). Team-scoped to
-- Breiðablik. Idempotent: only inserts if the slug is not already present.
INSERT INTO public.recovery_protocols
  (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, team_id)
SELECT
  'achilles_tendinopathy_staged_loading',
  'Achilles Tendinopathy — Staged Tendon Loading',
  'rehab',
  'mixed',
  30,
  'Player diagnosed with Achilles tendinopathy (midportion or insertional). Criteria-based staged calf loading — insertional avoids dorsiflexion / the step.',
  'Restore plantarflexor load tolerance and return to sport through four staged loading phases, gated by a pain-monitoring model and heel-raise / hop symmetry.',
  'Achilles pain with load. Classify first: midportion (2-6 cm above the heel, full range OK) vs insertional (at the heel bone, no dorsiflexion beyond neutral).',
  '[
    {
      "title": "Stage 1 · Isometric loading — pain relief & load tolerance",
      "duration_min": 12,
      "description": "For the irritable tendon. Isometric plantarflexion gives an analgesic window and starts loading. Keep all non-provocative strength at normal load. Every hold at an acceptable pain level (pain up to 5/10, must settle by next morning).",
      "drills": [
        { "name": "Isometric heel-raise hold (double -> single leg), mid-range", "cues": ["5 x 45 s, 2-3x per day", "Acceptable pain level (<=5/10)", "INSERTIONAL: hold on the floor at neutral — NOT off a step, no dorsiflexion"], "reps_or_time": "5 x 45 s" },
        { "name": "Non-provocative strength (knee, hip, trunk, uninjured side)", "cues": ["Keep at normal load — do not detrain the rest of the body"], "reps_or_time": "normal" }
      ]
    },
    {
      "title": "Stage 2 · Isotonic / HSR + eccentric heel raises — tendon remodeling",
      "duration_min": 30,
      "description": "The core. Two evidence-based routes; both work — pick per clinician/equipment. Run for a minimum 12 weeks. Pain during loading allowed up to the gate; morning stiffness is the key day-to-day marker.",
      "drills": [
        { "name": "HSR calf raises — seated (soleus, bent knee) + standing (gastroc, straight knee)", "cues": ["3-4 sets, slow 6 s tempo (3 s up / 3 s down)", "3x per week on alternate days", "Progressive load: 15RM -> 6RM over ~12 weeks"], "reps_or_time": "3-4 sets" },
        { "name": "Alfredson eccentric heel-drop (MIDPORTION ONLY)", "cues": ["3 x 15, twice daily, 7 days/week, 12 weeks", "Straight-knee and bent-knee, off a step (below neutral)", "Progress load with a loaded backpack", "INSERTIONAL: do NOT use the step — floor to neutral only"], "reps_or_time": "3 x 15 x2/day" }
      ]
    },
    {
      "title": "Stage 3 · Energy-storage loading — reintroduce the spring",
      "duration_min": 20,
      "description": "Only once pain is controlled at Stage 2 loads AND calf/hop criteria are met (single-leg heel-raise / hop LSI >= 90% vs the uninjured side). Progressive plyometrics reload the stretch-shortening cycle. Every 3rd day. Progress by symmetry, not by feel.",
      "drills": [
        { "name": "Bilateral pogo / skip -> single-leg hops -> bounding -> progressive running", "cues": ["Low to high stretch-shortening demand", "Land soft and quiet", "Every 3rd day"], "reps_or_time": "progressive" },
        { "name": "Track intensity via CMJ RSI-modified + single-leg hop symmetry", "cues": ["Progress by limb symmetry, not by feel"], "reps_or_time": "monitor" }
      ]
    },
    {
      "title": "Stage 4 · Energy storage + release — return to sport",
      "duration_min": 30,
      "description": "Sport-specific running, acceleration/deceleration and cutting, graded back to full training along a control -> chaos continuum (planned -> reactive, low -> high speed/volume). Pain-monitored throughout.",
      "drills": [
        { "name": "Control -> chaos progression (planned -> reactive drills)", "cues": ["Low to high speed and volume", "Add acceleration/deceleration and cutting gradually"], "reps_or_time": "graded" },
        { "name": "Sport-specific running & repeated-effort work", "cues": ["Pain-monitored throughout (<=5/10, settles by morning)", "Reduced minutes first, build over 2-3 weeks"], "reps_or_time": "graded return" }
      ]
    }
  ]'::jsonb,
  '[
    { "label": "Silbernagel et al. — Continued sports activity using a pain-monitoring model in Achilles tendinopathy (pain gate + VISA-A)", "source": "Am J Sports Med 2007" },
    { "label": "Achilles Tendinopathy: Evaluation, Rehabilitation, and Prevention (midportion vs insertional, Alfredson eccentric protocol)", "source": "review" },
    { "label": "Achilles and Patellar Tendinopathy Loading Programmes — A Systematic Review (HSR vs eccentric)", "source": "Sports Med" },
    { "label": "A Proposed Return-to-Sport Program for Midportion Achilles Tendinopathy (Stage 4 RTS template)", "source": "IJSPT" },
    { "label": "Physical therapies for Achilles tendinopathy: systematic review and meta-analysis", "source": "systematic review" }
  ]'::jsonb,
  true,
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.recovery_protocols WHERE slug = 'achilles_tendinopathy_staged_loading'
);
