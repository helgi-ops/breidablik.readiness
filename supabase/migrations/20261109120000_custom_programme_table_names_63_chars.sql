-- Postgres cuts identifiers at 63 characters without an error. Njarðvík W's week names are 72 characters, so all seven
-- weeks went into one table, njardvik_w_korfubolti_basketball_konur_microdose_templates_week, each save writing over the
-- last. The RPCs truncated the same way and looked fine, while PostgREST does not truncate and answered 404.
--
-- Evidence that weeks were overwritten, taken from that table on 2026-11-09:
--   MIÐ/FÖS/SUN, 12 rows: one last-writing transaction (xmin 417846), the save at 2026-11-08 21:27:33 UTC for 2026-11-30.
--   MÁN, 4 rows: last written 2026-10-25, and only the 2026-10-19 block lists MÁN.
--   pg_stat counted 48 updates and no inserts, which is 12 rows x the 4 saves between 21:24 and 21:27 that evening.
--
-- This migration overwrites nothing. It moves only rows that can be tied to one week, so the other five sets start
-- empty rather than showing the 2026-11-30 session under another week's date. The old table stays as the archive, until
-- the coach has confirmed what each week should hold.

-- 1) Nothing can be truncated silently again.
create or replace function public.create_custom_microdose_table(p_table_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  c record;
  v_idx text := 'cmt_' || substr(md5(p_table_name), 1, 20) || '_phase_uq';
BEGIN
  IF p_table_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;
  IF length(p_table_name) > 63 THEN
    RAISE EXCEPTION 'Table name is longer than 63 characters: %', p_table_name;
  END IF;

  -- structure_en: the player's Today read selects it, and a table without the column answers 400.
  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I (
      id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
      team_id         uuid,
      md_day          text        NOT NULL,
      readiness_level text        NOT NULL,
      title           text        NOT NULL,
      description     text,
      structure       jsonb       NOT NULL DEFAULT '[]'::jsonb,
      structure_en    jsonb,
      variant         text        NOT NULL DEFAULT 'A',
      season_phase    text        NOT NULL DEFAULT 'inseason',
      created_at      timestamptz DEFAULT now()
    )
  $sql$, p_table_name);

  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS season_phase text NOT NULL DEFAULT ''inseason''',
    p_table_name
  );
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS structure_en jsonb', p_table_name);

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

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (team_id, md_day, readiness_level, variant, season_phase)',
    v_idx, p_table_name
  );

  PERFORM public.secure_custom_programme_table(p_table_name);
END;
$function$;

create or replace function public.save_custom_template_records(p_table_name text, p_team_id uuid, p_records jsonb, p_season_phase text default 'inseason'::text)
returns void
language plpgsql
security definer
as $function$
BEGIN
  IF p_table_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;
  IF length(p_table_name) > 63 THEN
    RAISE EXCEPTION 'Table name is longer than 63 characters: %', p_table_name;
  END IF;

  EXECUTE format($sql$
    INSERT INTO %I (team_id, md_day, readiness_level, title, description, structure, variant, season_phase)
    SELECT
      $1,
      r.md_day,
      r.readiness_level,
      r.title,
      r.description,
      r.structure,
      COALESCE(r.variant, 'A'),
      $3
    FROM jsonb_to_recordset($2) AS r(
      md_day          text,
      readiness_level text,
      title           text,
      description     text,
      structure       jsonb,
      variant         text
    )
    ON CONFLICT (team_id, md_day, readiness_level, variant, season_phase)
    DO UPDATE SET
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      structure   = EXCLUDED.structure
  $sql$, p_table_name)
  USING p_team_id, p_records, p_season_phase;
END;
$function$;

create or replace function public.read_custom_template_records(p_table_name text, p_team_id uuid)
returns table(id uuid, md_day text, readiness_level text, title text, description text, structure jsonb, variant text)
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF p_table_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;
  IF length(p_table_name) > 63 THEN
    RAISE EXCEPTION 'Table name is longer than 63 characters: %', p_table_name;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT id, md_day, readiness_level, title, description, structure, variant
     FROM %I WHERE team_id = $1
     ORDER BY md_day, readiness_level',
    p_table_name
  ) USING p_team_id;
END;
$function$;

create or replace function public.read_custom_template_records(p_table_name text, p_team_id uuid, p_season_phase text default null::text)
returns table(id uuid, md_day text, readiness_level text, title text, description text, structure jsonb, variant text)
language plpgsql
security definer
as $function$
BEGIN
  IF p_table_name !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;
  IF length(p_table_name) > 63 THEN
    RAISE EXCEPTION 'Table name is longer than 63 characters: %', p_table_name;
  END IF;

  IF p_season_phase IS NOT NULL THEN
    RETURN QUERY EXECUTE format(
      'SELECT id, md_day, readiness_level, title, description, structure, variant
       FROM %I WHERE team_id = $1 AND season_phase = $2
       ORDER BY md_day, readiness_level',
      p_table_name
    ) USING p_team_id, p_season_phase;
  ELSE
    RETURN QUERY EXECUTE format(
      'SELECT id, md_day, readiness_level, title, description, structure, variant
       FROM %I WHERE team_id = $1
       ORDER BY md_day, readiness_level',
      p_table_name
    ) USING p_team_id;
  END IF;
END;
$function$;

-- 2) One table per week. New names come from fitTableName (src/lib/micropulse/templateAutoGenerate.ts); a test pins them.
do $$
declare
  v_team constant uuid := 'a174db7b-b417-44df-9e7f-efffeee5d764';
  v_old_prefix constant text := 'njardvik_w_korfubolti_basketball_konur_microdose_templates_week_';
  v_archive constant text := 'njardvik_w_korfubolti_basketball_konur_microdose_templates_week';
  m record;
  v_rows int;
begin
  for m in
    select * from (values
      ('20261019', 'njardvik_w_korfubolt_edbfb149_microdose_templates_week_20261019', array['MÁN']),
      ('20261026', 'njardvik_w_korfubolt_68bca153_microdose_templates_week_20261026', array[]::text[]),
      ('20261102', 'njardvik_w_korfubolt_7e2aa152_microdose_templates_week_20261102', array[]::text[]),
      ('20261109', 'njardvik_w_korfubolt_852aac57_microdose_templates_week_20261109', array[]::text[]),
      ('20261116', 'njardvik_w_korfubolt_7c2cdcc3_microdose_templates_week_20261116', array[]::text[]),
      ('20261123', 'njardvik_w_korfubolt_872f2cab_microdose_templates_week_20261123', array[]::text[]),
      ('20261130', 'njardvik_w_korfubolt_0e323fc7_microdose_templates_week_20261130', array['MIÐ','FÖS','SUN'])
    ) as t(week, new_name, md_days)
  loop
    if length(m.new_name) > 63 then
      raise exception 'New name is too long: %', m.new_name;
    end if;
    perform public.create_custom_microdose_table(m.new_name);

    if cardinality(m.md_days) > 0 then
      execute format(
        'insert into public.%I (team_id, md_day, readiness_level, title, description, structure, variant, season_phase, created_at)
         select team_id, md_day, readiness_level, title, description, structure, variant, season_phase, created_at
         from public.%I
         where team_id = $1 and md_day = any($2)',
        m.new_name, v_archive
      ) using v_team, m.md_days;
      get diagnostics v_rows = row_count;
      if v_rows <> cardinality(m.md_days) * 4 then
        raise exception 'Expected % rows for week %, found %', cardinality(m.md_days) * 4, m.week, v_rows;
      end if;
    end if;

    update public.custom_template_sets
    set table_name = m.new_name
    where team_id = v_team and table_name = v_old_prefix || m.week;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'Expected one set for week %, found %', m.week, v_rows;
    end if;
  end loop;
end $$;

comment on table public.njardvik_w_korfubolti_basketball_konur_microdose_templates_week is
  'Archive, not read by the app. Seven week names were truncated into this one table until 2026-11-09. Holds the last save only. Drop once the coach has confirmed each week.';

-- 3) A name Postgres would cut can no longer be recorded.
alter table public.custom_template_sets
  add constraint custom_template_sets_table_name_fits check (char_length(table_name) <= 63),
  add constraint custom_template_sets_parent_table_name_fits check (parent_table_name is null or char_length(parent_table_name) <= 63);
