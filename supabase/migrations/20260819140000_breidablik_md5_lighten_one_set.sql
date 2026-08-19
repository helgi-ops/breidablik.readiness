-- Lighten the MD-5 (early-week) templates: take one working set off. Set counts are free
-- text ("5 sett", "x 2 sets") in the working blocks; the warmup uses reps/seconds (never
-- "sett/sets") so it is untouched. Two passes: (1) decrement each N sett/sets into a guarded
-- placeholder (§(N-1)§) so the chained replace never cascades; (2) strip the § guards. Reps
-- and seconds are left alone. MD-5 only. (Applied once — replaying the full history is fine.)

-- Pass 1: decrement into guarded placeholders.
UPDATE breidablik_football_karlar_microdose_templates
SET structure = (replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      structure::text,
      '6 sett','§5§ sett'),'6 sets','§5§ sets'),
      '5 sett','§4§ sett'),'5 sets','§4§ sets'),
      '4 sett','§3§ sett'),'4 sets','§3§ sets'),
      '3 sett','§2§ sett'),'3 sets','§2§ sets'),
      '2 sett','§1§ sett'),'2 sets','§1§ sets'))::jsonb,
    structure_en = CASE WHEN structure_en IS NOT NULL THEN (replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      structure_en::text,
      '6 sett','§5§ sett'),'6 sets','§5§ sets'),
      '5 sett','§4§ sett'),'5 sets','§4§ sets'),
      '4 sett','§3§ sett'),'4 sets','§3§ sets'),
      '3 sett','§2§ sett'),'3 sets','§2§ sets'),
      '2 sett','§1§ sett'),'2 sets','§1§ sets'))::jsonb ELSE NULL END
WHERE md_day = 'MD-5';

-- Pass 2: strip the § guards.
UPDATE breidablik_football_karlar_microdose_templates
SET structure = replace(structure::text, '§', '')::jsonb,
    structure_en = CASE WHEN structure_en IS NOT NULL THEN replace(structure_en::text, '§', '')::jsonb ELSE NULL END
WHERE md_day = 'MD-5';
