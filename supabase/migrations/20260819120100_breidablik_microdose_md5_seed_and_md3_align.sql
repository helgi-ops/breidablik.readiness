-- MD-5 templates for Breidablik: clone MD-4 (all colors/variants/season phases) as the
-- early-week lighter-FORCE slot. Structure is cloned as a functional starting point; the
-- title/description mark it as the lighter slot for the coach to trim in the builder (we do
-- not fabricate a specific load reduction). Idempotent via NOT EXISTS.
INSERT INTO breidablik_football_karlar_microdose_templates
  (id, team_id, md_day, readiness_level, title, description, structure, variant, season_phase, structure_en)
SELECT gen_random_uuid(), src.team_id, 'MD-5', src.readiness_level,
  'MD-5 (snemma i viku) - ' || COALESCE(src.title, 'FORCE'),
  COALESCE(src.description, '') || ' | Lettari FORCE snemma i viku - minnkadu alag/settafjolda i smidnum.',
  src.structure, src.variant, src.season_phase, src.structure_en
FROM breidablik_football_karlar_microdose_templates src
WHERE src.md_day = 'MD-4'
  AND NOT EXISTS (
    SELECT 1 FROM breidablik_football_karlar_microdose_templates x
    WHERE x.md_day = 'MD-5' AND x.team_id = src.team_id
      AND x.readiness_level = src.readiness_level
      AND COALESCE(x.variant, '') = COALESCE(src.variant, '')
      AND COALESCE(x.season_phase, '') = COALESCE(src.season_phase, '')
  );

-- MD+3 = MD+2: align each MD+3 template to its MD+2 counterpart (same readiness_level +
-- season_phase, MD+2's base variant) so an MD+3 day delivers the MD+2 session.
UPDATE breidablik_football_karlar_microdose_templates AS p3
SET title = p2.title, description = p2.description, structure = p2.structure, structure_en = p2.structure_en
FROM (
  SELECT DISTINCT ON (team_id, readiness_level, COALESCE(season_phase, '')) team_id, readiness_level, season_phase, title, description, structure, structure_en
  FROM breidablik_football_karlar_microdose_templates
  WHERE md_day = 'MD+2'
  ORDER BY team_id, readiness_level, COALESCE(season_phase, ''), COALESCE(variant, '') ASC
) AS p2
WHERE p3.md_day = 'MD+3'
  AND p2.team_id = p3.team_id
  AND p2.readiness_level = p3.readiness_level
  AND COALESCE(p2.season_phase, '') = COALESCE(p3.season_phase, '');
