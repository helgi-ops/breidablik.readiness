-- Connect sore_areas check-in selections to the fix modules pipeline.
-- Previously, v_player_fix_modules_latest only matched free-text notes
-- against issue_rules.patterns. Now it ALSO maps sore_areas muscle-group
-- IDs directly to issue_rules tags via a VALUES lookup table.

DROP VIEW IF EXISTS v_player_fix_modules_latest;

CREATE VIEW v_player_fix_modules_latest AS
WITH
  -- 1. Today's check-in: considers entries with notes OR sore_areas
  latest_entry AS (
    SELECT DISTINCT ON (r.player_id)
      r.id        AS checkin_id,
      r.player_id,
      r.entry_date,
      r.created_at,
      r.notes,
      r.sore_areas
    FROM readiness_entries r
    WHERE r.entry_date = CURRENT_DATE
      AND (
        NULLIF(TRIM(r.notes), '') IS NOT NULL
        OR (r.sore_areas IS NOT NULL AND r.sore_areas != '[]'::jsonb AND r.sore_areas != 'null'::jsonb)
      )
    ORDER BY r.player_id, r.entry_date DESC, r.created_at DESC
  ),

  -- 2. Mapping table: muscle group id → issue_rules tag
  area_tag_map(area_key, tag) AS (
    VALUES
      ('hip_flexors',  'HIP_STIFFNESS'),
      ('glutes',       'HIP_STIFFNESS'),
      ('hamstrings',   'HAMSTRING_TIGHTNESS'),
      ('adductors',    'ADDUCTOR_GROIN'),
      ('quadriceps',   'ANTERIOR_KNEE_PAIN'),
      ('calves',       'CALF_ACHILLES_SORENESS'),
      ('lower_back',   'LOW_BACK_TIGHTNESS'),
      ('shoulders',    'SHOULDER_TIGHTNESS'),
      ('neck',         'NECK_UPPER_BACK_TENSION'),
      ('upper_back',   'NECK_UPPER_BACK_TENSION')
  ),

  -- 3a. Hits from free-text notes (existing logic)
  note_hits AS (
    SELECT
      le.checkin_id,
      le.player_id,
      le.entry_date,
      le.created_at,
      ir.tag,
      ir.priority
    FROM latest_entry le
      JOIN issue_rules ir ON ir.is_active = true
    WHERE NULLIF(TRIM(le.notes), '') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(ir.patterns) p(p)
        WHERE translate(lower(le.notes), 'áéíóúýöæððþ', 'aeiouyoaddt')
          ILIKE '%' || translate(lower(p.p), 'áéíóúýöæððþ', 'aeiouyoaddt') || '%'
      )
  ),

  -- 3b. Hits from sore_areas selections
  area_hits AS (
    SELECT
      le.checkin_id,
      le.player_id,
      le.entry_date,
      le.created_at,
      atm.tag,
      ir.priority
    FROM latest_entry le
      CROSS JOIN LATERAL jsonb_array_elements_text(le.sore_areas) AS sa(val)
      JOIN area_tag_map atm ON atm.area_key = sa.val
      JOIN issue_rules ir  ON ir.is_active = true AND ir.tag = atm.tag
    WHERE le.sore_areas IS NOT NULL
      AND le.sore_areas != '[]'::jsonb
      AND le.sore_areas != 'null'::jsonb
  ),

  -- 4. Union all hits (deduplicate by player + tag)
  all_hits AS (
    SELECT * FROM note_hits
    UNION
    SELECT * FROM area_hits
  ),

  -- 5. Aggregate fix modules
  mods AS (
    SELECT
      le.player_id,
      le.entry_date,
      le.checkin_id,
      le.created_at,
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object('tag', im.tag, 'title', im.title, 'structure', im.structure)
        ) FILTER (WHERE im.id IS NOT NULL),
        '[]'::jsonb
      ) AS fix_modules
    FROM latest_entry le
      LEFT JOIN all_hits h  ON h.player_id = le.player_id AND h.checkin_id = le.checkin_id
      LEFT JOIN issue_modules im ON im.is_active = true AND im.tag = h.tag
    GROUP BY le.player_id, le.entry_date, le.checkin_id, le.created_at
  )

SELECT player_id, entry_date, checkin_id, created_at, fix_modules
FROM mods;
