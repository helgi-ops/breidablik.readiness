-- Player-facing protocol for the coach "Send to a player" button on
-- /coach/adductor-groin. Four staged adductor loading phases (Hölmich active
-- training + Copenhagen Adduction). Team-scoped to Breiðablik. Idempotent.
INSERT INTO public.recovery_protocols
  (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, team_id)
SELECT
  'adductor_related_groin_staged_loading',
  'Adductor-Related Groin — Staged Loading',
  'rehab',
  'mixed',
  25,
  'Player with adductor-related groin pain (Doha agreement). Pain on resisted adduction + adductor-origin tenderness. Criteria-based staged loading — progression by pain + squeeze symmetry, never the calendar.',
  'Restore adductor load tolerance and return to sport through four staged loading phases, gated by a pain-monitoring model and adductor squeeze symmetry.',
  'Groin pain with kicking / cutting; positive adductor squeeze test; adductor-origin tenderness. Rule out iliopsoas, inguinal, pubic and hip-related groin pain.',
  '[
    {
      "title": "Stage 1 · Isometric adduction — pain relief & load tolerance",
      "duration_min": 12,
      "description": "For the irritable groin. Isometric adduction (ball/cushion squeeze) gives an analgesic window, activates the adductors and starts loading. Keep all non-provocative strength at normal load. Every hold at an acceptable pain level (pain up to 5/10, must settle by next morning).",
      "drills": [
        { "name": "Isometric ball/cushion squeeze — supine (short lever, knees bent 90°) -> long lever (knees extended)", "cues": ["5 x 30-45 s, submaximal -> progressive", "2-3x per day", "Acceptable pain level (<=5/10)", "Start short-lever when very irritable; progress to long-lever"], "reps_or_time": "5 x 30-45 s" },
        { "name": "Non-provocative strength (posterior chain, trunk, uninjured side)", "cues": ["Keep at normal load — do not detrain the rest of the body"], "reps_or_time": "normal" }
      ]
    },
    {
      "title": "Stage 2 · Isotonic / HSR + Copenhagen Adduction — remodeling",
      "duration_min": 25,
      "description": "The core, built on the Hölmich active-training RCT + the Copenhagen Adduction (high adductor EMG, eccentric-biased). Run ~8-12 weeks. Pain during loading allowed up to the gate; morning soreness is the day-to-day marker.",
      "drills": [
        { "name": "Copenhagen Adduction progression — short lever (knee on bench) -> long lever (foot on bench) -> full", "cues": ["3 sets, progressive reps and range", "3x per week on alternate days", "High adductor EMG; control the lower-down (eccentric)"], "reps_or_time": "3 sets" },
        { "name": "HSR hip adduction (cable / machine / band) — standing + side-lying", "cues": ["3-4 sets, slow 6 s tempo (3 s in / 3 s out)", "Progressive load: 15RM -> 6RM over ~8-12 weeks"], "reps_or_time": "3-4 sets" }
      ]
    },
    {
      "title": "Stage 3 · Energy-storage / change-of-direction loading",
      "duration_min": 20,
      "description": "Only once pain is controlled at Stage 2 loads AND squeeze symmetry is restored (adductor squeeze LSI >= 90% and adduction:abduction ratio ~1.0). Progressive reactive + change-of-direction loading. Every 2nd-3rd day. Progress by symmetry, not by feel.",
      "drills": [
        { "name": "Lateral bounds -> skater hops -> deceleration -> controlled change of direction", "cues": ["Low to high demand", "Land soft, control the plant leg", "Every 2nd-3rd day"], "reps_or_time": "progressive" },
        { "name": "Track adductor squeeze strength symmetry + CoD tolerance", "cues": ["Progress by squeeze symmetry, not by feel"], "reps_or_time": "monitor" }
      ]
    },
    {
      "title": "Stage 4 · Return to sport — cutting & kicking",
      "duration_min": 25,
      "description": "Sport-specific cutting, acceleration/deceleration and a graded kicking progression (a large adductor demand in football), back to full training along a control -> chaos continuum. Pain-monitored throughout.",
      "drills": [
        { "name": "Graded kicking progression (short -> long, controlled -> match intensity)", "cues": ["Kicking is a large adductor demand — build volume then intensity", "Pain-monitored throughout (<=5/10, settles by morning)"], "reps_or_time": "graded" },
        { "name": "Control -> chaos cutting & repeated-effort work", "cues": ["Low to high speed and volume", "Reduced minutes first, build over 2-3 weeks"], "reps_or_time": "graded return" }
      ]
    }
  ]'::jsonb,
  '[
    { "label": "Hölmich et al. 1999 — Active physical training for long-standing adductor-related groin pain (RCT)", "source": "Lancet" },
    { "label": "Serner / Harøy 2019 — Copenhagen Adduction (adductor strengthening & groin-injury prevention)", "source": "Br J Sports Med" },
    { "label": "Thorborg et al. — Adductor squeeze test + HAGOS (Copenhagen Hip & Groin Outcome Score)", "source": "Br J Sports Med" },
    { "label": "Tyler et al. — Adduction:abduction strength ratio and groin-injury risk", "source": "Am J Sports Med" },
    { "label": "Weir et al. — Doha agreement on terminology for groin pain in athletes", "source": "Br J Sports Med 2015" }
  ]'::jsonb,
  true,
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.recovery_protocols WHERE slug = 'adductor_related_groin_staged_loading'
);
