-- Player-facing protocol for the coach "Send to a player" button on
-- /coach/calf-strain. Six management phases (Green et al. 2022, Sports Med-Open
-- 8:10, CC-BY 4.0; sub-type distinction Dixon 2009; risk factors Green & Pizzari
-- 2017). Parallel to the jumper's-knee / Achilles / adductor staged-loading rows.
-- Team-scoped to Breiðablik. Idempotent: only inserts if the slug is absent.
--
-- Screening / rehab-support only — the injured structure (medial/lateral gastroc,
-- soleus, aponeurotic) and loading are established by a clinician; the six-phase
-- framework is expert-consensus (20 clinicians), best-available practice, not RCT
-- outcomes. Pain / red flags -> clinician. Never the readiness colour.
INSERT INTO public.recovery_protocols
  (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, evidence_note, team_id)
SELECT
  'calf_strain_staged_loading',
  'Calf Strain — Staged Loading (6-phase)',
  'rehab',
  'mixed',
  35,
  'Player with a calf strain, once a clinician has established the injured structure (medial or lateral gastrocnemius, soleus, or aponeurotic) and severity. Criteria-based staged loading gated by calf-raise capacity + running/sprint tolerance, never the calendar.',
  'Restore calf capacity and return to sport through six management phases (Green et al. 2022), loaded for the specific injured structure - straight-knee for gastrocnemius, bent-knee/seated for soleus.',
  'Calf strain: acute explosive/sprint onset suggests gastrocnemius; insidious tightness/cramping with a running-workload spike suggests soleus. Recurrent calf strains especially need a structure-specific plan.',
  '[
    {
      "title": "Phase 1 - Diagnosis / clinical examination (clinician)",
      "duration_min": 5,
      "evidence_tier": "moderate",
      "description": "Calf strain is not one diagnosis - establish the structure FIRST, it changes everything. Gastrocnemius (crosses the knee) is injured in explosive/sprinting/lengthened positions - usually acute and obvious. Soleus (monoarticular) is associated with endurance/fatigue/distance running - often insidious, felt as tightness/cramping with gradual onset, classically after a running-workload spike or being off-loaded from running. Record: which muscle (medial/lateral gastroc, soleus, aponeurotic), severity, and injury characteristics. This is a clinician call.",
      "drills": [
        { "name": "Establish the injured structure + severity (clinician)", "cues": ["Medial vs lateral gastroc vs soleus vs aponeurotic", "Acute/explosive -> gastroc; insidious/cramping + workload spike -> soleus", "Especially important for recurrent calf strains"], "reps_or_time": "day 1, then re-confirm" }
      ]
    },
    {
      "title": "Phase 2 - Prognosis / ongoing monitoring",
      "duration_min": 5,
      "evidence_tier": "moderate",
      "description": "The best prognosis estimate comes from monitoring calf capacity + the response to loading exposure OVER TIME, not from a single day-1 call. Track calf-raise capacity and how symptoms respond to each load step.",
      "drills": [
        { "name": "Monitor calf capacity + load response over time", "cues": ["Single-leg calf-raise reps (both knee-straight and knee-bent)", "Symptom response 24 h after each load step", "Prognosis is a trend, not a day-1 number"], "reps_or_time": "each session" }
      ]
    },
    {
      "title": "Phase 3 - Foundation calf & lower-limb function",
      "duration_min": 15,
      "evidence_tier": "moderate",
      "description": "Normalise the walking pattern first. Restore range of motion and stretch symmetry left vs right for BOTH gastrocnemius (knee straight) and soleus (knee bent). No limping into strengthening.",
      "drills": [
        { "name": "Normalise gait", "cues": ["Symmetrical, pain-free walking before loading progresses"], "reps_or_time": "as needed" },
        { "name": "Gastrocnemius + soleus ROM / stretch symmetry (L vs R)", "cues": ["Knee-straight for gastroc, knee-bent for soleus", "Restore side-to-side symmetry"], "reps_or_time": "daily" }
      ]
    },
    {
      "title": "Phase 4 - Loaded strengthening",
      "duration_min": 30,
      "evidence_tier": "moderate",
      "description": "Enter after the early benchmark: single-leg calf-raise capacity ~20-25 reps. Then add load and reduce reps: heavy ~3-4 x 6-8, plus some longer/slower isometric holds. Straight-knee (standing) = gastrocnemius; bent-knee/seated = soleus. SOLEUS load tolerance is essential for ALL calf strains before any dynamic work (soleus carries very high loads in running). Progress flat -> incline for range. Add horizontal + lateral capacity (often neglected, especially for accel/cutting sports). Tailor to sport: strength-endurance (football) vs max force (sprint/rugby). For a problem/recurrent calf: heavy isometrics at various muscle-tendon lengths + eccentric overload. Dose the isometric holds as short, frequent bouts (~10 min, 1-3x/day, ~6 h apart - Baar).",
      "drills": [
        { "name": "Entry benchmark: single-leg calf raise", "cues": ["~20-25 reps before loaded strengthening", "Test both straight-knee (gastroc) and seated (soleus)"], "reps_or_time": "gate" },
        { "name": "Heavy calf raise - straight-knee (gastroc) and seated (soleus)", "cues": ["~3-4 x 6-8 heavy", "Smith-machine / seated calf raise", "Flat -> incline for ROM", "Load the injured structure at its knee angle"], "reps_or_time": "3-4 x 6-8" },
        { "name": "Isometric calf holds (short, frequent bouts)", "cues": ["Longer/slower holds at various muscle-tendon lengths", "~10 min per bout, 1-3x/day, ~6 h apart (Baar dosing)", "Optional: gelatin/collagen + vitamin C ~45 min pre-load"], "reps_or_time": "5 x 30-45 s" },
        { "name": "Horizontal + lateral calf capacity", "cues": ["Often neglected - important for accel/cutting sports"], "reps_or_time": "progressive" }
      ]
    },
    {
      "title": "Phase 5 - Loaded power, plyometrics & ballistic",
      "duration_min": 25,
      "evidence_tier": "moderate",
      "description": "Only after the preliminary strength benchmarks are met. Gradually build energy-storage / stretch-shortening-cycle capacity - pogos -> hops -> bounding -> ballistic, respecting recovery between sessions.",
      "drills": [
        { "name": "Progressive SSC / plyometrics", "cues": ["Pogos -> hops -> bounding -> ballistic", "Build energy storage gradually", "Quality over volume"], "reps_or_time": "progressive" }
      ]
    },
    {
      "title": "Phase 6 - Running rehabilitation -> return to sport",
      "duration_min": 25,
      "evidence_tier": "moderate",
      "description": "Meet readiness-to-run criteria, then graded running -> speed/sprint -> sport-specific, with a prevention emphasis. Prevention is individualised - there is no universal calf-injury prevention program; use periodic monitoring for load-management, not injury prediction.",
      "drills": [
        { "name": "Readiness-to-run -> graded running -> sprint", "cues": ["Meet run-readiness criteria first", "Graded running, then speed/sprint, then sport-specific"], "reps_or_time": "graded return" },
        { "name": "Prevention (individualised)", "cues": ["Keep soleus + gastroc capacity high", "Manage sprint / HSR / accel-decel + running-workload spikes", "No universal program - individualise"], "reps_or_time": "ongoing" }
      ]
    }
  ]'::jsonb,
  '[
    { "label": "Green et al. 2022 - Recalibrating the risk of hamstring strain... calf muscle strain injuries: a qualitative study of 20 expert clinicians (6-phase management framework)", "source": "Sports Medicine - Open 8:10 (CC-BY)" },
    { "label": "Green & Pizzari 2017 - Calf muscle strain injuries in sport: a systematic review of risk factors (prior injury = strongest; increasing age)", "source": "Br J Sports Med" },
    { "label": "Dixon 2009 - Gastrocnemius vs soleus strain: how to differentiate and deal with calf muscle injuries", "source": "Curr Rev Musculoskelet Med" },
    { "label": "Baar 2017 / 2019 - tendon/collagen loading dose (short frequent bouts) applied to the isometric calf loading", "source": "Sports Med / IJSNEM" }
  ]'::jsonb,
  true,
  'The six-phase framework is expert-consensus (Green et al. 2022, 20 clinicians) - best-available practice, not RCT outcomes. The sub-type principle and risk factors are well-supported. Not a diagnosis; a clinician establishes the injured structure and gates progression.',
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.recovery_protocols WHERE slug = 'calf_strain_staged_loading'
);
