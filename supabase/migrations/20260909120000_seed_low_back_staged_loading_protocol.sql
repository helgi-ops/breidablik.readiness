-- Player-facing protocol for the coach "Send to a player" button on
-- /coach/low-back. A criteria-gated staged track for clinician-cleared
-- NON-SPECIFIC mechanical low-back pain: clearance -> settle+foundation ->
-- mobility -> loaded strengthening -> power/rotational -> running/RTS.
-- Parallel to the calf / Achilles / adductor staged rows. Team-scoped to
-- Breidablik. Idempotent: only inserts if the slug is absent.
--
-- Honest framing: most LBP is non-specific (Maher 2017, Lancet); exercise helps
-- (Hayden 2021 Cochrane) but no single type is clearly superior (Saragiotto 2016);
-- the McGill big-3 is a reasonable trunk-endurance base, not proven superior.
-- Screening / rehab-support only. RED FLAGS (radicular, saddle anaesthesia,
-- bladder/bowel change, night pain, trauma, systemic) -> clinician immediately;
-- cauda equina is an emergency. Directional preference is clinician-assessed.
-- Never the readiness colour.
INSERT INTO public.recovery_protocols
  (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, evidence_note, team_id)
SELECT
  'low_back_staged_loading',
  'Low Back - Staged Track (non-specific mechanical LBP)',
  'rehab',
  'mixed',
  30,
  'Player with clinician-cleared NON-SPECIFIC mechanical low-back pain (red flags and radicular signs ruled out), or asymptomatic capacity prehab. STOP and refer to a clinician immediately for any red flag: leg pain/numbness or radicular signs, saddle anaesthesia, bladder/bowel change, night pain, significant trauma, or systemic features - cauda equina is an emergency. Criteria-based and clinician-gated, never the calendar.',
  'Reduce provocation and build capacity, motor control, mobility and load tolerance across six phases - not a named disc/facet lesion. The clinician clears red flags / radicular / directional preference and gates the loaded progression.',
  'Low-back pain flagged (forward-lean / hip-hinge fault, trunk-control, or a lumbar injury). Prior LBP raises risk. This is for non-specific mechanical LBP a clinician has cleared.',
  '[
    {
      "title": "Phase 1 - Screen / clearance (clinician)",
      "duration_min": 5,
      "evidence_tier": "strong",
      "description": "A clinician confirms non-specific mechanical LBP - red flags and radicular signs ruled out. Directional-preference (centralisation / McKenzie) and any structural call are clinician territory, not a coach default. Record a baseline outcome measure - Oswestry Disability Index (ODI) or Roland-Morris (RMDQ) - and re-measure to track change.",
      "drills": [
        { "name": "Clinician clearance + baseline outcome measure", "cues": ["Rule out red flags and radicular signs (cauda equina is an emergency)", "Non-specific mechanical LBP only", "Record ODI or RMDQ at baseline, then re-measure"], "reps_or_time": "day 1, then re-measure" }
      ]
    },
    {
      "title": "Phase 2 - Settle + foundation (trunk endurance / motor control)",
      "duration_min": 15,
      "evidence_tier": "moderate",
      "description": "Reduce provocation and normalise the daily pattern (sitting / hinge); restore pain-free range. Begin the trunk-endurance / motor-control base with the McGill big-3 - endurance holds, not max reps - plus breathing / bracing. A reasonable, well-tolerated base; coach-overridable, not proven superior to other exercise (Saragiotto 2016).",
      "drills": [
        { "name": "Curl-up (McGill, endurance holds)", "cues": ["Hands under the low back, lift head/shoulders a few cm", "Short ~8 s holds, several reps", "Do not flatten the spine"], "reps_or_time": "3 x (6-8 x ~8 s)" },
        { "name": "Side bridge (McGill, endurance)", "cues": ["Straight line ankle-to-shoulder", "Hold and breathe; build L vs R symmetry"], "reps_or_time": "3 x ~8 s / side" },
        { "name": "Bird-dog (quadruped, anti-rotation)", "cues": ["Opposite arm/leg, ribs down, pelvis level", "No rotation or low-back sag"], "reps_or_time": "3 x 6-8 / side" },
        { "name": "Breathing / bracing", "cues": ["Brace without breath-holding", "Carry the brace into the hinge"], "reps_or_time": "daily" }
      ]
    },
    {
      "title": "Phase 2b - Mobility contributors (regional interdependence)",
      "duration_min": 10,
      "evidence_tier": "moderate",
      "description": "Address the hip (especially internal rotation) and thoracic-spine restrictions that push motion into the low back, and drill a hip-hinge that load-shares off the spine. These are also the overhead-squat forward-lean / hinge drivers - so findings de-duplicate with the movement-screen corrective plan.",
      "drills": [
        { "name": "Hip internal-rotation mobilisation (90/90)", "cues": ["Rotate from the hip, keep the pelvis and lumbar spine still"], "reps_or_time": "2 x 8 / side" },
        { "name": "Thoracic rotation (open-book / quadruped)", "cues": ["Rotate through the mid-back, not the low back", "Follow the hand with the eyes"], "reps_or_time": "2 x 8 / side" },
        { "name": "Hip-hinge patterning (dowel)", "cues": ["Dowel touches head, mid-back and sacrum", "Push the hips back, flat spine, load the hamstrings"], "reps_or_time": "3 x 8" }
      ]
    },
    {
      "title": "Phase 3 - Loaded strengthening (clinician-gated)",
      "duration_min": 30,
      "evidence_tier": "moderate",
      "description": "Progressive hip-hinge loading (RDL / hip thrust / KB), anti-flexion and anti-rotation carries (Pallof, suitcase carry), and posterior-chain capacity; build trunk endurance under load. Load the pattern, not the spine. Football emphasis = strength-endurance + rotational tolerance, tailored to demands. The clinician gates the progression.",
      "drills": [
        { "name": "Progressive hip-hinge loading (RDL / hip thrust / KB)", "cues": ["Load the hinge pattern, flat spine", "Progress gradually with tolerance"], "reps_or_time": "3 x 6-10" },
        { "name": "Pallof press (anti-rotation)", "cues": ["Press straight out and resist the pull", "Brace, do not twist"], "reps_or_time": "3 x 8-10 / side" },
        { "name": "Suitcase carry (anti-lateral-flexion)", "cues": ["Load one side, stand tall", "Do not lean or hitch the hip"], "reps_or_time": "3 x 20-30 m / side" }
      ]
    },
    {
      "title": "Phase 4 - Power / plyometric + rotational",
      "duration_min": 20,
      "evidence_tier": "emerging",
      "description": "Energy-storage and rotational power (medicine-ball throws, chops) once strength benchmarks are met. Criteria-based and clinician-gated; quality over volume.",
      "drills": [
        { "name": "Rotational power (med-ball throws, chops)", "cues": ["Only after strength benchmarks are met", "Build energy storage gradually"], "reps_or_time": "criteria-based" }
      ]
    },
    {
      "title": "Phase 5 - Running / sport reintegration -> return to sport",
      "duration_min": 25,
      "evidence_tier": "moderate",
      "description": "Graded running -> sprint / cutting -> sport-specific, criteria-gated. Prior-LBP players are higher risk - manage load, do not predict. Ongoing load-management: avoid sudden training-load spikes (ACWR-style monitoring, for management not prediction).",
      "drills": [
        { "name": "Graded running -> sprint / cutting -> sport-specific", "cues": ["Meet criteria first", "Then build running, then speed/cutting, then sport-specific"], "reps_or_time": "criteria-gated" },
        { "name": "Ongoing load-management", "cues": ["Avoid sudden running / sprint / workload spikes", "Keep trunk + hip capacity high"], "reps_or_time": "ongoing" }
      ]
    }
  ]'::jsonb,
  '[
    { "label": "Maher, Underwood & Buchbinder 2017 - Non-specific low back pain (landmark Lancet LBP series)", "source": "Lancet" },
    { "label": "Hayden et al. 2021 - Exercise therapy for chronic low back pain (reduces pain and disability)", "source": "Cochrane Database of Systematic Reviews" },
    { "label": "Saragiotto et al. 2016 - Motor-control exercise for chronic non-specific low back pain (about equal to other exercise, better than minimal intervention)", "source": "Cochrane Database of Systematic Reviews" },
    { "label": "McGill - Low Back Disorders (trunk-endurance big-3 model; practitioner-standard, cited not reproduced)", "source": "Human Kinetics" },
    { "label": "Regional interdependence - hip internal rotation + thoracic-spine mobility load-share off the lumbar spine; hip-hinge patterning spares it", "source": "clinical framework" }
  ]'::jsonb,
  true,
  'Exercise for LBP is well-supported (Hayden 2021 Cochrane); which exercise is not (Saragiotto 2016) - the McGill big-3 is a reasonable trunk-endurance base, coach-overridable, not proven-superior. Regional interdependence + load are defensible mechanisms. Not a diagnosis; a clinician clears red flags / radicular / directional preference and gates loaded progression. Athlete load-LBP association specifics pending full-text verification.',
  '94b52a06-0b83-48da-8664-639ec3486a0c'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.recovery_protocols WHERE slug = 'low_back_staged_loading'
);
