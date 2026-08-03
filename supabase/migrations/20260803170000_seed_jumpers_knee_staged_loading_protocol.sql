-- Player-facing protocol for the coach "Send to a player" button on
-- /coach/jumpers-knee. Four staged tendon-loading phases (Cook & Purdam /
-- Malliaras 2015) delivered to the player on /player/recovery-protocols.
-- Team-scoped to Breiðablik (matches the coach page's BREIDABLIK_TEAM_ID guard).
-- Idempotent: only inserts if the slug is not already present.
INSERT INTO public.recovery_protocols
  (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, team_id)
SELECT
  'jumpers_knee_staged_loading',
  'Jumper''s Knee — Staged Tendon Loading',
  'rehab',
  'mixed',
  35,
  'Player diagnosed with patellar tendinopathy (jumper''s knee). Criteria-based staged tendon loading — progression by pain + symmetry, never the calendar.',
  'Restore tendon load tolerance and return to sport through four staged loading phases, gated by a pain-monitoring model and force-plate symmetry.',
  'Patellar tendinopathy / anterior knee pain with load; single-leg decline-squat provokes the pain.',
  '[
    {
      "title": "Stage 1 · Isometric loading — pain relief & load tolerance",
      "duration_min": 15,
      "description": "For the irritable, high-pain tendon. Heavy isometric quad holds give an analgesic window (reduced tendon pain for up to ~45 min) and build load tolerance. Keep all non-provocative strength at normal load. Every hold at an acceptable pain level (see the pain-monitoring gate: pain up to 5/10 is allowed, must settle to baseline by next morning).",
      "drills": [
        { "name": "Spanish squat / wall-sit / leg-extension isometric hold (~60 deg knee flexion)", "cues": ["~70% max effort", "Rest ~2 min between holds", "2-3x per day", "Stay at an acceptable pain level (<=5/10)"], "reps_or_time": "5 x 45 s" },
        { "name": "Isometric single-leg decline-squat hold (once tolerated)", "cues": ["Progress from double- to single-leg", "Controlled, no bouncing"], "reps_or_time": "5 x 30-45 s" },
        { "name": "Non-provocative strength (posterior chain, calf, trunk, uninjured leg)", "cues": ["Keep at normal load — do not detrain the rest of the body"], "reps_or_time": "normal" }
      ]
    },
    {
      "title": "Stage 2 · Isotonic / Heavy Slow Resistance — tendon remodeling",
      "duration_min": 35,
      "description": "The core of the program. Heavy slow resistance drives collagen turnover and matches eccentric decline-squat for symptoms with better long-term satisfaction. Run for a minimum 12 weeks — tendon adaptation is slow. Pain during the session is allowed up to the gate; morning stiffness is the key day-to-day marker.",
      "drills": [
        { "name": "Leg press · squat · hack squat · decline squat", "cues": ["Slow 6 s tempo (3 s up / 3 s down)", "3x per week on alternate days", "Progressive load: 15RM (wk 1) -> 12 -> 10 -> 8 -> 6RM (wk ~12)"], "reps_or_time": "3-4 sets" },
        { "name": "Keep Stage 1 isometric holds on high-pain days", "cues": ["Use the analgesic window before training"], "reps_or_time": "as needed" }
      ]
    },
    {
      "title": "Stage 3 · Energy-storage loading — reintroduce the spring",
      "duration_min": 25,
      "description": "Only once pain is controlled at Stage 2 loads AND force-plate criteria are met (CMJ limb asymmetry < 10%, jump height / RSI-mod restored). Progressive plyometrics reload the stretch-shortening cycle. Every 3rd day to respect tendon recovery. Progress by symmetry, not by feel.",
      "drills": [
        { "name": "Progressive SSC: pogos -> box jumps (land soft) -> CMJ -> depth drops -> single-leg hops", "cues": ["Low to high stretch-shortening demand", "Land soft and quiet", "Every 3rd day"], "reps_or_time": "progressive" },
        { "name": "Track intensity via RSI-modified from the Force-Plate CMJ", "cues": ["Progress by limb symmetry, not by feel"], "reps_or_time": "monitor" }
      ]
    },
    {
      "title": "Stage 4 · Energy storage + release — return to sport",
      "duration_min": 30,
      "description": "Sport-specific jumping, cutting and deceleration, graded back to full training along a control -> chaos continuum (planned -> reactive, low -> high speed/volume). Deceleration and cutting exposure built gradually. Pain-monitored throughout.",
      "drills": [
        { "name": "Control -> chaos progression (planned -> reactive drills)", "cues": ["Low to high speed and volume", "Add deceleration and cutting gradually"], "reps_or_time": "graded" },
        { "name": "Sport-specific jumping, cutting, deceleration", "cues": ["Pain-monitored throughout (<=5/10, settles by morning)"], "reps_or_time": "graded return" }
      ]
    }
  ]'::jsonb,
  '[
    { "label": "Kongsgaard et al. 2009 — Corticosteroid injections, eccentric decline squat & heavy slow resistance in patellar tendinopathy", "source": "Scand J Med Sci Sports" },
    { "label": "Silbernagel et al. — Continued sports activity using a pain-monitoring model", "source": "Am J Sports Med 2007" },
    { "label": "Rio et al. 2015 — Isometric exercise reduces patellar tendon pain", "source": "Br J Sports Med" },
    { "label": "Malliaras et al. 2015 — Patellar tendinopathy: clinical diagnosis, load management & staged loading", "source": "J Orthop Sports Phys Ther" }
  ]'::jsonb,
  true,
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.recovery_protocols WHERE slug = 'jumpers_knee_staged_loading'
);
