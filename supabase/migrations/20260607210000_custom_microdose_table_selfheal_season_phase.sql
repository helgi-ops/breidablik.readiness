-- Self-heal the dynamic per-trainer custom-microdose template tables so the
-- season-phase-aware save RPC works on tables created before season_phase
-- existed.
--
-- Symptom: saving a Custom programme failed with
--   ERROR: column "season_phase" of relation "<trainer>_..._templates" does not exist
-- because create_custom_microdose_table() built the table without a
-- season_phase column / 5-column unique, while save_custom_template_records()
-- (the 4-arg, season-phase variant) inserts season_phase and relies on
-- ON CONFLICT (team_id, md_day, readiness_level, variant, season_phase).
--
-- create_custom_microdose_table() is called on every save, so making it
-- idempotently ensure the column + unique index repairs all existing tables
-- automatically on the next save.

CREATE OR REPLACE FUNCTION public.create_custom_microdose_table(p_table_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_idx text := 'cmt_' || substr(md5(p_table_name), 1, 20) || '_phase_uq';
BEGIN
  IF p_table_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;

  -- New tables already include season_phase.
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I (
      id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
      team_id         uuid,
      md_day          text        NOT NULL,
      readiness_level text        NOT NULL,
      title           text        NOT NULL,
      description     text,
      structure       jsonb       NOT NULL DEFAULT '[]'::jsonb,
      variant         text        NOT NULL DEFAULT 'A',
      season_phase    text        NOT NULL DEFAULT 'inseason',
      created_at      timestamptz DEFAULT now()
    )
  $sql$, p_table_name);

  -- Self-heal older tables: ensure the season_phase column exists.
  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS season_phase text NOT NULL DEFAULT ''inseason''',
    p_table_name
  );

  -- Drop any legacy 4-column unique (team_id, md_day, readiness_level, variant)
  -- without season_phase — it would block multiple phases for the same slot.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = p_table_name::regclass
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) k
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
      ) = ARRAY['md_day','readiness_level','team_id','variant']::text[]
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table_name, c.conname);
  END LOOP;

  -- Ensure the 5-column unique index the season-phase save RPC's ON CONFLICT
  -- relies on. Deterministic short md5-based name to stay within 63 chars.
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (team_id, md_day, readiness_level, variant, season_phase)',
    v_idx, p_table_name
  );
END;
$function$;
