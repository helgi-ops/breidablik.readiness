-- MD+3 "Reload Readiness" recovery protocol — seeded for the minutes-driven recommender
-- (recommendMinutesRecovery). By ~72h most qualities recover, but CMJ/RSI/eccentric-hamstring
-- strength can still lag after a FULL match (Drayton 2025; Silva 2018), so high-minutes players get
-- a short hamstring/jump-protective primer before intensity returns. Category 'general' (CHECK allows
-- it; no new category needed). Global (team_id null). Idempotent insert-if-absent.
insert into recovery_protocols
  (slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, evidence_note, active)
select
  'md_plus_3_reload_readiness',
  'MD+3 Reload Readiness',
  'general',
  'moderate',
  10,
  'MD+3 (~72h post-match) for players who played a full match — reintroduce intensity while protecting the jump/hamstring qualities that can still lag.',
  'Prime a safe return to high intensity after a full match: protect eccentric-hamstring and reactive-strength qualities that can still be reduced at 72h.',
  'Auto-assigned MD+3 for players with high match minutes (minutes-driven; no CMJ required). A logged CMJ/strength test at baseline overrides it.',
  '[
    {"title":"Hamstring Readiness Primer","duration_min":4,"evidence_tier":"moderate","description":"Sub-maximal eccentric/isometric hamstring work to prime tissue tolerance before intensity returns — eccentric-hamstring strength can still lag at MD+3 after a full match.","drills":[{"name":"Long-Lever Hamstring Bridge Hold","cues":["Heels on bench, knees ~150 degrees","Hips up, glute squeeze","Hold steady, pain-free"],"reps_or_time":"3 x 30s"},{"name":"Single-Leg RDL (slow, light)","cues":["Light DB or bodyweight","3s lower, feel the hamstring","Flat back"],"reps_or_time":"2 x 6 per side"}]},
    {"title":"Reactive Re-Entry (low amplitude)","duration_min":4,"evidence_tier":"moderate","description":"Low-amplitude pogos and low box rebounds to re-expose reactive strength gently before full plyometrics — RSI/CMJ can still be reduced at 72h.","drills":[{"name":"Pogo Hops","cues":["Stiff ankles, short ground contact","Low height","Quiet landings"],"reps_or_time":"3 x 10"},{"name":"Low Box Step-Off to Stick","cues":["20-30cm box","Land soft, stick 1s","Control, no collapse"],"reps_or_time":"2 x 5"}]},
    {"title":"Reload Check-In","duration_min":2,"evidence_tier":"practitioner","description":"Quick readiness gauge before the main session. If a CMJ/strength test is logged and back to baseline, clear to full load — the test overrides the minutes proxy.","drills":[{"name":"Readiness self-check","cues":["Hamstring feels normal?","Jump feels springy?","Yes -> progress intensity; no -> keep today sub-max"],"reps_or_time":"1 min"}]}
  ]'::jsonb,
  '[
    {"label":"Drayton et al. 2025 — Time course of postmatch physical impairments","source":"J Strength Cond Res"},
    {"label":"Silva et al. 2018 — Acute and residual soccer match-related fatigue","source":"Sports Med"},
    {"label":"Rio et al. 2015 — Isometric exercise reduces tendon pain","source":"Br J Sports Med"}
  ]'::jsonb,
  'Most physical qualities recover by MD+3; CMJ, reactive strength and hamstring strength can still lag after a full match (Drayton 2025). This primes a safe return to intensity — it does not replace a readiness test if one is available.',
  true
where not exists (select 1 from recovery_protocols where slug = 'md_plus_3_reload_readiness');
