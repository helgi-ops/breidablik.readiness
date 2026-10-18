-- The 3-arg save_custom_template_records(text,uuid,jsonb) overload is redundant and buggy: the 4-arg
-- version already defaults p_season_phase to 'inseason', so a 3-named-arg call was AMBIGUOUS (Postgres
-- "could not choose the best candidate function") and the 3-arg's ON CONFLICT never matched the real
-- unique index (which includes season_phase). Drop it so only the correct 4-arg function remains.
DROP FUNCTION IF EXISTS public.save_custom_template_records(p_table_name text, p_team_id uuid, p_records jsonb);
