-- Recovery Protocols: honest evidence grading (per the evidence analysis).
-- Adds an evidence_note caveat column + an "experimental" evidence tier, grades
-- each section inside the sections jsonb, and removes the vestibulospinal
-- "extensor tone" causal claim from the MD+1 bundle goal.

-- Allow the new protocol-level tier.
alter table recovery_protocols drop constraint if exists recovery_protocols_evidence_tier_check;
alter table recovery_protocols add constraint recovery_protocols_evidence_tier_check
  check (evidence_tier = any (array['strong','moderate','practitioner','mixed','experimental']::text[]));

alter table recovery_protocols add column if not exists evidence_note text;

-- MD+1 Morning Recovery Bundle: reword the goal to what's supported (drop the
-- speculative "clear residual extensor tone" claim); grade its sections.
update recovery_protocols
set goal = 'Reset breathing mechanics, restore tendon load tolerance, and support the transition toward rest.',
    sections = (
      select jsonb_agg(
        case s->>'title'
          when 'Diaphragmatic Breathing Reset' then s || '{"evidence_tier":"strong"}'::jsonb
          when 'Isometric Loading (Tendon Tolerance)' then s || '{"evidence_tier":"moderate"}'::jsonb
          when 'Reciprocal Inhibition / MET Mobility' then s || '{"evidence_tier":"moderate"}'::jsonb
          else s
        end order by ord
      )
      from jsonb_array_elements(sections) with ordinality as t(s, ord)
    )
where slug = 'md_plus_1_recovery_bundle';

-- Post-Match VST Reset: built around the vestibular reset the analysis grades
-- SPECULATIVE for post-match recovery. Keep it available but label it
-- experimental with an honest caveat; grade its sections so the strong
-- (breathing) parts are distinguished from the experimental (vestibular) parts.
update recovery_protocols
set evidence_tier = 'experimental',
    evidence_note = 'The vestibulo-sympathetic reflex is real physiology (Carter & Ray 2008); its role in post-match recovery is untested — use as an optional experiment, not established practice. The breathing component has strong acute-HRV support (Laborde 2022).',
    goal = 'Optional experiment: a breathing-led down-regulation with vestibular/oculomotor drills. The breathing reset has strong acute-HRV support; the vestibular reset is unproven for post-match recovery — try it, but don''t treat it as established.',
    sections = (
      select jsonb_agg(
        case s->>'title'
          when 'Flexor-Biased Breath Reset' then s || '{"evidence_tier":"strong"}'::jsonb
          when 'Isometric Loading (Tendon Tolerance)' then s || '{"evidence_tier":"moderate"}'::jsonb
          when 'Reciprocal Inhibition / MET Mobility' then s || '{"evidence_tier":"moderate"}'::jsonb
          when 'Vestibular–Spinal Unloading' then s || '{"evidence_tier":"experimental"}'::jsonb
          when 'Gaze & Vagus Coupling' then s || '{"evidence_tier":"experimental"}'::jsonb
          else s
        end order by ord
      )
      from jsonb_array_elements(sections) with ordinality as t(s, ord)
    )
where slug = 'post_match_vst_reset';
